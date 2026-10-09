import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Server rules (seefix-api account-validation.js). */
export const PASSWORD_MIN_CHARS = 8;
export const PASSWORD_MAX_BYTES = 72;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const OTP_PATTERN = /^\d{6}$/;

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** At least 8 characters and at most 72 UTF-8 bytes (bcrypt limit). */
export const passwordValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value;
  if (typeof value !== 'string' || value === '') return null; // pair with Validators.required
  if (value.length < PASSWORD_MIN_CHARS) return { passwordTooShort: true };
  if (utf8ByteLength(value) > PASSWORD_MAX_BYTES) return { passwordTooLong: true };
  return null;
};

/** Stricter than Validators.email: requires a dot in the domain, like the server. */
export const emailValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = typeof control.value === 'string' ? control.value.trim() : '';
  if (!value) return null;
  return value.length <= 320 && EMAIL_PATTERN.test(value) ? null : { email: true };
};

export const otpValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = typeof control.value === 'string' ? control.value : '';
  if (!value) return null;
  return OTP_PATTERN.test(value) ? null : { otp: true };
};

/** Group validator: `confirmKey` must equal `key` (confirmation is never sent to the API). */
export function matchingFields(key: string, confirmKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const value = group.get(key)?.value;
    const confirm = group.get(confirmKey)?.value;
    return value && confirm && value !== confirm ? { mismatch: true } : null;
  };
}

export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** Keeps digits only, so a pasted "123 456" or "123-456" becomes "123456". */
export function normalizeOtp(value: unknown): string {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 6);
}

export function passwordErrorText(control: AbstractControl): string {
  if (control.hasError('required')) return 'Password is required';
  if (control.hasError('passwordTooShort')) return `Use at least ${PASSWORD_MIN_CHARS} characters`;
  if (control.hasError('passwordTooLong')) return 'Password is too long (max 72 bytes)';
  return '';
}
