import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonIcon, NavController } from '@ionic/angular';
import { ReportsStore } from '../../../features/reports/reports.store';
import { ReportStatusChipComponent } from '../report-status-chip/report-status-chip.component';

/**
 * Shown on Home and My Reports when a new report cannot be submitted:
 * the current active report with a View action, or a Retry when the check failed.
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
  readonly store = inject(ReportsStore);

  view(id: string): void {
    void this.nav.navigateForward(['/reports', id]);
  }

  retry(): void {
    void this.store.refreshEligibility();
  }
}
