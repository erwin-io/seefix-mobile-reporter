import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon, IonItem, IonLabel, IonNote } from '@ionic/angular';
import { NotificationDto } from '../../../core/models/notification.model';

/**
 * One inbox row. Read and unread rows share the same fixed-width leading icon,
 * so text always lines up; unread adds a dot and bold title (never color alone).
 */
@Component({
  selector: 'app-notification-item',
  templateUrl: 'notification-item.component.html',
  styleUrls: ['notification-item.component.scss'],
  imports: [DatePipe, IonItem, IonIcon, IonLabel, IonNote],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationItemComponent {
  readonly item = input.required<NotificationDto>();
  readonly compact = input(false);
  readonly lines = input<'full' | 'inset' | 'none'>('full');
  readonly selected = output<NotificationDto>();
}
