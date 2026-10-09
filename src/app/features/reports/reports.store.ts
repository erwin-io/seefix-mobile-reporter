import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, firstValueFrom } from 'rxjs';
import { SessionStore } from '../../core/auth/session.store';
import { AppError, mapHttpError } from '../../core/http/api-error.mapper';
import { AppResumeService } from '../../core/lifecycle/app-resume.service';
import { ActiveReportDto, ReportSummary } from '../../core/models/report.model';
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
  private readonly _items = signal<ReportSummary[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<AppError | null>(null);
  private readonly _lastFetchedAt = signal<number | null>(null);
  private readonly _limit = signal(DEFAULT_REPORT_LIMIT);
  private readonly _eligibility = signal<SubmitEligibility>('unknown');
  private readonly _activeReport = signal<ActiveReportDto | null>(null);
  private inFlight: Subscription | null = null;
  private eligibilityRequest: Promise<boolean | null> | null = null;

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

  constructor() {
    this.session.registerReset(() => this.reset());
    inject(AppResumeService)
      .resumed$.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => {
        if (this.session.isAuthenticated()) void this.refreshEligibility();
      });
  }

  /** Loads unless the cached list is still fresh. */
  loadIfStale(): Promise<void> {
    const last = this._lastFetchedAt();
    if (last !== null && Date.now() - last < FRESH_FOR_MS) return Promise.resolve();
    return this.refresh();
  }

  /** Re-fetches; keeps previous items visible until the response arrives. */
  refresh(): Promise<void> {
    this.inFlight?.unsubscribe();
    this._loading.set(true);
    this._error.set(null);
    return new Promise<void>((resolve) => {
      this.inFlight = this.api.listMine(this._limit()).subscribe({
        next: (items) => {
          this._items.set(items);
          this._lastFetchedAt.set(Date.now());
        },
        error: (error: unknown) => {
          this._error.set(mapHttpError(error));
          this._loading.set(false);
          resolve();
        },
        complete: () => {
          this._loading.set(false);
          resolve();
        },
      });
    });
  }

  /**
   * Asks the server whether a new report may be submitted. Resolves `canSubmit`,
   * or `null` when the check failed (state becomes `error`, i.e. blocked with Retry).
   * The last known state stays visible while a re-check is in flight.
   */
  refreshEligibility(): Promise<boolean | null> {
    if (this.eligibilityRequest) return this.eligibilityRequest;
    const state = this._eligibility();
    if (state === 'unknown' || state === 'error') this._eligibility.set('loading');
    this.eligibilityRequest = firstValueFrom(this.api.getActive())
      .then((response) => {
        this._activeReport.set(response.canSubmit ? null : response.activeReport);
        this._eligibility.set(response.canSubmit ? 'allowed' : 'blocked');
        return response.canSubmit;
      })
      .catch(() => {
        // Fail closed: never presume the slot is free when the check did not succeed.
        this._eligibility.set('error');
        return null;
      })
      .finally(() => {
        this.eligibilityRequest = null;
      });
    return this.eligibilityRequest;
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

  /** Marks the cache stale, e.g. after a new submission. */
  invalidate(): void {
    this._lastFetchedAt.set(this._items().length ? 0 : null);
  }

  reset(): void {
    this.inFlight?.unsubscribe();
    this.inFlight = null;
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
