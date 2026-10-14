import { Component, computed, inject } from '@angular/core';
import {
  IonAvatar,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
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
import { AuthService, LocalDataNotDeletedError } from '../../../core/auth/auth.service';
import { SessionStore } from '../../../core/auth/session.store';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { ConnectivityBannerComponent } from '../../../shared/components/connectivity-banner/connectivity-banner.component';
import { NotificationBellComponent } from '../../../shared/components/notification-bell/notification-bell.component';
import { humanize } from '../../../shared/formatters/report-status-label';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { NotificationsStore } from '../../notifications/notifications.store';
import { ReportOutboxStore } from '../../reports/outbox/report-outbox.store';
import { ReportSyncService } from '../../reports/outbox/report-sync.service';

/** Screen L — account details, account/security actions (pushed pages) and Log Out. */
@Component({
  selector: 'app-profile',
  templateUrl: 'profile.page.html',
  styleUrls: ['profile.page.scss'],
  imports: [
    ConnectivityBannerComponent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonList,
    IonListHeader,
    IonItem,
    IonAvatar,
    IonBadge,
    IonLabel,
    IonNote,
    IonIcon,
    IonButton,
    NotificationBellComponent,
  ],
})
export class ProfilePage implements ViewWillEnter {
  private readonly auth = inject(AuthService);
  private readonly confirmService = inject(ConfirmService);
  private readonly outbox = inject(ReportOutboxStore);
  private readonly sync = inject(ReportSyncService);
  private readonly notifications = inject(NotificationsStore);
  readonly user = inject(SessionStore).user;
  readonly appVersion = inject(APP_ENVIRONMENT).appVersion;

  readonly initials = computed(() =>
    (this.user()?.fullName ?? '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join(''),
  );
  readonly roleLabel = computed(() => (this.user()?.role === 'REPORTER' ? 'Reporter' : humanize(this.user()?.role)));

  private readonly nav = inject(NavController);

  ionViewWillEnter(): void {
    void this.notifications.refresh();
    // Keep name/email status current after account changes made on other screens or devices.
    this.auth.refreshMe().catch(() => undefined);
  }

  open(path: string): void {
    void this.nav.navigateForward(path);
  }

  async onRefresh(event: RefresherCustomEvent): Promise<void> {
    try {
      await this.auth.refreshMe();
    } catch {
      // Keep the current details; a 401 is handled globally.
    }
    await event.target.complete();
  }

  async confirmLogout(): Promise<void> {
    // Reports saved on this phone and not sent yet are deleted by logging out: say so, and how many. Read them
    // from the phone first: right after an offline start or an account switch the list may still be loading.
    const userId = this.user()?.id;
    const unsent = userId ? (await this.outbox.itemsFor(userId)).length : 0;
    const confirmed = await this.confirmService.confirm(
      unsent > 0 || this.outbox.unavailable()
        ? {
            header: 'Delete unsent reports?',
            message: unsent
              ? `You have ${unsent === 1 ? 'a report' : `${unsent} reports`} saved on this phone that ` +
                `${unsent === 1 ? "hasn't" : "haven't"} been sent to SEEFIX yet. Logging out permanently deletes ` +
                `${unsent === 1 ? 'it' : 'them'} from this phone.`
              : "Reports saved on this phone couldn't be read. Logging out permanently deletes them from this phone.",
            confirmText: 'Delete and Log Out',
            destructive: true,
          }
        : {
            header: 'Log out?',
            message: "You'll need to sign in again to see your reports.",
            confirmText: 'Log Out',
            destructive: true,
          },
    );
    if (!confirmed) return;
    // No send may write while the saved reports are being deleted.
    const release = await this.sync.pause();
    try {
      await this.auth.logout();
    } catch (error) {
      if (!(error instanceof LocalDataNotDeletedError)) throw error;
      const anyway = await this.confirmService.confirm({
        header: "Couldn't delete saved data",
        message:
          "Data saved on this phone for your account couldn't be deleted. If you log out anyway, it stays on this " +
          'phone and only appears again when you sign in with this account.',
        confirmText: 'Log Out Anyway',
        destructive: true,
      });
      if (anyway) await this.auth.logout({ keepLocalData: true });
    } finally {
      release();
    }
  }
}
