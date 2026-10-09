import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonBackButton,
  IonButton,
  IonButtons,
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
import { AccountApiService } from '../../../core/auth/account.api.service';
import { AuthFlowStore } from '../../../core/auth/auth-flow.store';
import { AuthService } from '../../../core/auth/auth.service';
import { normalizeOtp, otpValidator } from '../../../core/forms/account-validators';
import { mapHttpError } from '../../../core/http/api-error.mapper';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { SuccessScreenService } from '../../../shared/services/success-screen.service';
import { createCooldownTimer } from '../../../shared/utils/cooldown-timer';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

/**
 * Screen P — confirm the pending new email with the code sent to it.
 * Success revokes every JWT, so the app signs out before doing anything else.
 */
@Component({
  selector: 'app-confirm-email',
  templateUrl: 'confirm-email.page.html',
  imports: [
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonInput,
    IonButton,
    IonNote,
    IonSpinner,
    EmptyStateComponent,
  ],
})
export class ConfirmEmailPage {
  private readonly api = inject(AccountApiService);
  private readonly auth = inject(AuthService);
  private readonly flow = inject(AuthFlowStore);
  private readonly nav = inject(NavController);
  private readonly confirmService = inject(ConfirmService);
  private readonly success = inject(SuccessScreenService);

  /** In memory only; lost on app restart, in which case the change flow starts again. */
  readonly pendingEmail = this.flow.pendingEmailChange;
  readonly form = inject(NonNullableFormBuilder).group({
    code: ['', [Validators.required, otpValidator]],
  });
  readonly cooldown = createCooldownTimer('EMAIL_CHANGE');
  readonly confirming = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly codeExpired = signal(false);

  onCodeInput(value: string | null | undefined): void {
    const digits = normalizeOtp(value);
    if (digits !== value) this.form.controls.code.setValue(digits);
  }

  async confirm(): Promise<void> {
    const newEmail = this.pendingEmail();
    if (this.confirming() || !newEmail) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const confirmed = await this.confirmService.confirm({
      header: 'Change your email?',
      message: `Your account email will become ${newEmail}. You'll be signed out and need to sign in again.`,
      confirmText: 'Confirm',
    });
    if (!confirmed) return;

    this.confirming.set(true);
    this.errorMessage.set(null);
    this.codeExpired.set(false);
    try {
      await firstValueFrom(this.api.confirmEmailChange({ newEmail, code: this.form.controls.code.value }));
      this.form.reset();
      // Old JWT is now revoked: clear it before any other request can race, then show the success screen.
      await this.auth.endSessionAfterSecurityChange('EMAIL_CHANGED', () =>
        this.success.show({
          title: 'Email changed',
          message: `Your account email is now ${newEmail}. Sign in again with your new email.`,
          actionText: 'Go to sign in',
        }),
      );
    } catch (error) {
      const appError = mapHttpError(error);
      if (appError.code === 'OTP_EXPIRED') this.codeExpired.set(true);
      this.form.controls.code.reset();
      this.errorMessage.set(appError.userMessage);
    } finally {
      this.confirming.set(false);
    }
  }

  /** A new code needs the current password again, so the request restarts on Change Email. */
  requestNewCode(): void {
    void this.nav.navigateBack('/account/change-email');
  }
}
