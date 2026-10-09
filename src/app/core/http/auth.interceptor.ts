import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { SessionStore } from '../auth/session.store';
import { SKIP_AUTH } from './http-context.tokens';

/** True only for requests to seefix-api (never the image CDN or third parties). */
export function isOwnApiRequest(url: string, apiBaseUrl: string): boolean {
  if (apiBaseUrl === '') return url.startsWith('/api/');
  return url.startsWith(`${apiBaseUrl}/api/`);
}

/** Attaches the session JWT to seefix-api requests only. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const env = inject(APP_ENVIRONMENT);
  const token = inject(SessionStore).accessToken();

  if (!token || req.context.get(SKIP_AUTH) || !isOwnApiRequest(req.url, env.apiBaseUrl)) return next(req);
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
