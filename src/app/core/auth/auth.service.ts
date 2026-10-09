import { Injectable, inject } from '@angular/core';
import { NavController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { AppError, ERROR_COPY, SESSION_ENDING_CODES, mapHttpError } from '../http/api-error.mapper';
import { AuthUser, LoginRequest, RegisterRequest, RegisterResponse, SessionNotice } from '../models/auth.model';
import { AccountApiService } from './account.api.service';
import { AuthApiService } from './auth.api.service';
import { AuthFlowStore } from './auth-flow.store';
import { SecureTokenStorage } from './secure-token-storage.service';
import { SessionStore } from './session.store';

export const REPORTER_ROLE = 'REPORTER';

/** Session lifecycle: sign-in, bootstrap, sign-out and forced re-authentication. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly authApi = inject(AuthApiService);
  private readonly accountApi = inject(AccountApiService);
  private readonly session = inject(SessionStore);
  private readonly flow = inject(AuthFlowStore);
  private readonly storage = inject(SecureTokenStorage);
  private readonly nav = inject(NavController);
  private bootstrapPromise: Promise<void> | null = null;
  private ending = false;

  /** Resolves once the stored session has been checked. Safe to call repeatedly. */
  ensureBootstrapped(): Promise<void> {
    this.bootstrapPromise ??= this.bootstrap();
    return this.bootstrapPromise;
  }

  /** Retries verification after an offline launch. */
  retryBootstrap(): Promise<void> {
    this.bootstrapPromise = this.bootstrap();
    return this.bootstrapPromise;
  }

  /**
   * `identifier` is the Reporter's email. Throws AppError kind
   * `VERIFICATION_REQUIRED` for a new Reporter who has not verified their email.
   */
  async login(request: LoginRequest): Promise<AuthUser> {
    const response = await firstValueFrom(this.authApi.login(request));
    if (response.user?.role !== REPORTER_ROLE) throw roleDenied();
    // Confirm the account against the database before entering the app.
    const { user } = await firstValueFrom(this.authApi.meWithToken(response.accessToken));
    if (user.role !== REPORTER_ROLE) throw roleDenied();
    await this.storage.set(response.accessToken);
    this.session.setAuthenticated(user, response.accessToken);
    this.bootstrapPromise = Promise.resolve();
    return user;
  }

  /** Creates the account only. No token is issued until the email is verified. */
  register(request: RegisterRequest): Promise<RegisterResponse> {
    return firstValueFrom(this.authApi.register(request));
  }

  /** Refreshes the signed-in user's profile from /api/auth/me. */
  async refreshMe(): Promise<AuthUser> {
    const { user } = await firstValueFrom(this.accountApi.me());
    this.session.updateUser(user);
    return user;
  }

  async logout(): Promise<void> {
    await this.endSession('SIGNED_OUT');
  }

  /** Called by the auth-error interceptor when a protected request proves the token unusable. */
  async handleSessionEnded(notice: SessionNotice): Promise<void> {
    if (this.session.state() === 'UNAUTHENTICATED') return;
    await this.endSession(notice);
  }

  /**
   * After a successful password change or confirmed email change the server has
   * revoked every JWT: clear local state first so no background request can race.
   */
  async endSessionAfterSecurityChange(
    notice: 'PASSWORD_CHANGED' | 'EMAIL_CHANGED',
    beforeNavigate?: () => Promise<void>,
  ): Promise<void> {
    await this.endSession(notice, beforeNavigate);
  }

  /** `beforeNavigate` runs after local credentials are gone (e.g. a success screen), before Login opens. */
  private async endSession(notice: SessionNotice, beforeNavigate?: () => Promise<void>): Promise<void> {
    if (this.ending) return;
    this.ending = true;
    try {
      await this.storage.clear();
      this.session.setUnauthenticated(notice);
      this.bootstrapPromise = Promise.resolve();
      await beforeNavigate?.();
      // Root navigation resets history, so Back cannot reopen protected pages.
      await this.nav.navigateRoot('/auth/login', { replaceUrl: true });
    } finally {
      this.ending = false;
    }
  }

  private async bootstrap(): Promise<void> {
    const token = await this.storage.get();
    if (!token) {
      this.session.setUnauthenticated(this.session.notice());
      return;
    }
    try {
      const { user } = await firstValueFrom(this.authApi.meWithToken(token));
      if (user.role !== REPORTER_ROLE) {
        await this.storage.clear();
        this.session.setUnauthenticated('ROLE_DENIED');
        return;
      }
      this.session.setAuthenticated(user, token);
    } catch (error) {
      const appError = mapHttpError(error);
      const notice = bootstrapFailureNotice(appError);
      if (notice) {
        await this.storage.clear();
        this.session.setUnauthenticated(notice);
        if (notice === 'VERIFICATION_REQUIRED') this.flow.verificationEmail.set(null);
      } else {
        // Network or server trouble is not a bad credential: keep it and let the user retry.
        this.session.setOfflineUnverified(token);
      }
    }
  }
}

/** Which stored-token failures prove the credential is unusable (vs. a transient outage). */
export function bootstrapFailureNotice(error: AppError): SessionNotice | null {
  if (error.kind === 'VERIFICATION_REQUIRED') return 'VERIFICATION_REQUIRED';
  if (error.kind === 'UNAUTHORIZED' && (error.code === null || SESSION_ENDING_CODES.has(error.code))) {
    return error.code === 'SESSION_REVOKED' ? 'SESSION_REVOKED' : 'SESSION_EXPIRED';
  }
  return null;
}

function roleDenied(): AppError {
  return new AppError('ROLE_DENIED', ERROR_COPY.roleDenied, 'ROLE_DENIED', 403);
}
