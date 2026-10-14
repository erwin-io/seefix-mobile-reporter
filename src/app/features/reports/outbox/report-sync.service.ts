import { HttpContext } from '@angular/common/http';
import { DestroyRef, Injectable, Injector, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionStore } from '../../../core/auth/session.store';
import { ConnectivityService } from '../../../core/connectivity/connectivity.service';
import { AppError, mapHttpError } from '../../../core/http/api-error.mapper';
import { ApiRequestOptions } from '../../../core/http/api-client.service';
import { DirectUploadService, SignedUpload } from '../../../core/http/direct-upload.service';
import { SKIP_AUTH, SKIP_UNAUTHORIZED_HANDLER } from '../../../core/http/http-context.tokens';
import { AppResumeService } from '../../../core/lifecycle/app-resume.service';
import { CreateReportResponse } from '../../../core/models/report.model';
import { NotificationsStore } from '../../notifications/notifications.store';
import { toActiveReport } from '../report.mapper';
import { ReportsApiService } from '../reports.api.service';
import { ReportsStore } from '../reports.store';
import { OutboxItem, OutboxReason, ReportOutboxStore } from './report-outbox.store';

/** Wait before retry n (by attempt count) while the app is open; "back online" and "Send now" skip it. */
export const RETRY_BACKOFF_MS = [15_000, 30_000, 60_000, 120_000, 300_000];
/** After this many fresh uploads the server still can't use, stop and ask the Reporter. */
const MAX_REUPLOADS = 2;
/**
 * Server codes meaning "these uploaded photos can't be used": upload them again from the phone.
 * Accepted deviation from plan v3 (owner, Oct 14): all of the report's photos are re-uploaded, not only the
 * affected one, because these errors don't say which upload failed; it is rare and at most 5 photos.
 */
const REUPLOAD_CODES = new Set(['UPLOAD_NOT_FOUND', 'UPLOAD_ALREADY_USED', 'UPLOAD_NOT_ALLOWED']);

export interface SendProgress {
  id: string;
  uploaded: number;
  total: number;
}

/** The Reporter, token and session a send started under. */
interface Pin {
  userId: string;
  token: string;
  generation: number;
}

/** A Cloudinary upload failed (as opposed to the seefix-api request). */
class UploadStepError extends Error {
  constructor(readonly appError: AppError) {
    super(appError.userMessage);
  }
}

/** The account changed while sending: stop, write nothing, and leave the report for its own Reporter. */
class SessionChangedError extends Error {}

/**
 * Sends saved reports to SEEFIX: photos not yet uploaded go to Cloudinary (each public ID is saved the moment it
 * returns), then POST /api/reports with the report's `clientReportId`, so a repeat never creates a second report.
 * Every send is pinned to the Reporter, token and session it started under. Runs while the app is open: on start,
 * sign-in, back online / back in front, connectivity recovering, "Send now", and on a backoff timer.
 */
@Injectable({ providedIn: 'root' })
export class ReportSyncService {
  private readonly store = inject(ReportOutboxStore);
  private readonly api = inject(ReportsApiService);
  private readonly uploads = inject(DirectUploadService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly session = inject(SessionStore);
  private readonly reports = inject(ReportsStore);
  private readonly notifications = inject(NotificationsStore);
  private readonly injector = inject(Injector);
  private running: Promise<void> | null = null;
  private followUp: Promise<void> | null = null;
  private followUpForce = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  private readonly _progress = signal<SendProgress | null>(null);
  readonly progress = this._progress.asReadonly();
  /** A saved report SEEFIX has now received. */
  readonly sent$ = new Subject<{ id: string; report: CreateReportResponse }>();

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.clearTimer());
    inject(AppResumeService)
      .resumed$.pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => void this.syncNow(true));
    // Sign-in (or the same Reporter signing in again after an expired session): send what is waiting.
    effect(() => {
      if (this.session.isAuthenticated() && this.session.user()?.id) untracked(() => void this.syncNow());
    });
    // SEEFIX reachable again after "offline" or "server down" (the banner clearing): try at once.
    let previous = this.connectivity.state();
    effect(() => {
      const state = this.connectivity.state();
      const recovered = (previous === 'offline' || previous === 'server-down') && state !== 'offline' && state !== 'server-down';
      previous = state;
      if (recovered) untracked(() => void this.syncNow(true));
    });
  }

  /** Sends every waiting report that is due (all of them with `force`). One run at a time; a call during a run gets the next one. */
  syncNow(force = false): Promise<void> {
    if (this.running) {
      this.followUpForce ||= force;
      this.followUp ??= this.running.then(() => {
        const nextForce = this.followUpForce;
        this.followUp = null;
        this.followUpForce = false;
        return this.syncNow(nextForce);
      });
      return this.followUp;
    }
    this.running = this.run(force).finally(() => (this.running = null));
    return this.running;
  }

  private async run(force: boolean): Promise<void> {
    this.clearTimer();
    const pin = this.pin();
    if (!pin) return;
    for (const item of await this.store.itemsFor(pin.userId)) {
      if (!this.isCurrent(pin)) return;
      if (item.state !== 'waiting') continue;
      if (this.connectivity.state() === 'offline') {
        if (item.reason !== 'offline') await this.store.update(pin.userId, { ...item, reason: 'offline' });
        continue;
      }
      if (!force && item.nextAttemptAt !== null && item.nextAttemptAt > Date.now()) continue;
      try {
        await this.send(pin, item);
      } catch (error) {
        if (error instanceof SessionChangedError) return;
        throw error;
      }
    }
    if (this.isCurrent(pin)) this.scheduleNext();
  }

  private async send(pin: Pin, start: OutboxItem): Promise<void> {
    const auth = pinnedAuth(pin);
    let item: OutboxItem = { ...start, state: 'sending' };
    await this.store.update(pin.userId, item);
    try {
      let signed: SignedUpload | null = null;
      for (const [index, photo] of item.photos.entries()) {
        if (photo.publicId) continue;
        this._progress.set({ id: item.id, uploaded: index, total: item.photos.length });
        this.check(pin);
        signed ??= await firstValueFrom(this.uploads.sign('report-image', auth));
        const blob = await this.store.photo(pin.userId, item.id, index);
        this.check(pin);
        const publicId = await firstValueFrom(this.uploads.send(signed, { blob, fileName: photo.fileName })).catch(
          (error: unknown) => {
            throw new UploadStepError(mapHttpError(error));
          },
        );
        this.check(pin);
        item = { ...item, photos: item.photos.map((p, i) => (i === index ? { ...p, publicId } : p)) };
        await this.store.update(pin.userId, item);
      }
      this._progress.set({ id: item.id, uploaded: item.photos.length, total: item.photos.length });

      this.check(pin);
      const report = await firstValueFrom(
        this.api.createFromUploads(
          item.fields,
          item.photos.map((photo) => photo.publicId as string),
          { clientReportId: item.id, imageDigests: item.photos.map((photo) => photo.digest) },
          auth,
        ),
      );
      // Received under the old session: the server has it (a later retry is an idempotent replay); write nothing.
      this.check(pin);
      await this.store.remove(pin.userId, item);
      this.reports.markBlocked({
        id: report.id,
        reportNo: report.reportNo,
        status: report.status,
        agentStatus: report.agentStatus,
        createdAt: report.createdAt,
      });
      this.reports.invalidate();
      void this.notifications.refresh();
      this.sent$.next({ id: item.id, report });
    } catch (error) {
      if (error instanceof SessionChangedError || !this.isCurrent(pin)) throw new SessionChangedError();
      const next = this.afterFailure(item, error);
      await this.store.update(pin.userId, next);
      if (next.reason === 'session') {
        // This Reporter's token was refused: end that session (the report stays for their next sign-in).
        void this.injector.get(AuthService).handleSessionEnded('SESSION_EXPIRED');
      }
    } finally {
      this._progress.set(null);
    }
  }

  /** Retry vs stop (plan v3, section 6). */
  private afterFailure(item: OutboxItem, error: unknown): OutboxItem {
    const uploadStep = error instanceof UploadStepError;
    const appError = uploadStep ? error.appError : mapHttpError(error);
    const base = { ...item, state: 'waiting' as const, message: null, activeReport: null };

    if (appError.kind === 'UNAUTHORIZED' && !uploadStep) {
      return { ...base, reason: 'session', nextAttemptAt: null };
    }
    if (appError.code === 'ACTIVE_REPORT_EXISTS') {
      return { ...base, state: 'blocked', reason: null, activeReport: toActiveReport(appError.details?.['activeReport']) };
    }
    if (appError.code && REUPLOAD_CODES.has(appError.code) && item.reuploads < MAX_REUPLOADS) {
      return {
        ...base,
        reason: 'upload',
        photos: item.photos.map((photo) => ({ ...photo, publicId: null })),
        reuploads: item.reuploads + 1,
        nextAttemptAt: Date.now(),
      };
    }
    if (isTemporary(appError)) {
      const attempts = item.attempts + 1;
      const backoff = RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)];
      return {
        ...base,
        reason: this.reasonFor(appError, uploadStep),
        attempts,
        // 429: the server's Retry-After wins when it asks for a longer wait.
        nextAttemptAt: Date.now() + Math.max(backoff, appError.retryAfterMs ?? 0),
      };
    }
    // Validation, CLIENT_REPORT_ID_CONFLICT, a photo Cloudinary rejects, ...: the Reporter has to decide.
    return { ...base, state: 'attention', reason: null, message: appError.userMessage, nextAttemptAt: null };
  }

  private reasonFor(error: AppError, uploadStep: boolean): OutboxReason {
    if (error.kind === 'RATE_LIMITED') return 'busy';
    const state = this.connectivity.state();
    if (state === 'offline') return 'offline';
    if (uploadStep) return 'upload';
    if (state === 'slow' || error.kind === 'TIMEOUT') return 'slow';
    return 'server';
  }

  private pin(): Pin | null {
    const userId = this.session.user()?.id;
    const token = this.session.accessToken();
    if (!this.session.isAuthenticated() || !userId || !token) return null;
    return { userId, token, generation: this.session.generation };
  }

  private isCurrent(pin: Pin): boolean {
    return (
      this.session.generation === pin.generation &&
      this.session.user()?.id === pin.userId &&
      this.session.accessToken() === pin.token
    );
  }

  private check(pin: Pin): void {
    if (!this.isCurrent(pin)) throw new SessionChangedError();
  }

  private scheduleNext(): void {
    const due = this.store
      .items()
      .filter((item) => item.state === 'waiting' && item.nextAttemptAt !== null)
      .map((item) => item.nextAttemptAt as number);
    if (!due.length || this.connectivity.state() === 'offline') return; // recovering connectivity triggers a run
    this.timer = setTimeout(() => void this.syncNow(), Math.max(0, Math.min(...due) - Date.now()));
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}

/**
 * The pinned Reporter's own token, never whoever is signed in when the request goes out. A 401 is handled here
 * (not by the global handler), so a late answer for one account can never end another account's session.
 */
function pinnedAuth(pin: Pin): ApiRequestOptions {
  return {
    context: new HttpContext().set(SKIP_AUTH, true).set(SKIP_UNAUTHORIZED_HANDLER, true),
    headers: { Authorization: `Bearer ${pin.token}` },
  };
}

/** No response, a timeout, 5xx or 429: worth trying again later. */
function isTemporary(error: AppError): boolean {
  return ['OFFLINE', 'TIMEOUT', 'SERVER', 'RATE_LIMITED', 'UNKNOWN'].includes(error.kind);
}
