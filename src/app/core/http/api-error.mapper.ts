import { HttpErrorResponse } from '@angular/common/http';
import { TimeoutError } from 'rxjs';

export type AppErrorKind =
  | 'OFFLINE'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VERIFICATION_REQUIRED'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'EMAIL_DELIVERY'
  | 'SERVER'
  | 'ROLE_DENIED'
  | 'UNKNOWN';

/** Normalized, user-safe error. `userMessage` is always safe to display. */
export class AppError extends Error {
  constructor(
    readonly kind: AppErrorKind,
    readonly userMessage: string,
    readonly code: string | null = null,
    readonly status: number | null = null,
    /** Server-provided structured details (e.g. `activeReport` on ACTIVE_REPORT_EXISTS). */
    readonly details: Record<string, unknown> | null = null,
  ) {
    super(userMessage);
    this.name = 'AppError';
  }

  /** True when the request may have reached the server but no response was received. */
  get isUncertain(): boolean {
    return this.kind === 'TIMEOUT' || this.kind === 'OFFLINE';
  }
}

export const ERROR_COPY = {
  offline: "You're offline. Check your connection and retry.",
  timeout: 'The server took too long to respond. Please try again.',
  sessionExpired: 'Your session has expired. Please sign in again.',
  sessionRevoked: 'Your account security details changed. Please sign in again.',
  roleDenied: 'This app is available to Reporter accounts.',
  verificationRequired: 'Verify your email before signing in.',
  forbidden: "You don't have access to this item.",
  notFound: "We couldn't find what you were looking for.",
  server: 'Something went wrong on our side. Please try again.',
  invalidCredentials: 'Incorrect email or password.',
  currentPasswordIncorrect: 'Current password is incorrect.',
  emailTaken: 'This email is already in use.',
  invalidEmail: 'Enter a valid email address.',
  invalidPassword: 'Use a password of at least 8 characters and at most 72 UTF-8 bytes.',
  invalidCodeFormat: 'Enter the six-digit code.',
  otpInvalid: 'The code is incorrect. Check it and try again.',
  otpExpired: 'This code has expired or can no longer be used. Request a new one.',
  otpCooldown: 'Please wait a minute before requesting another code.',
  otpRateLimit: 'Too many code requests. Please try again later.',
  emailDelivery: "We couldn't send the email right now. Please try again in a minute.",
  uploadInvalid: 'Upload 1–5 JPEG, PNG or WebP photos (up to 10 MB each).',
  uploadUncertain: "We couldn't confirm whether your report was submitted. Check My Reports before trying again.",
} as const;

/** Server codes whose copy we own (never echo arbitrary server text). */
const CODE_COPY: Record<string, string> = {
  INVALID_CREDENTIALS: ERROR_COPY.invalidCredentials,
  AUTH_REQUIRED: ERROR_COPY.sessionExpired,
  INVALID_TOKEN: ERROR_COPY.sessionExpired,
  SESSION_REVOKED: ERROR_COPY.sessionRevoked,
  INACTIVE_ACCOUNT: 'This account is inactive. Please contact support.',
  ACCOUNT_NOT_FOUND: 'This account is inactive. Please contact support.',
  EMAIL_VERIFICATION_REQUIRED: ERROR_COPY.verificationRequired,
  CURRENT_PASSWORD_INCORRECT: ERROR_COPY.currentPasswordIncorrect,
  FORBIDDEN: ERROR_COPY.forbidden,
  FIELD_NOT_EDITABLE: 'This detail cannot be edited in the Reporter app.',
  INVALID_EMAIL: ERROR_COPY.invalidEmail,
  INVALID_PASSWORD: ERROR_COPY.invalidPassword,
  INVALID_CODE_FORMAT: ERROR_COPY.invalidCodeFormat,
  OTP_INVALID: ERROR_COPY.otpInvalid,
  // Unknown reset email is reported like a wrong code so the app never confirms account existence.
  RESET_INVALID: ERROR_COPY.otpInvalid,
  OTP_EXPIRED: ERROR_COPY.otpExpired,
  OTP_COOLDOWN: ERROR_COPY.otpCooldown,
  OTP_RATE_LIMIT: ERROR_COPY.otpRateLimit,
  VERIFICATION_INVALID: "This email can't be verified. If it's already verified, sign in.",
  EMAIL_UNCHANGED: 'Enter a different email address.',
  PASSWORD_UNCHANGED: 'Your new password must be different from your current password.',
  EMAIL_IN_USE: ERROR_COPY.emailTaken,
  EMAIL_DELIVERY_FAILED: ERROR_COPY.emailDelivery,
  EMAIL_SERVICE_UNAVAILABLE: ERROR_COPY.emailDelivery,
  REPORT_NOT_FOUND: "This report doesn't exist or is no longer available.",
  NOTIFICATION_NOT_FOUND: 'This notification is no longer available.',
  IMAGE_REQUIRED: 'Add at least one photo of the issue.',
  UNSUPPORTED_IMAGE_TYPE: ERROR_COPY.uploadInvalid,
  FILE_TOO_LARGE: ERROR_COPY.uploadInvalid,
  UPLOAD_ERROR: ERROR_COPY.uploadInvalid,
  INVALID_LOCATION: 'The selected location is no longer available. Please choose another.',
  ACTIVE_REPORT_EXISTS:
    'You already have a report in progress. You can submit a new one after it is resolved, closed or cancelled.',
  CANCELLATION_WINDOW_CLOSED:
    'This report can no longer be cancelled. The Maintenance Team has already started reviewing it.',
  MAINTENANCE_ALREADY_STARTED:
    'This report can no longer be cancelled. The Maintenance Team has already started reviewing it.',
  CANCELLATION_REASON_REQUIRED: 'Tell us why you are cancelling (5–500 characters).',
  INVALID_CANCELLATION_REASON: 'The reason must be 5 to 500 characters.',
  CANCELLATION_AUDIT_FAILED: "We couldn't record the cancellation. Please try again.",
};

/** 401 codes that mean "this token can no longer be used" (vs. a wrong current password). */
export const SESSION_ENDING_CODES = new Set(['AUTH_REQUIRED', 'INVALID_TOKEN', 'SESSION_REVOKED', 'INACTIVE_ACCOUNT']);

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

export function mapHttpError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof TimeoutError) return new AppError('TIMEOUT', ERROR_COPY.timeout, 'TIMEOUT');
  if (!(error instanceof HttpErrorResponse)) return new AppError('UNKNOWN', ERROR_COPY.server);

  const status = error.status;
  const body = (error.error ?? {}) as ApiErrorBody;
  const code = typeof body.error?.code === 'string' ? body.error.code : null;
  const known = code ? CODE_COPY[code] : undefined;

  if (status === 0) return new AppError('OFFLINE', ERROR_COPY.offline, 'NETWORK', 0);
  if (status === 401) return new AppError('UNAUTHORIZED', known ?? ERROR_COPY.sessionExpired, code, status);
  if (status === 403) {
    if (code === 'EMAIL_VERIFICATION_REQUIRED') {
      return new AppError('VERIFICATION_REQUIRED', ERROR_COPY.verificationRequired, code, status);
    }
    return new AppError('FORBIDDEN', known ?? ERROR_COPY.forbidden, code, status);
  }
  if (status === 404) return new AppError('NOT_FOUND', known ?? ERROR_COPY.notFound, code, status);
  if (status === 409) {
    const details =
      body.error?.details && typeof body.error.details === 'object' ? (body.error.details as Record<string, unknown>) : null;
    return new AppError('CONFLICT', known ?? 'This conflicts with an existing record.', code, status, details);
  }
  if (status === 429) return new AppError('RATE_LIMITED', known ?? ERROR_COPY.otpRateLimit, code, status);
  if (status === 503 && (code === 'EMAIL_DELIVERY_FAILED' || code === 'EMAIL_SERVICE_UNAVAILABLE')) {
    return new AppError('EMAIL_DELIVERY', ERROR_COPY.emailDelivery, code, status);
  }
  if (status === 400 || status === 413 || status === 415 || status === 422) {
    // VALIDATION_ERROR messages are authored, field-level strings in seefix-api.
    const message =
      known ?? (code === 'VALIDATION_ERROR' && body.error?.message ? body.error.message : 'Please check the form and try again.');
    return new AppError('VALIDATION', message, code, status);
  }
  if (status === 504 || status === 408) return new AppError('TIMEOUT', ERROR_COPY.timeout, code, status);
  return new AppError('SERVER', ERROR_COPY.server, code, status);
}
