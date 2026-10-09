import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonSpinner, IonText, NavController, ViewWillEnter } from '@ionic/angular';
import { AuthService } from '../../core/auth/auth.service';
import { safeReturnUrl } from '../../core/auth/auth.guard';
import { SessionStore } from '../../core/auth/session.store';

/** Screen A — resolves the stored session before any private content is shown. */
@Component({
  selector: 'app-launch',
  templateUrl: 'launch.page.html',
  styleUrls: ['launch.page.scss'],
  imports: [IonContent, IonSpinner, IonText, IonButton, IonIcon],
})
export class LaunchPage implements ViewWillEnter {
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionStore);
  private readonly nav = inject(NavController);
  private readonly route = inject(ActivatedRoute);

  readonly offline = signal(false);
  readonly retrying = signal(false);

  ionViewWillEnter(): void {
    void this.resolve(false);
  }

  retry(): void {
    void this.resolve(true);
  }

  signInAgain(): void {
    void this.nav.navigateRoot('/auth/login');
  }

  private async resolve(force: boolean): Promise<void> {
    this.retrying.set(force);
    await (force ? this.auth.retryBootstrap() : this.auth.ensureBootstrapped());
    this.retrying.set(false);

    const state = this.session.state();
    this.offline.set(state === 'OFFLINE_UNVERIFIED');
    if (state === 'AUTHENTICATED') {
      await this.nav.navigateRoot(safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')), {
        animated: false,
      });
    } else if (state === 'UNAUTHENTICATED') {
      await this.nav.navigateRoot('/auth/login', { animated: false });
    }
  }
}
