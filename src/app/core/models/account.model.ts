import { AuthUser } from './auth.model';

/** Generic `{message}` responses (resend, forgot-password, reset, change-password). */
export interface MessageResponse {
  message: string;
}

export interface UserMessageResponse {
  user: AuthUser;
  message: string;
}

export interface VerifyEmailRequest {
  email: string;
  code: string;
}

export interface VerifyEmailResponse {
  verified: true;
  message: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  newPassword: string;
}

/** Reporter may only edit these profile fields; send changed fields only. */
export interface UpdateProfileRequest {
  fullName?: string;
  phone?: string | null;
}

export interface ChangeEmailRequest {
  newEmail: string;
  currentPassword: string;
}

/** Reporter: the new email stays pending until its OTP is confirmed. */
export interface ChangeEmailResponse {
  pendingEmail: string;
  verificationRequired: true;
  message: string;
}

export interface ConfirmEmailChangeRequest {
  newEmail: string;
  code: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** OTP purposes; each has its own server-side cooldown. */
export type OtpPurpose = 'EMAIL_VERIFY' | 'EMAIL_CHANGE' | 'PASSWORD_RESET';
