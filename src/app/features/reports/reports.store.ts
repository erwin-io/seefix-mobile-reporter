import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { SessionStore } from '../../core/auth/session.store';
import { AppError, mapHttpError } from '../../core/http/api-error.mapper';
import { AppResumeService } from '../../core/lifecycle/app-resume.service';
import { ActiveReportDto, ReportSummary } from '../../core/models/report.model';
import { LatestRequest } from '../../shared/utils/latest-request';
import { ReportOutboxStore } from './outbox/report-outbox.store';
import { REPORT_LIST_MAX, ReportsApiService } from './reports.api.service';

export const DEFAULT_REPORT_LIMIT = 30;
const FRESH_FOR_MS = 30_000;

/**
 * Whether the Reporter may submit a new report (one active report per account).
 * `unknown`/`loading`/`error` fail closed: the app never assumes submission is allowed.
 */
export type SubmitEligibility = 'unknown' | 'loading' | 'allowed' | 'blocked' | 'error';

/** The Reporter's own report summaries and submit eligibility, shared by Home, My Reports and New Report (memory only). */
@Injectable({ providedIn: 'root' })
export class ReportsStore {
  private readonly api = inject(ReportsApiService);
  private readonly session = inject(SessionStore);
  private readonly outbox = inject(ReportOutboxStore);
  private readonly _items = signal<ReportSummary[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<AppError | null>(null);
  private readonly _lastFetchedAt = signal<number | null>(null);
  private readonly _limit = signal(DEFAULT_REPORT_LIMIT);
  private readonly _eligibility = signal<SubmitEligibility>('unknown');
  private readonly _activeReport = signal<ActiveReportDto | null>(null);
  private readonly listRequest = new LatestRequest<ReportSummary[]>();
  private eligibilityRequest: Promise<boolean | null> | null = null;
  /** Bumped on every session reset (sign-out, expiry, account switch). */
  private generation = 0;

  readonly items = this._items.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly limit = this._limit.asReadonly();
  readonly loaded = computed(() => this._lastFetchedAt() !== null);
  /** True when the list may be truncated by the current limit. */
  readonly mayHaveMore = computed(() => this._items().length >= this._limit());
  readonly canLoadMore = computed(() => this.mayHaveMore() && this._limit() < REPORT_LIST_MAX);

  readonly eligibility = this._eligibility.asReadonly();
  readonly activeReport = this._activeReport.asReadonly();
  readonly canSubmit = computed(() => this._eligibility() === 'allowed');
  /**
   * A new report may be started: the server allows it, or can't be asked right now (it is then saved on the phone
   * and the server decides when it is sent; plan D7), and no earlier report is still waiting on this phone.
   */
  readonly canStartReport = computed(
    () => !this.outbox.hasUnsent() && (this._eligibility() === 'allowed' || this._eligibility() === 'error'),
  );

  constructor() {
    this.session.registerReset(() => this.reset());
    inject(AppResumeService)
      .resumed$.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => {
        if (!this.session.isAuthenticated()) return;
        void this.refreshEligibility();
        // Statuses may have changed on the server while the app was in the background or offline.
        if (this.loaded()) void this.refresh();
      });
  }

  /** Loads unless the cached list is still fresh. */
  loadIfStale(): Promise<void> {
    const last = this._lastFetchedAt();
    if (last !== null && Date.now() - last < FRESH_FOR_MS) return Promise.resolve();
    return this.refresh();
  }

  /**
   * Re-fetches; keeps previous items visible until the response arrives. A newer refresh (navigation, submission,
   * app resume) replaces an older one, and every caller resolves when the latest one finishes.
   */
  refresh(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    return this.listRequest
      .run(
        this.api.listMine(this._limit()),
        (items) => {
          this._items.set(items);
          this._lastFetchedAt.set(Date.now());
        },
        (error) => this._error.set(mapHttpError(error)),
      )
      .then(() => {
        if (!this.listRequest.busy) this._loading.set(false);
      });
  }

  /**
   * Asks the server whether a new report may be submitted. Resolves `canSubmit`,
   * or `null` when the check failed (state becomes `error`, i.e. blocked with Retry).
   * The last known state stays visible while a re-check is in flight.
   * A response that arrives after a sign-out or an account switch is discarded (resolves `null`).
   */
  refreshEligibility(): Promise<boolean | null> {
    if (this.eligibilityRequest) return this.eligibilityRequest;
    const generation = this.generation;
    const state = this._eligibility();
    if (state === 'unknown' || state === 'error') this._eligibility.set('loading');
    const request: Promise<boolean | null> = firstValueFrom(this.api.getActive())
      .then((response) => {
        if (generation !== this.generation) return null;
        this._activeReport.set(response.canSubmit ? null : response.activeReport);
        this._eligibility.set(response.canSubmit ? 'allowed' : 'blocked');
        return response.canSubmit;
      })
      .catch(() => {
        if (generation !== this.generation) return null;
        // Fail closed: never presume the slot is free when the check did not succeed.
        this._eligibility.set('error');
        return null;
      })
      .finally(() => {
        if (this.eligibilityRequest === request) this.eligibilityRequest = null;
      });
    this.eligibilityRequest = request;
    return request;
  }

  /** After a successful submission or a 409 ACTIVE_REPORT_EXISTS. */
  markBlocked(report: ActiveReportDto | null): void {
    this._activeReport.set(report);
    this._eligibility.set('blocked');
  }

  /** Explicit "Show up to 100 recent reports" option; there is no deeper history API. */
  loadMaximum(): Promise<void> {
    this._limit.set(REPORT_LIST_MAX);
    return this.refresh();
  }

  /**
   * After a submission or a status change. A list that is already shown is re-fetched now: Home and My Reports are
   * tabs and may not get ionViewWillEnter when the user returns from a page outside the tabs.
   */
  invalidate(): void {
    if (!this.loaded()) return; // never shown: the next page entry loads it
    this._lastFetchedAt.set(0); // stays stale if this re-fetch fails
    void this.refresh();
  }

  reset(): void {
    this.generation += 1; // responses for the previous account are discarded
    this.listRequest.cancel();
    this._items.set([]);
    this._loading.set(false);
    this._error.set(null);
    this._lastFetchedAt.set(null);
    this._limit.set(DEFAULT_REPORT_LIMIT);
    this._eligibility.set('unknown');
    this._activeReport.set(null);
    this.eligibilityRequest = null;
  }
}
