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
} from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { AuthApiService } from '../../../core/auth/auth.api.service';
import { AuthFlowStore } from '../../../core/auth/auth-flow.store';
import { emailValidator, normalizeEmail } from '../../../core/forms/account-validators';
import { mapHttpError } from '../../../core/http/api-error.mapper';

/** Same copy for known and unknown emails: the app never reveals whether an account exists. */
export const RESET_REQUESTED_COPY = 'If an account exists for that email, a reset code will be sent.';

/** Screen E — request a password-reset code by email. */
@Component({
  selector: 'app-forgot-password',
  templateUrl: 'forgot-password.page.html',
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
export class ForgotPasswordPage {
  private readonly api = inject(AuthApiService);
  private readonly flow = inject(AuthFlowStore);
  private readonly nav = inject(NavController);

  readonly form = inject(NonNullableFormBuilder).group({
    email: [this.flow.resetEmail() ?? '', [Validators.required, emailValidator]],
  });
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async submit(): Promise<void> {
    if (this.submitting()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.submitting.set(true);
    this.errorMessage.set(null);
    const email = normalizeEmail(this.form.controls.email.value);
    try {
      await firstValueFrom(this.api.forgotPassword(email));
      this.flow.resetEmail.set(email);
      this.flow.startCooldown('PASSWORD_RESET');
      await this.nav.navigateForward('/auth/reset-password');
    } catch (error) {
      const appError = mapHttpError(error);
      if (appError.kind === 'EMAIL_DELIVERY') {
        // A code may exist but the email failed; let the user retry from the reset screen after the cooldown.
        this.flow.resetEmail.set(email);
        this.flow.startCooldown('PASSWORD_RESET');
      }
      this.errorMessage.set(appError.userMessage);
    } finally {
      this.submitting.set(false);
    }
  }

  haveCode(): void {
    const email = normalizeEmail(this.form.controls.email.value);
    if (email) this.flow.resetEmail.set(email);
    void this.nav.navigateForward('/auth/reset-password');
  }
}
