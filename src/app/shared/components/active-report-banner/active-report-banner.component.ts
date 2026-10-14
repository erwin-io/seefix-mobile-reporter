import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonIcon, NavController } from '@ionic/angular';
import { ConnectivityService } from '../../../core/connectivity/connectivity.service';
import { ReportOutboxStore } from '../../../features/reports/outbox/report-outbox.store';
import { ReportsStore } from '../../../features/reports/reports.store';
import { ReportStatusChipComponent } from '../report-status-chip/report-status-chip.component';

/**
 * Shown on Home and My Reports when a new report cannot be submitted:
 * the current active report with a View action, or a Retry when the check failed.
 * The Retry card is left out while offline / server down (D7: the form stays open and saves on the phone)
 * and while a report waits on this phone (the pending-report card already explains the block).
 */
@Component({
  selector: 'app-active-report-banner',
  templateUrl: 'active-report-banner.component.html',
  styleUrls: ['active-report-banner.component.scss'],
  imports: [IonCard, IonCardContent, IonButton, IonIcon, ReportStatusChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActiveReportBannerComponent {
  private readonly nav = inject(NavController);
  private readonly connectivity = inject(ConnectivityService);
  private readonly outbox = inject(ReportOutboxStore);
  readonly store = inject(ReportsStore);
  readonly showError = computed(() => {
    const state = this.connectivity.state();
    if (state === 'offline' || state === 'server-down') return false;
    return !this.outbox.hasUnsent() && !this.outbox.unavailable();
  });

  view(id: string): void {
    void this.nav.navigateForward(['/reports', id]);
  }

  retry(): void {
    void this.store.refreshEligibility();
  }
}
