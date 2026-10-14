import { Component, OnDestroy, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
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
  /** Created at start so reports saved on the phone are sent whenever the app is open and online. */
  private readonly reportSync = inject(ReportSyncService);

  constructor() {
    registerAppIcons();
    void this.lifecycle.start();
  }

  ngOnDestroy(): void {
    void this.lifecycle.stop();
  }
}
