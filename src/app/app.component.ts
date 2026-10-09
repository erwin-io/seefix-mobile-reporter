import { Component, OnDestroy, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { registerAppIcons } from './core/config/icons';
import { AppResumeService } from './core/lifecycle/app-resume.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnDestroy {
  private readonly lifecycle = inject(AppResumeService);

  constructor() {
    registerAppIcons();
    void this.lifecycle.start();
  }

  ngOnDestroy(): void {
    void this.lifecycle.stop();
  }
}
