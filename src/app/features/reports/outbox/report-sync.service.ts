import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, firstValueFrom } from 'rxjs';
import { SessionStore } from '../../../core/auth/session.store';
import { ConnectivityService } from '../../../core/connectivity/connectivity.service';
import { AppError, mapHttpError } from '../../../core/http/api-error.mapper';
import { DirectUploadService, SignedUpload } from '../../../core/http/direct-upload.service';
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
/** Server codes meaning "these uploaded photos can't be used": upload them again from the phone. */
const REUPLOAD_CODES = new Set(['UPLOAD_NOT_FOUND', 'UPLOAD_ALREADY_USED', 'UPLOAD_NOT_ALLOWED']);

export interface SendProgress {
  id: string;
  uploaded: number;
  total: number;
}

/** A Cloudinary upload failed (as opposed to the seefix-api request). */
class UploadStepError extends Error {
  constructor(readonly appError: AppError) {
    super(appError.userMessage);
  }
}

/**
 * Sends saved reports to SEEFIX: photos not yet uploaded go to Cloudinary (each public ID is saved the moment it
 * returns), then POST /api/reports with the report's `clientReportId`, so a repeat never creates a second report.
 * Runs while the app is open: on start, sign-in, back online / back in front, "Send now", and on a backoff timer.
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
  private running: Promise<void> | null = null;
  private rerun = false;
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
  }

  /** Sends every waiting report that is due (all of them with `force`). One run at a time. */
  syncNow(force = false): Promise<void> {
    if (this.running) {
      this.rerun ||= force;
      return this.running;
    }
    this.running = this.run(force).finally(() => {
      this.running = null;
      if (this.rerun) {
        this.rerun = false;
        void this.syncNow(true);
      }
    });
    return this.running;
  }

  private async run(force: boolean): Promise<void> {
    this.clearTimer();
    await this.store.ready();
    for (const item of this.store.items()) {
      if (!this.session.isAuthenticated()) return;
      if (item.state !== 'waiting') continue;
      if (this.connectivity.state() === 'offline') {
        if (item.reason !== 'offline') await this.store.update({ ...item, reason: 'offline' });
        continue;
      }
      if (!force && item.nextAttemptAt !== null && item.nextAttemptAt > Date.now()) continue;
      await this.send(item);
    }
    this.scheduleNext();
  }

  private async send(start: OutboxItem): Promise<void> {
    let item: OutboxItem = { ...start, state: 'sending' };
    await this.store.update(item);
    try {
      let signed: SignedUpload | null = null;
      for (const [index, photo] of item.photos.entries()) {
        if (photo.publicId) continue;
        this._progress.set({ id: item.id, uploaded: index, total: item.photos.length });
        signed ??= await firstValueFrom(this.uploads.sign('report-image'));
        const blob = await this.store.photo(item.id, index);
        const publicId = await firstValueFrom(this.uploads.send(signed, { blob, fileName: photo.fileName })).catch(
          (error: unknown) => {
            throw new UploadStepError(mapHttpError(error));
          },
        );
        item = { ...item, photos: item.photos.map((p, i) => (i === index ? { ...p, publicId } : p)) };
        await this.store.update(item);
      }
      this._progress.set({ id: item.id, uploaded: item.photos.length, total: item.photos.length });

      const report = await firstValueFrom(
        this.api.createFromUploads(
          item.fields,
          item.photos.map((photo) => photo.publicId as string),
          { clientReportId: item.id, imageDigests: item.photos.map((photo) => photo.digest) },
        ),
      );
      await this.store.remove(item.id);
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
      await this.store.update(this.afterFailure(item, error));
    } finally {
      this._progress.set(null);
    }
  }

  /** Retry vs stop (plan v3, section 6). */
  private afterFailure(item: OutboxItem, error: unknown): OutboxItem {
    const uploadStep = error instanceof UploadStepError;
    const appError = uploadStep ? error.appError : mapHttpError(error);
    const base = { ...item, state: 'waiting' as const, message: null, activeReport: null };

    if (appError.kind === 'UNAUTHORIZED') {
      // The session ended (handled globally); the report stays for this Reporter's next sign-in.
      return { ...base, reason: 'session', nextAttemptAt: null };
    }
    if (appError.code === 'ACTIVE_REPORT_EXISTS') {
      return { ...base, state: 'blocked', reason: null, activeReport: toActiveReport(appError.details?.['activeReport']) };
    }
    if (appError.code && REUPLOAD_CODES.has(appError.code) && item.reuploads < MAX_REUPLOADS) {
      // The server can't use the uploaded copies (expired, cleaned up or already taken): upload the originals again.
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
      return {
        ...base,
        reason: this.reasonFor(appError, uploadStep),
        attempts,
        nextAttemptAt: Date.now() + RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)],
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

  private scheduleNext(): void {
    const due = this.store
      .items()
      .filter((item) => item.state === 'waiting' && item.nextAttemptAt !== null)
      .map((item) => item.nextAttemptAt as number);
    if (!due.length || this.connectivity.state() === 'offline') return; // back online triggers a run
    this.timer = setTimeout(() => void this.syncNow(), Math.max(0, Math.min(...due) - Date.now()));
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}

/** No response, a timeout, 5xx or 429: worth trying again later. */
function isTemporary(error: AppError): boolean {
  return ['OFFLINE', 'TIMEOUT', 'SERVER', 'RATE_LIMITED', 'UNKNOWN'].includes(error.kind);
}
