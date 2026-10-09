import { Component, computed, inject, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonList,
  IonNote,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
  RefresherCustomEvent,
  ViewWillEnter,
} from '@ionic/angular';
import { AppResumeService } from '../../../core/lifecycle/app-resume.service';
import { ReportSummary } from '../../../core/models/report.model';
import { ActiveReportBannerComponent } from '../../../shared/components/active-report-banner/active-report-banner.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { NotificationBellComponent } from '../../../shared/components/notification-bell/notification-bell.component';
import { ReportFabComponent } from '../../../shared/components/report-fab/report-fab.component';
import { ReportListItemComponent } from '../../../shared/components/report-list-item/report-list-item.component';
import { StatusGroup, statusMeta } from '../../../shared/formatters/report-status-label';
import { NotificationsStore } from '../../notifications/notifications.store';
import { ReportsStore } from '../../reports/reports.store';

export type ReportFilter = 'all' | StatusGroup;

/** Grouped filters are applied client-side; the API only filters by one exact status. */
export function filterReports(items: ReportSummary[], filter: ReportFilter, query: string): ReportSummary[] {
  const needle = query.trim().toLowerCase();
  return items.filter((report) => {
    if (filter !== 'all' && statusMeta(report.status).group !== filter) return false;
    if (!needle) return true;
    return [report.reportNo, report.summary, report.locationText, statusMeta(report.status).label]
      .filter((value): value is string => !!value)
      .some((value) => value.toLowerCase().includes(needle));
  });
}

/** Screen E — the Reporter's own submissions. */
@Component({
  selector: 'app-my-reports',
  templateUrl: 'my-reports.page.html',
  styleUrls: ['my-reports.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonList,
    IonButton,
    IonIcon,
    IonNote,
    NotificationBellComponent,
    ReportListItemComponent,
    ActiveReportBannerComponent,
    ReportFabComponent,
    EmptyStateComponent,
    LoadingStateComponent,
  ],
})
export class MyReportsPage implements ViewWillEnter {
  private readonly notifications = inject(NotificationsStore);
  readonly store = inject(ReportsStore);
  readonly online = inject(AppResumeService).isOnline;

  readonly filter = signal<ReportFilter>('all');
  readonly query = signal('');
  readonly visible = computed(() => filterReports(this.store.items(), this.filter(), this.query()));
  readonly isFiltered = computed(() => this.filter() !== 'all' || this.query().trim() !== '');

  ionViewWillEnter(): void {
    void this.store.loadIfStale();
    void this.store.refreshEligibility();
    void this.notifications.refresh();
  }

  async onRefresh(event: RefresherCustomEvent): Promise<void> {
    await Promise.all([this.store.refresh(), this.store.refreshEligibility()]);
    await event.target.complete();
  }

  onFilterChange(value: unknown): void {
    this.filter.set((value as ReportFilter) ?? 'all');
  }

  onSearch(value: string | null | undefined): void {
    this.query.set(value ?? '');
  }

  clearFilters(): void {
    this.filter.set('all');
    this.query.set('');
  }

  retry(): void {
    void this.store.refresh();
  }

  loadMaximum(): void {
    void this.store.loadMaximum();
  }
}
