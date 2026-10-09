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
import { AuthService } from '../../../core/auth/auth.service';
import { SessionStore } from '../../../core/auth/session.store';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { NotificationBellComponent } from '../../../shared/components/notification-bell/notification-bell.component';
import { humanize } from '../../../shared/formatters/report-status-label';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { NotificationsStore } from '../../notifications/notifications.store';

/** Screen L — account details, account/security actions (pushed pages) and Log Out. */
@Component({
  selector: 'app-profile',
  templateUrl: 'profile.page.html',
  styleUrls: ['profile.page.scss'],
  imports: [
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
    const confirmed = await this.confirmService.confirm({
      header: 'Log out?',
      message: "You'll need to sign in again to see your reports.",
      confirmText: 'Log Out',
      destructive: true,
    });
    if (confirmed) await this.auth.logout();
  }
}
