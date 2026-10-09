export type UserRole =
  | 'REPORTER'
  | 'MAINTENANCE_STAFF'
  | 'MAINTENANCE_SUPERVISOR'
  | 'PROCUREMENT'
  | 'WORKER'
  | 'ADMIN';

/** Sanitized `publicUser` returned by every /api/auth endpoint (camelCase). */
export interface AuthUser {
  id: string;
  institutionalId: string | null;
  fullName: string;
  email: string;
  role: UserRole | string;
  jobTitle: string | null;
  departmentOrTrade: string | null;
  phone: string | null;
  isActive: boolean;
  /** True only when the current email address was confirmed with an OTP. */
  emailVerified: boolean;
  /** False for legacy accounts: they may sign in while `emailVerified` is false. */
  emailVerificationRequired: boolean;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

export interface MeResponse {
  user: AuthUser;
}

/** The Reporter app signs in by email; seefix-api names that field `identifier`. */
export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface RegisterRequest {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
}

/** Registration never returns an access token; the email must be verified first. */
export interface RegisterResponse {
  user: AuthUser;
  emailVerificationRequired: true;
  message: string;
}

export type SessionState = 'INITIALIZING' | 'AUTHENTICATED' | 'UNAUTHENTICATED' | 'OFFLINE_UNVERIFIED';

/** One-shot message shown on the Login screen after a session ends or an account flow completes. */
export type SessionNotice =
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'ROLE_DENIED'
  | 'VERIFICATION_REQUIRED'
  | 'SIGNED_OUT'
  | 'EMAIL_VERIFIED'
  | 'PASSWORD_RESET'
  | 'PASSWORD_CHANGED'
  | 'EMAIL_CHANGED';
