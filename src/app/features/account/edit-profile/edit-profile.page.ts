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
import { SessionStore } from '../../../core/auth/session.store';
import { mapHttpError } from '../../../core/http/api-error.mapper';
import { UpdateProfileRequest } from '../../../core/models/account.model';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { SuccessScreenService } from '../../../shared/services/success-screen.service';
import { HasPendingChanges } from '../../reports/new-report/pending-changes.guard';

/** Screen M — edit own full name and phone. Email and password have their own secure flows. */
@Component({
  selector: 'app-edit-profile',
  templateUrl: 'edit-profile.page.html',
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
  ],
})
export class EditProfilePage implements HasPendingChanges {
  private readonly api = inject(AccountApiService);
  private readonly session = inject(SessionStore);
  private readonly nav = inject(NavController);
  private readonly confirmService = inject(ConfirmService);
  private readonly success = inject(SuccessScreenService);

  readonly user = this.session.user;
  private readonly original = {
    fullName: this.user()?.fullName ?? '',
    phone: this.user()?.phone ?? '',
  };
  readonly form = inject(NonNullableFormBuilder).group({
    fullName: [this.original.fullName, [Validators.required, Validators.minLength(2), Validators.maxLength(200)]],
    phone: [this.original.phone, [Validators.maxLength(50)]],
  });
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  private saved = false;

  /** Only fields that actually changed are sent. */
  changes(): UpdateProfileRequest {
    const { fullName, phone } = this.form.getRawValue();
    const request: UpdateProfileRequest = {};
    if (fullName.trim() !== this.original.fullName) request.fullName = fullName.trim();
    if (phone.trim() !== this.original.phone) request.phone = phone.trim() || null;
    return request;
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const request = this.changes();
    if (Object.keys(request).length === 0) {
      this.saved = true;
      await this.nav.navigateBack('/tabs/profile');
      return;
    }

    const confirmed = await this.confirmService.confirm({
      header: 'Save changes?',
      message: 'Your name and phone number will be updated on your account.',
      confirmText: 'Save',
    });
    if (!confirmed) return;

    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      const { user } = await firstValueFrom(this.api.updateProfile(request));
      this.session.updateUser(user);
      this.saved = true;
      await this.success.show({
        title: 'Profile updated',
        message: 'Your account details were saved.',
        actionText: 'Back to profile',
      });
      await this.nav.navigateBack('/tabs/profile');
    } catch (error) {
      const appError = mapHttpError(error);
      if (appError.kind !== 'UNAUTHORIZED') this.errorMessage.set(appError.userMessage);
    } finally {
      this.saving.set(false);
    }
  }

  async canLeave(): Promise<boolean> {
    if (this.saved || !this.session.isAuthenticated() || Object.keys(this.changes()).length === 0) return true;
    return this.confirmService.confirm({
      header: 'Discard changes?',
      message: "Your profile changes haven't been saved.",
      cancelText: 'Keep editing',
      confirmText: 'Discard',
      destructive: true,
    });
  }

}
