import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonIcon, NavController } from '@ionic/angular';
import { ConnectivityService } from '../../../core/connectivity/connectivity.service';
import { deliveryStatus, photoCountText } from '../../../features/reports/outbox/delivery-status';
import { OutboxItem, ReportOutboxStore } from '../../../features/reports/outbox/report-outbox.store';
import { ReportSyncService } from '../../../features/reports/outbox/report-sync.service';

/** Home / My Reports: a report saved on this phone that SEEFIX has not received yet, shown first. */
@Component({
  selector: 'app-pending-report-card',
  templateUrl: 'pending-report-card.component.html',
  styleUrls: ['pending-report-card.component.scss'],
  imports: [DatePipe, IonCard, IonCardContent, IonButton, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PendingReportCardComponent {
  private readonly nav = inject(NavController);
  private readonly sync = inject(ReportSyncService);
  private readonly connectivity = inject(ConnectivityService);
  readonly outbox = inject(ReportOutboxStore);
  readonly offline = computed(() => this.connectivity.state() === 'offline');
  readonly status = deliveryStatus;
  readonly photoCount = photoCountText;

  open(item: OutboxItem): void {
    void this.nav.navigateForward(['/reports/local', item.id]);
  }

  sendNow(): void {
    void this.sync.syncNow(true);
  }
}
