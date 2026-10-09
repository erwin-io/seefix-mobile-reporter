import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IonBadge, IonButton, IonIcon, NavController } from '@ionic/angular';
import { NotificationsStore } from '../../../features/notifications/notifications.store';

/** Header bell. Opens the global Notifications page (not a tab). */
@Component({
  selector: 'app-notification-bell',
  templateUrl: 'notification-bell.component.html',
  styleUrls: ['notification-bell.component.scss'],
  imports: [IonButton, IonIcon, IonBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationBellComponent {
  private readonly nav = inject(NavController);
  private readonly store = inject(NotificationsStore);

  readonly count = this.store.unreadCount;
  readonly badgeText = computed(() => (this.count() > 99 ? '99+' : String(this.count())));
  readonly ariaLabel = computed(() =>
    this.count() > 0 ? `Notifications, ${this.count()} unread` : 'Notifications',
  );

  open(): void {
    void this.nav.navigateForward('/notifications');
  }
}
