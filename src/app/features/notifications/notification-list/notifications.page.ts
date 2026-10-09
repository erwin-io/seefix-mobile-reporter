import { Component, inject, signal } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonList,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonTitle,
  IonToolbar,
  RefresherCustomEvent,
  ToastController,
  ViewWillEnter,
} from '@ionic/angular';
import { mapHttpError } from '../../../core/http/api-error.mapper';
import { NotificationDto } from '../../../core/models/notification.model';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { NotificationItemComponent } from '../../../shared/components/notification-item/notification-item.component';
import { NotificationNavigator } from '../notification-navigation';
import { NotificationsStore } from '../notifications.store';

/** Screen H — in-app inbox, opened from the header bell (outside the tabs). */
@Component({
  selector: 'app-notifications',
  templateUrl: 'notifications.page.html',
  styleUrls: ['notifications.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonButton,
    IonIcon,
    IonSpinner,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonList,
    EmptyStateComponent,
    LoadingStateComponent,
    NotificationItemComponent,
  ],
})
export class NotificationsPage implements ViewWillEnter {
  private readonly navigator = inject(NotificationNavigator);
  private readonly toasts = inject(ToastController);
  readonly store = inject(NotificationsStore);
  readonly markingAll = signal(false);

  ionViewWillEnter(): void {
    void this.store.refresh();
  }

  async onRefresh(event: RefresherCustomEvent): Promise<void> {
    await this.store.refresh();
    await event.target.complete();
  }

  open(item: NotificationDto): void {
    void this.navigator.open(item);
  }

  async markAllRead(): Promise<void> {
    if (this.markingAll() || this.store.unreadCount() === 0) return;
    this.markingAll.set(true);
    try {
      await this.store.markAllRead();
      await this.toast('All notifications marked as read.');
    } catch (error) {
      await this.toast(mapHttpError(error).userMessage);
    } finally {
      this.markingAll.set(false);
    }
  }

  retry(): void {
    void this.store.refresh();
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toasts.create({ message, duration: 2500, position: 'bottom' });
    await toast.present();
  }
}
