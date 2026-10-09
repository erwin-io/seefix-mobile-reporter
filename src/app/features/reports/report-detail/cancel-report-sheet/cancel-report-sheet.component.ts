import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonButton, IonContent, IonIcon, IonNote, IonSpinner, IonTextarea, ModalController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { AppError, mapHttpError } from '../../../../core/http/api-error.mapper';
import { ReportsApiService } from '../../reports.api.service';

export const CANCEL_REASON_MIN = 5;
export const CANCEL_REASON_MAX = 500;

/** Dismiss roles: `cancelled` (data = CancelReportResponse) or `conflict` (data = AppError, review won the race). */
export type CancelSheetRole = 'cancelled' | 'conflict' | 'dismiss';

/**
 * Bottom sheet asking for the cancellation reason (5–500 chars). Doubles as the
 * irreversible-action confirmation, then calls POST /api/reports/:id/cancel.
 */
@Component({
  selector: 'app-cancel-report-sheet',
  templateUrl: 'cancel-report-sheet.component.html',
  styleUrls: ['cancel-report-sheet.component.scss'],
  imports: [ReactiveFormsModule, IonContent, IonTextarea, IonButton, IonNote, IonIcon, IonSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CancelReportSheetComponent {
  private readonly modals = inject(ModalController);
  private readonly api = inject(ReportsApiService);

  readonly reportId = input.required<string>();
  readonly reportNo = input.required<string>();

  readonly min = CANCEL_REASON_MIN;
  readonly max = CANCEL_REASON_MAX;
  readonly reason = inject(NonNullableFormBuilder).control('', [
    Validators.required,
    trimmedLength(CANCEL_REASON_MIN, CANCEL_REASON_MAX),
  ]);
  private readonly value = toSignal(this.reason.valueChanges, { initialValue: '' });
  readonly trimmedLength = computed(() => this.value().trim().length);
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async confirm(): Promise<void> {
    if (this.submitting()) return;
    this.reason.markAsTouched();
    if (this.reason.invalid) return;

    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const result = await firstValueFrom(this.api.cancel(this.reportId(), this.reason.value));
      await this.modals.dismiss(result, 'cancelled');
    } catch (error) {
      const appError = mapHttpError(error);
      if (appError.kind === 'CONFLICT' || appError.kind === 'NOT_FOUND') {
        await this.modals.dismiss(appError, 'conflict');
        return;
      }
      // Input problems and transient failures stay on the sheet; nothing was cancelled optimistically.
      this.errorMessage.set(appError.userMessage);
    } finally {
      this.submitting.set(false);
    }
  }

  keep(): void {
    void this.modals.dismiss(null, 'dismiss');
  }
}

function trimmedLength(min: number, max: number) {
  return (control: { value: unknown }) => {
    const length = typeof control.value === 'string' ? control.value.trim().length : 0;
    if (length === 0) return null; // Validators.required reports emptiness
    return length < min || length > max ? { reasonLength: true } : null;
  };
}

export function isCancelSheetError(value: unknown): value is AppError {
  return value instanceof AppError;
}
