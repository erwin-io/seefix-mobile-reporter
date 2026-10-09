import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { REPORTER_USER, STAFF_USER } from '../../testing/test-helpers';
import { authGuard, safeReturnUrl } from './auth.guard';
import { AuthService } from './auth.service';
import { guestGuard } from './guest.guard';
import { reporterRoleGuard } from './reporter-role.guard';
import { SessionStore } from './session.store';

describe('route guards', () => {
  let session: SessionStore;
  let router: Router;
  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/reports/abc' } as RouterStateSnapshot;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { ensureBootstrapped: () => Promise.resolve() } }],
    });
    session = TestBed.inject(SessionStore);
    router = TestBed.inject(Router);
  });

  const run = <T>(fn: () => T) => TestBed.runInInjectionContext(fn);

  it('authGuard redirects to login with returnUrl when signed out', async () => {
    session.setUnauthenticated();
    const result = (await run(() => authGuard(route, state))) as UrlTree;
    expect(router.serializeUrl(result)).toBe('/auth/login?returnUrl=%2Freports%2Fabc');
  });

  it('authGuard admits an authenticated session', async () => {
    session.setAuthenticated(REPORTER_USER, 't');
    expect(await run(() => authGuard(route, state))).toBe(true);
  });

  it('authGuard sends an unverified offline session to the launch retry screen', async () => {
    session.setOfflineUnverified('t');
    const result = (await run(() => authGuard(route, state))) as UrlTree;
    expect(router.serializeUrl(result)).toBe('/?returnUrl=%2Freports%2Fabc');
  });

  it('guestGuard sends a signed-in Reporter to Home', async () => {
    session.setAuthenticated(REPORTER_USER, 't');
    const result = (await run(() => guestGuard(route, state))) as UrlTree;
    expect(router.serializeUrl(result)).toBe('/tabs/home');
  });

  it('reporterRoleGuard rejects other roles and clears the session', async () => {
    session.setAuthenticated(STAFF_USER, 't');
    const result = (await run(() => reporterRoleGuard(route, state))) as UrlTree;
    expect(router.serializeUrl(result)).toBe('/auth/login');
    expect(session.isAuthenticated()).toBe(false);
    expect(session.notice()).toBe('ROLE_DENIED');
  });

  it('reporterRoleGuard leaves signed-out sessions to authGuard (no false role notice)', async () => {
    session.setUnauthenticated();
    expect(await run(() => reporterRoleGuard(route, state))).toBe(true);
    expect(session.notice()).toBeNull();
  });

  it('safeReturnUrl only allows internal app paths', () => {
    expect(safeReturnUrl('/reports/1')).toBe('/reports/1');
    expect(safeReturnUrl('//evil.test')).toBe('/tabs/home');
    expect(safeReturnUrl('https://evil.test')).toBe('/tabs/home');
    expect(safeReturnUrl('/auth/login')).toBe('/tabs/home');
    expect(safeReturnUrl(null)).toBe('/tabs/home');
  });
});
