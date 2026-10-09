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
} from '@ionic/angular';
import { AuthFlowStore } from '../../../core/auth/auth-flow.store';
import { AuthService } from '../../../core/auth/auth.service';
import {
  emailValidator,
  matchingFields,
  normalizeEmail,
  passwordErrorText,
  passwordValidator,
} from '../../../core/forms/account-validators';
import { mapHttpError } from '../../../core/http/api-error.mapper';

/** Screen C — self-registration of a REPORTER account (no sign-in until the email is verified). */
@Component({
  selector: 'app-register',
  templateUrl: 'register.page.html',
  styleUrls: ['register.page.scss'],
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
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly flow = inject(AuthFlowStore);
  private readonly nav = inject(NavController);

  readonly form = inject(NonNullableFormBuilder).group(
    {
      fullName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(200)]],
      email: ['', [Validators.required, emailValidator]],
      phone: ['', [Validators.maxLength(50)]],
      password: ['', [Validators.required, passwordValidator]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: matchingFields('password', 'confirmPassword') },
  );
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly passwordErrorText = passwordErrorText;

  get mismatch(): boolean {
    return this.form.hasError('mismatch') && this.form.controls.confirmPassword.touched;
  }

  async submit(): Promise<void> {
    if (this.submitting()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.submitting.set(true);
    this.errorMessage.set(null);
    const { fullName, email, phone, password } = this.form.getRawValue();
    const normalizedEmail = normalizeEmail(email);
    try {
      await this.auth.register({
        fullName: fullName.trim(),
        email: normalizedEmail,
        password,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });
      await this.goToVerification(normalizedEmail, false);
    } catch (error) {
      const appError = mapHttpError(error);
      if (appError.kind === 'EMAIL_DELIVERY') {
        // The account and code were saved before sending failed; re-registering would conflict.
        await this.goToVerification(normalizedEmail, true);
        return;
      }
      this.errorMessage.set(appError.userMessage);
    } finally {
      this.submitting.set(false);
    }
  }

  private async goToVerification(email: string, deliveryFailed: boolean): Promise<void> {
    this.flow.verificationEmail.set(email);
    this.flow.verificationDeliveryFailed.set(deliveryFailed);
    this.flow.startCooldown('EMAIL_VERIFY');
    this.form.reset();
    // Replace Register so Back from verification returns to Login.
    await this.nav.navigateForward('/auth/verify-email', { replaceUrl: true });
  }
}
