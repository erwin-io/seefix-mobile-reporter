import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnDestroy, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AlertController,
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonImg,
  IonModal,
  IonRefresher,
  IonRefresherContent,
  IonSkeletonText,
  IonSpinner,

  IonThumbnail,
  IonTitle,
  IonToggle,
  IonToolbar,
  ModalController,
  RefresherCustomEvent,
  ViewWillEnter,
  ViewWillLeave,
} from '@ionic/angular';
import { Subscription } from 'rxjs';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { AppError, mapHttpError } from '../../../core/http/api-error.mapper';
import { AppResumeService } from '../../../core/lifecycle/app-resume.service';
import { ReportDetail } from '../../../core/models/report.model';
import { DetailCardComponent } from '../../../shared/components/detail-card/detail-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ReportStatusChipComponent } from '../../../shared/components/report-status-chip/report-status-chip.component';
import {
  REVIEW_DECISION_LABELS,
  humanize,
  isAgentActive,
  isAssessmentInProgress,
  screeningSourceLabel,
  statusLabel,
  statusMeta,
} from '../../../shared/formatters/report-status-label';
import { timelineStep } from '../../../shared/formatters/timeline-step';
import { SuccessScreenService } from '../../../shared/services/success-screen.service';
import { NotificationsStore } from '../../notifications/notifications.store';
import { ReportsApiService } from '../reports.api.service';
import { ReportsStore } from '../reports.store';
import { CancelReportSheetComponent, isCancelSheetError } from './cancel-report-sheet/cancel-report-sheet.component';

/** Business statuses before any human Maintenance Review decision. */
const PRE_REVIEW_STATUSES = new Set(['SUBMITTED', 'PENDING_REVIEW']);

/** Screen G — report details, screening, progress and timeline. Read-only. */
@Component({
  selector: 'app-report-detail',
  templateUrl: 'report-detail.page.html',
  styleUrls: ['report-detail.page.scss'],
  imports: [
    DatePipe,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonIcon,
    IonImg,
    IonThumbnail,
    IonSpinner,
    IonSkeletonText,
    IonToggle,
    IonModal,
    IonButton,
    IonBadge,
    DetailCardComponent,
    EmptyStateComponent,
    ReportStatusChipComponent,
  ],
})
export class ReportDetailPage implements ViewWillEnter, ViewWillLeave, OnDestroy {
  private readonly api = inject(ReportsApiService);
  private readonly lifecycle = inject(AppResumeService);
  private readonly reports = inject(ReportsStore);
  private readonly notifications = inject(NotificationsStore);
  private readonly modals = inject(ModalController);
  private readonly alerts = inject(AlertController);
  private readonly success = inject(SuccessScreenService);
  private readonly pollIntervalMs = inject(APP_ENVIRONMENT).agentPollIntervalMs;

  /** Bound from the `:id` route param. */
  readonly id = input.required<string>();

  readonly detail = signal<ReportDetail | null>(null);
  readonly loading = signal(false);
  readonly error = signal<AppError | null>(null);
  readonly showTechnical = signal(false);
  readonly viewerImage = signal<string | null>(null);
  private readonly pageVisible = signal(false);

  readonly meta = computed(() => statusMeta(this.detail()?.status));
  readonly isCancelled = computed(() => this.detail()?.status === 'CANCELLED');
  /** A cancelled report is final even if an old Agent attempt still reads PROCESSING: no spinner, no polling. */
  readonly agentActive = computed(() => isAssessmentInProgress(this.detail()?.status, this.detail()?.agentStatus));
  readonly isHumanScreening = computed(() => this.detail()?.screening.source === 'MAINTENANCE_REVIEW');
  /** The status card already explains a cancellation, so the screening card is not repeated. */
  readonly showScreeningCard = computed(() => !this.isHumanScreening() && !this.isCancelled());
  readonly cancelling = signal(false);
  /** After a human decision the AI screening is historical, not the current outcome. */
  readonly screeningIsHistorical = computed(() => {
    const report = this.detail();
    return !!report && !this.isHumanScreening() && !PRE_REVIEW_STATUSES.has(report.status);
  });
  readonly showReviewCard = computed(() => this.isHumanScreening() || !!this.detail()?.review);
  readonly reviewDecisionLabel = computed(() => {
    const decision = this.detail()?.review?.decision;
    return decision ? (REVIEW_DECISION_LABELS[decision] ?? humanize(decision)) : null;
  });
  readonly visibleTimeline = computed(() =>
    (this.detail()?.timeline ?? []).filter((event) => this.showTechnical() || event.kind !== 'AGENT'),
  );
  readonly hasTechnicalEvents = computed(() => (this.detail()?.timeline ?? []).some((event) => event.kind === 'AGENT'));

  private loadSub: Subscription | null = null;
  private pollSub: Subscription | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Poll agent-status only while AI is pending/processing, the page is visible and the app is foregrounded.
    effect(() => {
      const shouldPoll = this.agentActive() && this.pageVisible() && this.lifecycle.isForeground();
      if (shouldPoll) this.startPolling();
      else this.stopPolling();
    });

    this.lifecycle.resumed$.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(() => {
      if (this.pageVisible()) this.load(true);
    });
  }

  ionViewWillEnter(): void {
    this.pageVisible.set(true);
    this.load(this.detail() !== null);
  }

  ionViewWillLeave(): void {
    this.pageVisible.set(false);
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.loadSub?.unsubscribe();
  }

  async onRefresh(event: RefresherCustomEvent): Promise<void> {
    this.load(true, () => void event.target.complete());
  }

  retry(): void {
    this.load(false);
  }

  /** Latest activity first; the top step is the current one. */
  readonly timelineSteps = computed(() =>
    [...this.visibleTimeline()].reverse().map((event) => ({ event, step: timelineStep(event) })),
  );
  readonly screeningSourceLabel = screeningSourceLabel;
  readonly statusLabel = statusLabel;

  errorTitle(error: AppError): string {
    if (error.kind === 'FORBIDDEN' || error.kind === 'NOT_FOUND') return 'Report unavailable';
    if (error.kind === 'OFFLINE') return "You're offline";
    return "Couldn't load this report";
  }

  /** Opens the reason sheet; on success shows the success screen and refreshes everything that depends on it. */
  async cancelReport(): Promise<void> {
    const report = this.detail();
    if (!report?.canCancel || this.cancelling()) return;
    this.cancelling.set(true);
    try {
      const sheet = await this.modals.create({
        component: CancelReportSheetComponent,
        componentProps: { reportId: report.id, reportNo: report.reportNo },
        breakpoints: [0, 0.75, 1],
        initialBreakpoint: 0.75,
        handle: true,
      });
      await sheet.present();
      const { data, role } = await sheet.onDidDismiss();

      if (role === 'cancelled') {
        this.stopPolling();
        this.detail.update((current) => (current ? { ...current, status: 'CANCELLED', canCancel: false } : current));
        this.afterReportStateChanged();
        await this.success.show({
          title: 'Report cancelled',
          message: `${report.reportNo} was cancelled. No maintenance work will start from it, and you can now submit a new report.`,
          actionText: 'Back to report',
        });
        this.load(true);
      } else if (role === 'conflict' && isCancelSheetError(data)) {
        // Review won the race (or the report is gone): show the server's state, never an optimistic Cancelled.
        this.load(true);
        this.afterReportStateChanged();
        const alert = await this.alerts.create({
          header: "Can't cancel this report",
          message: data.userMessage,
          buttons: ['OK'],
        });
        await alert.present();
      }
    } finally {
      this.cancelling.set(false);
    }
  }

  openImage(url: string): void {
    this.viewerImage.set(url);
  }

  closeImage(): void {
    this.viewerImage.set(null);
  }

  /** `silent` keeps current content visible while re-fetching. */
  private load(silent: boolean, done?: () => void): void {
    this.loadSub?.unsubscribe();
    if (!silent) this.loading.set(true);
    this.loadSub = this.api.getDetail(this.id()).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.error.set(null);
      },
      error: (error: unknown) => {
        this.error.set(mapHttpError(error));
        this.loading.set(false);
        done?.();
      },
      complete: () => {
        this.loading.set(false);
        done?.();
      },
    });
  }

  /** List, submit eligibility and inbox all depend on this report's state. */
  private afterReportStateChanged(): void {
    this.reports.invalidate();
    void this.reports.refreshEligibility();
    void this.notifications.refresh();
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.pollOnce(), this.pollIntervalMs);
  }

  private stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.pollSub?.unsubscribe();
    this.pollSub = null;
  }

  private pollOnce(): void {
    if (this.pollSub && !this.pollSub.closed) return;
    this.pollSub = this.api.getAgentStatus(this.id()).subscribe({
      next: (status) => {
        if (!isAgentActive(status.agentStatus) || status.businessStatus === 'CANCELLED') {
          // Terminal AI state or a cancelled report: reload the full report (business status may also have moved).
          this.load(true);
        } else {
          this.detail.update((detail) => (detail ? { ...detail, screening: status.screening } : detail));
        }
      },
      error: () => {
        // Transient polling failures are silent; the next tick retries.
      },
    });
  }
}
