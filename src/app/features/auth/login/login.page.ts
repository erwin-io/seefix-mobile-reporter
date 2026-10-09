import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonInput,
  IonInputPasswordToggle,
  IonNote,
  IonRouterLink,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  NavController,
  ViewWillEnter,
} from '@ionic/angular';
import { AuthFlowStore } from '../../../core/auth/auth-flow.store';
import { AuthService } from '../../../core/auth/auth.service';
import { safeReturnUrl } from '../../../core/auth/auth.guard';
import { SessionStore } from '../../../core/auth/session.store';
import { emailValidator, normalizeEmail } from '../../../core/forms/account-validators';
import { ERROR_COPY, mapHttpError } from '../../../core/http/api-error.mapper';
import { SessionNotice } from '../../../core/models/auth.model';

interface NoticeCopy {
  text: string;
  color: 'success' | 'warning';
}

export const LOGIN_NOTICES: Record<SessionNotice, NoticeCopy | null> = {
  SESSION_EXPIRED: { text: ERROR_COPY.sessionExpired, color: 'warning' },
  SESSION_REVOKED: { text: ERROR_COPY.sessionRevoked, color: 'warning' },
  ROLE_DENIED: { text: ERROR_COPY.roleDenied, color: 'warning' },
  VERIFICATION_REQUIRED: { text: ERROR_COPY.verificationRequired, color: 'warning' },
  SIGNED_OUT: null,
  EMAIL_VERIFIED: { text: 'Email verified. You can now sign in.', color: 'success' },
  PASSWORD_RESET: { text: 'Password updated. Sign in with your new password.', color: 'success' },
  PASSWORD_CHANGED: { text: 'Password changed. Please sign in again.', color: 'success' },
  EMAIL_CHANGED: { text: 'Email changed. Sign in with your new email.', color: 'success' },
};

/** Screen B — Login with email and password. */
@Component({
  selector: 'app-login',
  templateUrl: 'login.page.html',
  styleUrls: ['login.page.scss'],
  imports: [
    ReactiveFormsModule,
    RouterLink,
    IonRouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonInput,
    IonInputPasswordToggle,
    IonButton,
    IonNote,
    IonText,
    IonSpinner,
  ],
})
export class LoginPage implements ViewWillEnter {
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionStore);
  private readonly flow = inject(AuthFlowStore);
  private readonly nav = inject(NavController);
  private readonly route = inject(ActivatedRoute);

  readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, emailValidator]],
    password: ['', [Validators.required]],
  });
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly notice = signal<NoticeCopy | null>(null);

  ionViewWillEnter(): void {
    const notice = this.session.consumeNotice();
    this.notice.set(notice ? LOGIN_NOTICES[notice] : null);
  }

  async submit(): Promise<void> {
    if (this.submitting()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.notice.set(null);
    const email = normalizeEmail(this.form.controls.email.value);
    try {
      await this.auth.login({ identifier: email, password: this.form.controls.password.value });
      this.form.reset();
      const returnUrl = safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
      await this.nav.navigateRoot(returnUrl, { replaceUrl: true });
    } catch (error) {
      const appError = mapHttpError(error);
      this.form.controls.password.reset();
      if (appError.kind === 'VERIFICATION_REQUIRED') {
        this.flow.verificationEmail.set(email);
        this.flow.verificationDeliveryFailed.set(false);
        await this.nav.navigateForward('/auth/verify-email');
        return;
      }
      this.errorMessage.set(appError.userMessage);
    } finally {
      this.submitting.set(false);
    }
  }
}
