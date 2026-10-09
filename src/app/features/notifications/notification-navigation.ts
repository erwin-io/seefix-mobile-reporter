import { Injectable, inject } from '@angular/core';
import { NavController, ToastController } from '@ionic/angular';
import { mapHttpError } from '../../core/http/api-error.mapper';
import { NotificationDto } from '../../core/models/notification.model';
import { NotificationsStore } from './notifications.store';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opening a notification: mark it read, then go to the linked own report.
 * Only `entityType=REPORT` + a well-formed id is trusted; payload links are ignored.
 */
@Injectable({ providedIn: 'root' })
export class NotificationNavigator {
  private readonly store = inject(NotificationsStore);
  private readonly nav = inject(NavController);
  private readonly toast = inject(ToastController);

  async open(item: NotificationDto): Promise<void> {
    try {
      await this.store.markRead(item.id);
    } catch (error) {
      // Navigation still helps the user; the read state will sync on next refresh.
      if (mapHttpError(error).kind === 'NOT_FOUND') return this.show('This notification is no longer available.');
    }

    if (item.entityType === 'REPORT' && item.entityId && UUID_PATTERN.test(item.entityId)) {
      await this.nav.navigateForward(['/reports', item.entityId]);
    } else if (item.entityType && item.entityType !== 'REPORT') {
      await this.show("This update doesn't have a report to open.");
    }
  }

  private async show(message: string): Promise<void> {
    const toast = await this.toast.create({ message, duration: 2500, position: 'bottom' });
    await toast.present();
  }
}
