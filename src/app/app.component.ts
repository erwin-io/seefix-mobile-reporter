import { Component, OnDestroy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { ActionSheetController, IonApp, IonRouterOutlet, NavController, Platform, ToastController } from '@ionic/angular';
import { registerAppIcons } from './core/config/icons';
import { AppResumeService } from './core/lifecycle/app-resume.service';
import { ReportSyncService } from './features/reports/outbox/report-sync.service';

/** Back on these asks before leaving the app; every other page navigates back as usual. */
const MAIN_SCREENS = new Set(['/auth/login', '/tabs/home', '/tabs/reports', '/tabs/profile']);

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnDestroy {
  private readonly lifecycle = inject(AppResumeService);
  private readonly toasts = inject(ToastController);
  private readonly router = inject(Router);
  private readonly nav = inject(NavController);
  private readonly sheets = inject(ActionSheetController);

  constructor() {
    registerAppIcons();
    void this.lifecycle.start();
    // Created at start so reports saved on the phone are sent whenever the app is open and online; one message
    // when SEEFIX received one, whichever screen is open.
    inject(ReportSyncService)
      .sent$.pipe(takeUntilDestroyed())
      .subscribe(({ report }) => void this.announceReceived(report.reportNo));
    // Android back: open overlays close first (Ionic, priority 100). Detail pages keep the default back (next()).
    inject(Platform).backButton.subscribeWithPriority(10, (next) => this.onBack(next));
  }

  ngOnDestroy(): void {
    void this.lifecycle.stop();
  }

  private onBack(next: () => void): void {
    const path = this.router.url.split(/[?#]/)[0];
    if (MAIN_SCREENS.has(path)) void this.confirmLeave();
    // Register's canDeactivate guard asks first when any field has text.
    else if (path === '/auth/register') void this.nav.navigateBack('/auth/login');
    else next();
  }

  private async confirmLeave(): Promise<void> {
    const sheet = await this.sheets.create({
      header: 'Leave SEEFIX Reporter?',
      buttons: [
        { text: 'Minimize app', handler: () => void App.minimizeApp() },
        { text: 'Close app', role: 'destructive', handler: () => void App.exitApp() },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
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
