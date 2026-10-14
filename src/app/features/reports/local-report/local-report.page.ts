import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnDestroy, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular';
import { SessionStore } from '../../../core/auth/session.store';
import { ConnectivityService } from '../../../core/connectivity/connectivity.service';
import { ConnectivityBannerComponent } from '../../../shared/components/connectivity-banner/connectivity-banner.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { locationText } from '../../../shared/formatters/report-status-label';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { ReportDraftStore, draftEntriesFor } from '../new-report/report-draft.store';
import { deliveryStatus, photoCountText } from '../outbox/delivery-status';
import { OutboxItem, ReportOutboxStore } from '../outbox/report-outbox.store';
import { ReportSyncService } from '../outbox/report-sync.service';

/**
 * A report saved on this phone and not received by SEEFIX yet: original photos, capture time, delivery status, and
 * what the Reporter can do (send now, resolve a conflict, edit, discard). It becomes the server report once sent.
 */
@Component({
  selector: 'app-local-report',
  templateUrl: 'local-report.page.html',
  styleUrls: ['local-report.page.scss'],
  imports: [
    DatePipe,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonCard,
    IonCardContent,
    IonButton,
    IonIcon,
    ConnectivityBannerComponent,
    EmptyStateComponent,
  ],
})
export class LocalReportPage implements OnDestroy {
  private readonly outbox = inject(ReportOutboxStore);
  private readonly sync = inject(ReportSyncService);
  private readonly draft = inject(ReportDraftStore);
  private readonly session = inject(SessionStore);
  private readonly connectivity = inject(ConnectivityService);
  private readonly confirm = inject(ConfirmService);
  private readonly nav = inject(NavController);

  /** Bound from the `:id` route param (the report's clientReportId). */
  readonly id = input.required<string>();

  readonly item = computed(() => this.outbox.items().find((current) => current.id === this.id()) ?? null);
  readonly status = computed(() => {
    const item = this.item();
    return item ? deliveryStatus(item) : null;
  });
  readonly location = computed(() => {
    const fields = this.item()?.fields;
    return fields ? (locationText([fields.building, fields.floor, fields.roomOrArea]) ?? (fields.locationId ? 'Selected facility location' : null)) : null;
  });
  readonly offline = computed(() => this.connectivity.state() === 'offline');
  readonly photoUrls = signal<string[]>([]);
  readonly busy = signal(false);
  readonly photoCount = photoCountText;
  private photosFor: string | null = null;

  constructor() {
    // Load the original photos once per report (object URLs are released on leave).
    effect(() => {
      const item = this.item();
      if (item && item.id !== this.photosFor) untracked(() => void this.loadPhotos(item));
    });
    // Sent while this page is open (or before an old link was opened): show the server report instead.
    this.sync.sent$.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((event) => {
      if (event.id === this.id()) void this.nav.navigateForward(['/reports', event.report.id], { replaceUrl: true });
    });
    effect(() => {
      const delivered = this.sync.delivered.get(this.id());
      if (delivered && !this.item()) untracked(() => void this.nav.navigateForward(['/reports', delivered.id], { replaceUrl: true }));
    });
  }

  ngOnDestroy(): void {
    this.photoUrls().forEach((url) => URL.revokeObjectURL(url));
  }

  sendNow(): void {
    void this.sync.syncNow(true);
  }

  openMyReports(): void {
    void this.nav.navigateRoot('/tabs/reports');
  }

  /** After the other active report was resolved or cancelled: send this one again. */
  async tryAgain(item: OutboxItem): Promise<void> {
    const userId = this.session.user()?.id;
    if (!userId) return;
    await this.outbox.update(userId, { ...item, state: 'waiting', reason: null, activeReport: null, nextAttemptAt: null });
    void this.sync.syncNow(true);
  }

  viewActiveReport(item: OutboxItem): void {
    if (item.activeReport) void this.nav.navigateForward(['/reports', item.activeReport.id]);
  }

  /** Back to the New Report form with everything (one transaction), e.g. to fix what SEEFIX rejected. */
  async edit(item: OutboxItem): Promise<void> {
    const userId = this.session.user()?.id;
    if (!userId || this.busy()) return;
    this.busy.set(true);
    const release = await this.sync.pause();
    try {
      const draftKeys = await this.draft.seal();
      await this.outbox.returnToDraft(userId, item, async (photos) => draftEntriesFor(item, photos), draftKeys);
      this.draft.open();
      await this.nav.navigateForward('/reports/new', { replaceUrl: true });
    } finally {
      release();
      this.busy.set(false);
    }
  }

  async discard(item: OutboxItem): Promise<void> {
    const userId = this.session.user()?.id;
    if (!userId || this.busy()) return;
    const confirmed = await this.confirm.confirm({
      header: 'Discard this report?',
      message: "It is deleted from this phone and won't be sent to SEEFIX.",
      confirmText: 'Discard',
      destructive: true,
    });
    if (!confirmed) return;
    this.busy.set(true);
    const release = await this.sync.pause();
    try {
      await this.outbox.remove(userId, item);
      await this.nav.navigateBack('/tabs/home');
    } finally {
      release();
      this.busy.set(false);
    }
  }

  private async loadPhotos(item: OutboxItem): Promise<void> {
    const userId = this.session.user()?.id;
    if (!userId) return;
    this.photosFor = item.id;
    const urls: string[] = [];
    for (const index of item.photos.keys()) {
      const blob = await this.outbox.photo(userId, item.id, index).catch(() => null);
      if (blob) urls.push(URL.createObjectURL(blob));
    }
    this.photoUrls().forEach((url) => URL.revokeObjectURL(url));
    this.photoUrls.set(urls);
  }
}
