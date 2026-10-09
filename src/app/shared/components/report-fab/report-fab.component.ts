import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IonFab, IonFabButton, IonIcon, NavController, ToastController } from '@ionic/angular';
import { ReportsStore } from '../../../features/reports/reports.store';
import { statusLabel } from '../../formatters/report-status-label';
import { ConfirmService } from '../../services/confirm.service';

/**
 * Bottom-right "Report an Issue" FAB, gated by the one-active-report rule.
 * When submission is not allowed (blocked, still checking, or check failed) it looks
 * disabled with a rotating indicator, and a tap explains why instead of opening the form.
 */
@Component({
  selector: 'app-report-fab',
  templateUrl: 'report-fab.component.html',
  styleUrls: ['report-fab.component.scss'],
  imports: [IonFab, IonFabButton, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportFabComponent {
  private readonly store = inject(ReportsStore);
  private readonly nav = inject(NavController);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(ToastController);

  readonly allowed = this.store.canSubmit;
  readonly ariaLabel = computed(() => {
    switch (this.store.eligibility()) {
      case 'allowed':
        return 'Report an Issue';
      case 'blocked':
        return 'Report an Issue, unavailable while your current report is in progress';
      case 'error':
        return 'Report an Issue, unavailable: could not check eligibility';
      default:
        return 'Report an Issue, checking availability';
    }
  });

  async onTap(): Promise<void> {
    const state = this.store.eligibility();
    if (state === 'allowed') {
      await this.nav.navigateForward('/reports/new');
      return;
    }
    if (state === 'blocked') {
      await this.explainBlocked();
      return;
    }
    if (state === 'error') {
      const retry = await this.confirm.confirm({
        header: "Can't check right now",
        message: "We couldn't confirm whether you can submit a new report. Check your connection and try again.",
        confirmText: 'Retry',
        cancelText: 'Close',
      });
      if (retry && (await this.store.refreshEligibility()) === true) await this.nav.navigateForward('/reports/new');
      return;
    }
    const toast = await this.toasts.create({ message: 'Checking whether you can submit a report…', duration: 1800 });
    await toast.present();
  }

  private async explainBlocked(): Promise<void> {
    const active = this.store.activeReport();
    const detail = active ? `${active.reportNo} is ${statusLabel(active.status).toLowerCase()}. ` : '';
    const view = await this.confirm.confirm({
      header: 'Report already in progress',
      message: `${detail}You can submit a new report once it is resolved, closed or cancelled. Please wait for the result of your current report.`,
      confirmText: active ? 'View report' : 'OK',
      cancelText: 'Close',
    });
    if (view && active) await this.nav.navigateForward(['/reports', active.id]);
  }
}
