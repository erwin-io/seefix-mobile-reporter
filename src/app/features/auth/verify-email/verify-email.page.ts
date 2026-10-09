import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonInput,
  IonNote,
  IonSpinner,
  IonTitle,
  IonToolbar,
  NavController,
  ToastController,
} from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { AuthApiService } from '../../../core/auth/auth.api.service';
import { AuthFlowStore } from '../../../core/auth/auth-flow.store';
import { SessionStore } from '../../../core/auth/session.store';
import { emailValidator, normalizeEmail, normalizeOtp, otpValidator } from '../../../core/forms/account-validators';
import { AppError, mapHttpError } from '../../../core/http/api-error.mapper';
import { createCooldownTimer } from '../../../shared/utils/cooldown-timer';

/** Screen D — verify a NEW Reporter's email with the six-digit code (public, no token issued). */
@Component({
  selector: 'app-verify-email',
  templateUrl: 'verify-email.page.html',
  imports: [
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonInput,
    IonButton,
    IonNote,
    IonSpinner,
  ],
})
export class VerifyEmailPage {
  private readonly api = inject(AuthApiService);
  private readonly flow = inject(AuthFlowStore);
  private readonly session = inject(SessionStore);
  private readonly nav = inject(NavController);
  private readonly toasts = inject(ToastController);

  /** Email arrives via in-memory flow state, never the URL; it is editable after an app restart. */
  readonly knownEmail = this.flow.verificationEmail();
  readonly deliveryFailed = signal(this.flow.verificationDeliveryFailed());
  readonly form = inject(NonNullableFormBuilder).group({
    email: [this.knownEmail ?? '', [Validators.required, emailValidator]],
    code: ['', [Validators.required, otpValidator]],
  });
  readonly cooldown = createCooldownTimer('EMAIL_VERIFY');
  readonly submitting = signal(false);
  readonly resending = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly codeExpired = signal(false);

  onCodeInput(value: string | null | undefined): void {
    const digits = normalizeOtp(value);
    if (digits !== value) this.form.controls.code.setValue(digits);
  }

  async verify(): Promise<void> {
    if (this.submitting()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.codeExpired.set(false);
    try {
      const { email, code } = this.form.getRawValue();
      await firstValueFrom(this.api.verifyEmail({ email: normalizeEmail(email), code }));
      this.flow.verificationEmail.set(null);
      this.flow.verificationDeliveryFailed.set(false);
      this.form.reset();
      this.session.setNotice('EMAIL_VERIFIED');
      await this.nav.navigateRoot('/auth/login', { replaceUrl: true });
    } catch (error) {
      this.showError(mapHttpError(error));
    } finally {
      this.submitting.set(false);
    }
  }

  async resend(): Promise<void> {
    const emailControl = this.form.controls.email;
    emailControl.markAsTouched();
    if (this.resending() || this.cooldown.seconds() > 0 || emailControl.invalid) return;

    this.resending.set(true);
    this.errorMessage.set(null);
    try {
      // Generic by design: it never confirms that the account exists or that mail was sent.
      const { message } = await firstValueFrom(this.api.resendVerification(normalizeEmail(emailControl.value)));
      this.cooldown.start();
      this.deliveryFailed.set(false);
      this.codeExpired.set(false);
      this.form.controls.code.reset();
      await this.toast(message || 'If the account is eligible, check your inbox for a new code.');
    } catch (error) {
      const appError = mapHttpError(error);
      if (appError.kind === 'EMAIL_DELIVERY') this.cooldown.start();
      this.errorMessage.set(appError.userMessage);
    } finally {
      this.resending.set(false);
    }
  }

  backToLogin(): void {
    void this.nav.navigateRoot('/auth/login', { replaceUrl: true });
  }

  private showError(error: AppError): void {
    if (error.code === 'OTP_EXPIRED') this.codeExpired.set(true);
    if (error.code === 'OTP_INVALID') this.form.controls.code.reset();
    this.errorMessage.set(error.userMessage);
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toasts.create({ message, duration: 3500, position: 'bottom' });
    await toast.present();
  }
}
