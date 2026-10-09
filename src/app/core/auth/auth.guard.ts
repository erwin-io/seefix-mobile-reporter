import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { SessionStore } from './session.store';

const DEFAULT_HOME = '/tabs/home';

/** Only internal, non-auth app paths may be used as a post-login destination. */
export function safeReturnUrl(url: unknown): string {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//') || url.startsWith('/auth')) {
    return DEFAULT_HOME;
  }
  return url;
}

/** Waits for session bootstrap, then admits only an authenticated session. */
export const authGuard: CanActivateFn = async (_route, state): Promise<boolean | UrlTree> => {
  const auth = inject(AuthService);
  const session = inject(SessionStore);
  const router = inject(Router);

  await auth.ensureBootstrapped();

  switch (session.state()) {
    case 'AUTHENTICATED':
      return true;
    case 'OFFLINE_UNVERIFIED':
      // Launch screen offers Retry without discarding the stored credential.
      return router.createUrlTree(['/'], { queryParams: { returnUrl: state.url } });
    default:
      return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
  }
};

export { DEFAULT_HOME };
