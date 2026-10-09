import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonInputPasswordToggle,
  IonNote,
  IonSpinner,
  IonTitle,
  IonToolbar,
  NavController,
  ViewWillEnter,
} from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { AccountApiService } from '../../../core/auth/account.api.service';
import { AuthFlowStore } from '../../../core/auth/auth-flow.store';
import { SessionStore } from '../../../core/auth/session.store';
import { emailValidator, normalizeEmail } from '../../../core/forms/account-validators';
import { mapHttpError } from '../../../core/http/api-error.mapper';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { SuccessScreenService } from '../../../shared/services/success-screen.service';
import { createCooldownTimer } from '../../../shared/utils/cooldown-timer';

/**
 * Screen O — start a Reporter email change. The code goes to the NEW address and the
 * current email stays active until it is confirmed. Repeating this step is also how a
 * new code is requested (there is no separate resend endpoint).
 */
@Component({
  selector: 'app-change-email',
  templateUrl: 'change-email.page.html',
  imports: [
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonInput,
    IonInputPasswordToggle,
    IonButton,
    IonNote,
    IonSpinner,
  ],
})
export class ChangeEmailPage implements ViewWillEnter {
  private readonly api = inject(AccountApiService);
  private readonly flow = inject(AuthFlowStore);
  private readonly nav = inject(NavController);
  private readonly confirmService = inject(ConfirmService);
  private readonly success = inject(SuccessScreenService);
  readonly user = inject(SessionStore).user;

  readonly form = inject(NonNullableFormBuilder).group({
    newEmail: ['', [Validators.required, emailValidator]],
    currentPassword: ['', [Validators.required]],
  });
  readonly cooldown = createCooldownTimer('EMAIL_CHANGE');
  readonly sending = signal(false);
  readonly errorMessage = signal<string | null>(null);

  ionViewWillEnter(): void {
    // Returning from "Send a new code": keep the pending address, ask for the password again.
    const pending = this.flow.pendingEmailChange();
    if (pending && !this.form.controls.newEmail.value) this.form.controls.newEmail.setValue(pending);
    this.form.controls.currentPassword.reset();
  }

  async send(): Promise<void> {
    if (this.sending() || this.cooldown.seconds() > 0) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const newEmail = normalizeEmail(this.form.controls.newEmail.value);
    const confirmed = await this.confirmService.confirm({
      header: 'Send verification code?',
      message: `We'll email a six-digit code to ${newEmail}. Your current email stays active until you confirm.`,
      confirmText: 'Send code',
    });
    if (!confirmed) return;

    this.sending.set(true);
    this.errorMessage.set(null);
    try {
      const response = await firstValueFrom(
        this.api.startEmailChange({ newEmail, currentPassword: this.form.controls.currentPassword.value }),
      );
      this.flow.pendingEmailChange.set(response.pendingEmail ?? newEmail);
      this.cooldown.start();
      this.form.controls.currentPassword.reset();
      await this.success.show({
        title: 'Check your new inbox',
        message: `We sent a six-digit code to ${response.pendingEmail ?? newEmail}. It expires in 10 minutes.`,
        actionText: 'Enter code',
      });
      await this.nav.navigateForward('/account/confirm-email');
    } catch (error) {
      const appError = mapHttpError(error);
      if (appError.kind === 'EMAIL_DELIVERY') this.cooldown.start();
      this.form.controls.currentPassword.reset();
      this.errorMessage.set(appError.userMessage);
    } finally {
      this.sending.set(false);
    }
  }
}
