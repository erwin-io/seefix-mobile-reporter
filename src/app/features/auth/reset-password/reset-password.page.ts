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
  IonInputPasswordToggle,
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
import {
  emailValidator,
  matchingFields,
  normalizeEmail,
  normalizeOtp,
  otpValidator,
  passwordErrorText,
  passwordValidator,
} from '../../../core/forms/account-validators';
import { mapHttpError } from '../../../core/http/api-error.mapper';
import { createCooldownTimer } from '../../../shared/utils/cooldown-timer';
import { RESET_REQUESTED_COPY } from '../forgot-password/forgot-password.page';

/** Screen F — set a new password with the emailed reset code. Never signs in automatically. */
@Component({
  selector: 'app-reset-password',
  templateUrl: 'reset-password.page.html',
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
    IonInputPasswordToggle,
    IonButton,
    IonNote,
    IonSpinner,
  ],
})
export class ResetPasswordPage {
  private readonly api = inject(AuthApiService);
  private readonly flow = inject(AuthFlowStore);
  private readonly session = inject(SessionStore);
  private readonly nav = inject(NavController);
  private readonly toasts = inject(ToastController);

  readonly requestedFor = this.flow.resetEmail();
  readonly form = inject(NonNullableFormBuilder).group(
    {
      email: [this.requestedFor ?? '', [Validators.required, emailValidator]],
      code: ['', [Validators.required, otpValidator]],
      newPassword: ['', [Validators.required, passwordValidator]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: matchingFields('newPassword', 'confirmPassword') },
  );
  readonly cooldown = createCooldownTimer('PASSWORD_RESET');
  readonly submitting = signal(false);
  readonly resending = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly codeExpired = signal(false);
  readonly passwordErrorText = passwordErrorText;
  readonly requestedCopy = RESET_REQUESTED_COPY;

  get mismatch(): boolean {
    return this.form.hasError('mismatch') && this.form.controls.confirmPassword.touched;
  }

  onCodeInput(value: string | null | undefined): void {
    const digits = normalizeOtp(value);
    if (digits !== value) this.form.controls.code.setValue(digits);
  }

  async submit(): Promise<void> {
    if (this.submitting()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.codeExpired.set(false);
    try {
      const { email, code, newPassword } = this.form.getRawValue();
      await firstValueFrom(this.api.resetPassword({ email: normalizeEmail(email), code, newPassword }));
      this.form.reset();
      this.flow.resetEmail.set(null);
      this.session.setNotice('PASSWORD_RESET');
      await this.nav.navigateRoot('/auth/login', { replaceUrl: true });
    } catch (error) {
      const appError = mapHttpError(error);
      if (appError.code === 'OTP_EXPIRED') this.codeExpired.set(true);
      this.form.controls.code.reset();
      this.errorMessage.set(appError.userMessage);
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
      const email = normalizeEmail(emailControl.value);
      await firstValueFrom(this.api.forgotPassword(email));
      this.flow.resetEmail.set(email);
      this.cooldown.start();
      this.codeExpired.set(false);
      const toast = await this.toasts.create({ message: RESET_REQUESTED_COPY, duration: 3500, position: 'bottom' });
      await toast.present();
    } catch (error) {
      const appError = mapHttpError(error);
      if (appError.kind === 'EMAIL_DELIVERY') this.cooldown.start();
      this.errorMessage.set(appError.userMessage);
    } finally {
      this.resending.set(false);
    }
  }
}
