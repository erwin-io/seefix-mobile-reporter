import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { authErrorInterceptor } from '../http/auth-error.interceptor';
import { authInterceptor } from '../http/auth.interceptor';
import { AppError } from '../http/api-error.mapper';
import {
  REPORTER_USER,
  STAFF_USER,
  apiError,
  flushAsync,
  navControllerStub,
  provideNavControllerStub,
} from '../../testing/test-helpers';
import { AuthFlowStore } from './auth-flow.store';
import { AuthService } from './auth.service';
import { SecureTokenStorage } from './secure-token-storage.service';
import { SessionStore } from './session.store';

describe('AuthService', () => {
  let auth: AuthService;
  let session: SessionStore;
  let storage: SecureTokenStorage;
  let flow: AuthFlowStore;
  let httpMock: HttpTestingController;
  let nav: ReturnType<typeof navControllerStub>;

  beforeEach(() => {
    nav = navControllerStub();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor, authErrorInterceptor])),
        provideHttpClientTesting(),
        provideNavControllerStub(nav),
      ],
    });
    auth = TestBed.inject(AuthService);
    session = TestBed.inject(SessionStore);
    storage = TestBed.inject(SecureTokenStorage);
    flow = TestBed.inject(AuthFlowStore);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  async function expectMe(): Promise<ReturnType<HttpTestingController['expectOne']>> {
    await flushAsync();
    return httpMock.expectOne('/api/auth/me');
  }

  async function bootstrapWith(token: string, respond: (req: ReturnType<HttpTestingController['expectOne']>) => void) {
    await storage.set(token);
    const done = auth.ensureBootstrapped();
    respond(await expectMe());
    await done;
  }

  describe('bootstrap', () => {
    it('starts INITIALIZING and resolves UNAUTHENTICATED without a token (AUTH-01)', async () => {
      expect(session.state()).toBe('INITIALIZING');
      await auth.ensureBootstrapped();
      expect(session.state()).toBe('UNAUTHENTICATED');
    });

    it('restores a valid Reporter session via /auth/me (AUTH-10)', async () => {
      await bootstrapWith('stored-token', (req) => {
        expect(req.request.headers.get('Authorization')).toBe('Bearer stored-token');
        req.flush({ user: REPORTER_USER });
      });
      expect(session.state()).toBe('AUTHENTICATED');
      expect(session.user()?.emailVerified).toBe(false);
    });

    it('clears an expired token (AUTH-11)', async () => {
      await bootstrapWith('expired', (req) => req.flush(apiError('INVALID_TOKEN'), { status: 401, statusText: 'x' }));
      expect(session.state()).toBe('UNAUTHENTICATED');
      expect(session.notice()).toBe('SESSION_EXPIRED');
      expect(await storage.get()).toBeNull();
    });

    it('clears a revoked token with the security-change notice (AUTH-11 / SEC-04)', async () => {
      await bootstrapWith('revoked', (req) => req.flush(apiError('SESSION_REVOKED'), { status: 401, statusText: 'x' }));
      expect(session.notice()).toBe('SESSION_REVOKED');
      expect(await storage.get()).toBeNull();
    });

    it('treats 403 EMAIL_VERIFICATION_REQUIRED as a verification gate, not as offline', async () => {
      await bootstrapWith('unverified', (req) =>
        req.flush(apiError('EMAIL_VERIFICATION_REQUIRED'), { status: 403, statusText: 'x' }),
      );
      expect(session.state()).toBe('UNAUTHENTICATED');
      expect(session.notice()).toBe('VERIFICATION_REQUIRED');
    });

    it('keeps the credential when the API is unreachable (AUTH-12)', async () => {
      await bootstrapWith('good-token', (req) => req.error(new ProgressEvent('error'), { status: 0 }));
      expect(session.state()).toBe('OFFLINE_UNVERIFIED');
      expect(await storage.get()).toBe('good-token');
    });

    it('rejects a non-Reporter stored session (AUTH-13)', async () => {
      await bootstrapWith('staff', (req) => req.flush({ user: STAFF_USER }));
      expect(session.notice()).toBe('ROLE_DENIED');
      expect(await storage.get()).toBeNull();
    });
  });

  describe('login', () => {
    async function loginFlow(identifier: string): Promise<{ loginBody: unknown; result: Promise<unknown> }> {
      const result = auth.login({ identifier, password: 'secret-pass' });
      await flushAsync();
      const req = httpMock.expectOne('/api/auth/login');
      expect(req.request.headers.has('Authorization')).toBe(false);
      const loginBody = req.request.body;
      req.flush({ user: REPORTER_USER, accessToken: 'new-token' });
      (await expectMe()).flush({ user: REPORTER_USER });
      await result;
      return { loginBody, result };
    }

    it('signs in with an email, sent as the API identifier field (AUTH-04)', async () => {
      const { loginBody } = await loginFlow('reporter@example.test');
      expect(loginBody).toEqual({ identifier: 'reporter@example.test', password: 'secret-pass' });
      expect(session.state()).toBe('AUTHENTICATED');
      expect(await storage.get()).toBe('new-token');
    });

    it('allows a legacy unverified Reporter whose verification is not required (AUTH-08)', async () => {
      await loginFlow('reporter@example.test');
      expect(session.user()?.emailVerified).toBe(false);
      expect(session.user()?.emailVerificationRequired).toBe(false);
    });

    it('surfaces EMAIL_VERIFICATION_REQUIRED without storing a token (AUTH-06)', async () => {
      const result = auth.login({ identifier: 'new@example.test', password: 'secret-pass' });
      await flushAsync();
      httpMock
        .expectOne('/api/auth/login')
        .flush(apiError('EMAIL_VERIFICATION_REQUIRED'), { status: 403, statusText: 'Forbidden' });
      await expect(result).rejects.toMatchObject({ kind: 'VERIFICATION_REQUIRED' });
      expect(await storage.get()).toBeNull();
      expect(session.isAuthenticated()).toBe(false);
    });

    it('surfaces invalid credentials without a session (AUTH-09)', async () => {
      const result = auth.login({ identifier: 'reporter@example.test', password: 'wrong' });
      await flushAsync();
      httpMock.expectOne('/api/auth/login').flush(apiError('INVALID_CREDENTIALS'), { status: 401, statusText: 'x' });
      await expect(result).rejects.toMatchObject({ kind: 'UNAUTHORIZED', userMessage: 'Incorrect email or password.' });
      expect(nav.navigateRoot).not.toHaveBeenCalled();
    });

    it('denies non-Reporter accounts without storing a token (AUTH-13)', async () => {
      const result = auth.login({ identifier: 'staff@example.test', password: 'secret-pass' });
      await flushAsync();
      httpMock.expectOne('/api/auth/login').flush({ user: STAFF_USER, accessToken: 'staff-token' });
      await expect(result).rejects.toBeInstanceOf(AppError);
      await expect(result).rejects.toMatchObject({ kind: 'ROLE_DENIED' });
      expect(await storage.get()).toBeNull();
    });
  });

  it('registration never signs in or stores a token (AUTH-02)', async () => {
    const result = auth.register({ fullName: 'New Reporter', email: 'new@example.test', password: 'secret-pass' });
    await flushAsync();
    const req = httpMock.expectOne('/api/auth/register');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush(
      { user: { ...REPORTER_USER, emailVerificationRequired: true }, emailVerificationRequired: true, message: 'ok' },
      { status: 201, statusText: 'Created' },
    );
    await result;
    expect(session.isAuthenticated()).toBe(false);
    expect(await storage.get()).toBeNull();
  });

  it('logout clears token, user data, flow state and resets stores (AUTH-14)', async () => {
    const reset = vi.fn();
    session.registerReset(reset);
    await storage.set('token');
    session.setAuthenticated(REPORTER_USER, 'token');
    flow.pendingEmailChange.set('new@example.test');

    await auth.logout();

    expect(await storage.get()).toBeNull();
    expect(session.user()).toBeNull();
    expect(flow.pendingEmailChange()).toBeNull();
    expect(reset).toHaveBeenCalled();
    expect(nav.navigateRoot).toHaveBeenCalledWith('/auth/login', { replaceUrl: true });
  });

  it('a security change clears the session before navigating to Login (ACCT-07 / ACCT-10)', async () => {
    await storage.set('token');
    session.setAuthenticated(REPORTER_USER, 'token');

    await auth.endSessionAfterSecurityChange('PASSWORD_CHANGED');

    expect(await storage.get()).toBeNull();
    expect(session.accessToken()).toBeNull();
    expect(session.notice()).toBe('PASSWORD_CHANGED');
    expect(nav.navigateRoot).toHaveBeenCalledTimes(1);
  });

  it('a later SESSION_REVOKED after sign-out does not navigate twice', async () => {
    session.setAuthenticated(REPORTER_USER, 'token');
    await auth.endSessionAfterSecurityChange('EMAIL_CHANGED');
    await auth.handleSessionEnded('SESSION_REVOKED');
    expect(nav.navigateRoot).toHaveBeenCalledTimes(1);
    expect(session.notice()).toBe('EMAIL_CHANGED');
  });
});
