import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService, REPORTER_ROLE } from './auth.service';
import { SecureTokenStorage } from './secure-token-storage.service';
import { SessionStore } from './session.store';

/**
 * Defense in depth: the session is only established for REPORTER accounts,
 * but a role change seen via /auth/me must never reveal Reporter screens.
 * Runs alongside `authGuard`, which owns the signed-out / offline redirects.
 * The API remains the authority for access and ownership.
 */
export const reporterRoleGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const auth = inject(AuthService);
  const session = inject(SessionStore);
  const storage = inject(SecureTokenStorage);
  const router = inject(Router);

  await auth.ensureBootstrapped();
  if (session.state() !== 'AUTHENTICATED') return true;
  if (session.user()?.role === REPORTER_ROLE) return true;

  await storage.clear();
  session.setUnauthenticated('ROLE_DENIED');
  return router.parseUrl('/auth/login');
};
