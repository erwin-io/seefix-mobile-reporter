import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonRefresher,
  IonRefresherContent,
  IonTitle,
  IonToolbar,
  NavController,
  RefresherCustomEvent,
  ViewWillEnter,
} from '@ionic/angular';
import { SessionStore } from '../../../core/auth/session.store';
import { AppResumeService } from '../../../core/lifecycle/app-resume.service';
import { NotificationDto } from '../../../core/models/notification.model';
import { ActiveReportBannerComponent } from '../../../shared/components/active-report-banner/active-report-banner.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { NotificationBellComponent } from '../../../shared/components/notification-bell/notification-bell.component';
import { NotificationItemComponent } from '../../../shared/components/notification-item/notification-item.component';
import { ReportFabComponent } from '../../../shared/components/report-fab/report-fab.component';
import { ReportListItemComponent } from '../../../shared/components/report-list-item/report-list-item.component';
import { NotificationsStore } from '../../notifications/notifications.store';
import { NotificationNavigator } from '../../notifications/notification-navigation';
import { ReportsStore } from '../../reports/reports.store';

const RECENT_REPORTS = 3;
const RECENT_UPDATES = 3;

/** Screen D — Home. A brief starting point, deliberately not a dashboard. */
@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonButton,
    IonIcon,
    IonList,
    IonListHeader,
    IonLabel,
    IonNote,
    NotificationBellComponent,
    NotificationItemComponent,
    ReportListItemComponent,
    ActiveReportBannerComponent,
    ReportFabComponent,
    EmptyStateComponent,
    LoadingStateComponent,
  ],
})
export class HomePage implements ViewWillEnter {
  private readonly nav = inject(NavController);
  private readonly router = inject(Router);
  private readonly notificationNavigator = inject(NotificationNavigator);
  private readonly session = inject(SessionStore);
  readonly reports = inject(ReportsStore);
  readonly notifications = inject(NotificationsStore);
  readonly online = inject(AppResumeService).isOnline;

  readonly firstName = this.session.firstName;
  readonly recentReports = computed(() => this.reports.items().slice(0, RECENT_REPORTS));
  readonly recentUpdates = computed(() => this.notifications.items().slice(0, RECENT_UPDATES));

  ionViewWillEnter(): void {
    void this.reports.loadIfStale();
    void this.reports.refreshEligibility();
    void this.notifications.refresh();
  }

  async onRefresh(event: RefresherCustomEvent): Promise<void> {
    await Promise.all([this.reports.refresh(), this.reports.refreshEligibility(), this.notifications.refresh()]);
    await event.target.complete();
  }

  viewAllReports(): void {
    void this.router.navigateByUrl('/tabs/reports');
  }

  viewAllNotifications(): void {
    void this.nav.navigateForward('/notifications');
  }

  openUpdate(item: NotificationDto): void {
    void this.notificationNavigator.open(item);
  }

  retry(): void {
    void this.reports.refresh();
  }
}
