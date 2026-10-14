import { Component, OnDestroy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonApp, IonRouterOutlet, ToastController } from '@ionic/angular';
import { registerAppIcons } from './core/config/icons';
import { AppResumeService } from './core/lifecycle/app-resume.service';
import { ReportSyncService } from './features/reports/outbox/report-sync.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnDestroy {
  private readonly lifecycle = inject(AppResumeService);
  private readonly toasts = inject(ToastController);

  constructor() {
    registerAppIcons();
    void this.lifecycle.start();
    // Created at start so reports saved on the phone are sent whenever the app is open and online; one message
    // when SEEFIX received one, whichever screen is open.
    inject(ReportSyncService)
      .sent$.pipe(takeUntilDestroyed())
      .subscribe(({ report }) => void this.announceReceived(report.reportNo));
  }

  ngOnDestroy(): void {
    void this.lifecycle.stop();
  }

  private async announceReceived(reportNo: string): Promise<void> {
    const toast = await this.toasts.create({
      message: `Report ${reportNo} received by SEEFIX.`,
      duration: 3000,
      position: 'bottom',
      color: 'success',
    });
    await toast.present();
  }
}
