import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../http/api-client.service';
import { SKIP_AUTH, SKIP_UNAUTHORIZED_HANDLER } from '../http/http-context.tokens';
import {
  MessageResponse,
  ResetPasswordRequest,
  VerifyEmailRequest,
  VerifyEmailResponse,
} from '../models/account.model';
import { AuthResponse, LoginRequest, MeResponse, RegisterRequest, RegisterResponse } from '../models/auth.model';

/** Public /api/auth identity requests. None of them send a stored JWT. */
@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly api = inject(ApiClient);

  register(request: RegisterRequest): Observable<RegisterResponse> {
    return this.api.post<RegisterResponse>('/api/auth/register', request, { context: publicContext() });
  }

  verifyEmail(request: VerifyEmailRequest): Observable<VerifyEmailResponse> {
    return this.api.post<VerifyEmailResponse>('/api/auth/verify-email', request, { context: publicContext() });
  }

  /** Generic response by design: it never reveals whether the account exists. */
  resendVerification(email: string): Observable<MessageResponse> {
    return this.api.post<MessageResponse>('/api/auth/resend-verification', { email }, { context: publicContext() });
  }

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.api.post<AuthResponse>('/api/auth/login', request, { context: publicContext() });
  }

  /** Generic response by design: it never reveals whether the account exists. */
  forgotPassword(email: string): Observable<MessageResponse> {
    return this.api.post<MessageResponse>('/api/auth/forgot-password', { email }, { context: publicContext() });
  }

  resetPassword(request: ResetPasswordRequest): Observable<MessageResponse> {
    return this.api.post<MessageResponse>('/api/auth/reset-password', request, { context: publicContext() });
  }

  /** Validates a token that is not (yet) the active session token. */
  meWithToken(token: string): Observable<MeResponse> {
    return this.api.get<MeResponse>('/api/auth/me', {
      context: publicContext(),
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

function publicContext(): HttpContext {
  return new HttpContext().set(SKIP_AUTH, true).set(SKIP_UNAUTHORIZED_HANDLER, true);
}
