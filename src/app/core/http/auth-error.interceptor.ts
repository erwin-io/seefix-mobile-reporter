import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { tap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { SessionStore } from '../auth/session.store';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { SessionNotice } from '../models/auth.model';
import { SESSION_ENDING_CODES } from './api-error.mapper';
import { isOwnApiRequest } from './auth.interceptor';
import { SKIP_UNAUTHORIZED_HANDLER } from './http-context.tokens';

/**
 * Ends the session once when an authenticated request proves the JWT is no
 * longer usable. `401 CURRENT_PASSWORD_INCORRECT` and ordinary 403s
 * (e.g. report ownership) never sign the user out.
 */
export const authErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const env = inject(APP_ENVIRONMENT);
  const session = inject(SessionStore);
  const injector = inject(Injector);

  if (!isOwnApiRequest(req.url, env.apiBaseUrl) || req.context.get(SKIP_UNAUTHORIZED_HANDLER)) return next(req);
  const hadSession = session.accessToken() !== null;

  return next(req).pipe(
    tap({
      error: (error: unknown) => {
        if (!hadSession || !(error instanceof HttpErrorResponse)) return;
        const notice = sessionEndingNotice(error);
        // Resolved lazily to avoid an HttpClient <-> AuthService construction cycle.
        if (notice) void injector.get(AuthService).handleSessionEnded(notice);
      },
    }),
  );
};

export function sessionEndingNotice(error: HttpErrorResponse): SessionNotice | null {
  const code = (error.error as { error?: { code?: string } } | null)?.error?.code ?? null;
  if (error.status === 401 && (code === null || SESSION_ENDING_CODES.has(code))) {
    return code === 'SESSION_REVOKED' ? 'SESSION_REVOKED' : 'SESSION_EXPIRED';
  }
  if (error.status === 403 && code === 'EMAIL_VERIFICATION_REQUIRED') return 'VERIFICATION_REQUIRED';
  return null;
}
