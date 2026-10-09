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
} from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { AccountApiService } from '../../../core/auth/account.api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { matchingFields, passwordErrorText, passwordValidator } from '../../../core/forms/account-validators';
import { mapHttpError } from '../../../core/http/api-error.mapper';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { SuccessScreenService } from '../../../shared/services/success-screen.service';

/** Screen Q — change password. Success revokes all sessions, so the user signs in again. */
@Component({
  selector: 'app-change-password',
  templateUrl: 'change-password.page.html',
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
export class ChangePasswordPage {
  private readonly api = inject(AccountApiService);
  private readonly auth = inject(AuthService);
  private readonly confirmService = inject(ConfirmService);
  private readonly success = inject(SuccessScreenService);

  readonly form = inject(NonNullableFormBuilder).group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, passwordValidator]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: matchingFields('newPassword', 'confirmPassword') },
  );
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly passwordErrorText = passwordErrorText;

  get mismatch(): boolean {
    return this.form.hasError('mismatch') && this.form.controls.confirmPassword.touched;
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const confirmed = await this.confirmService.confirm({
      header: 'Change password?',
      message: "You'll be signed out on all devices and need to sign in with your new password.",
      confirmText: 'Change password',
    });
    if (!confirmed) return;

    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      const { currentPassword, newPassword } = this.form.getRawValue();
      await firstValueFrom(this.api.changePassword({ currentPassword, newPassword }));
      this.form.reset();
      await this.auth.endSessionAfterSecurityChange('PASSWORD_CHANGED', () =>
        this.success.show({
          title: 'Password changed',
          message: "You've been signed out on all devices. Sign in with your new password.",
          actionText: 'Go to sign in',
        }),
      );
    } catch (error) {
      const appError = mapHttpError(error);
      if (appError.code === 'CURRENT_PASSWORD_INCORRECT') this.form.controls.currentPassword.reset();
      this.errorMessage.set(appError.userMessage);
    } finally {
      this.saving.set(false);
    }
  }
}
