import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { DEFAULT_HOME } from './auth.guard';
import { SessionStore } from './session.store';

/** Keeps a signed-in Reporter away from Login / Register. */
export const guestGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const auth = inject(AuthService);
  const session = inject(SessionStore);
  const router = inject(Router);

  await auth.ensureBootstrapped();
  return session.state() === 'AUTHENTICATED' ? router.parseUrl(DEFAULT_HOME) : true;
};
