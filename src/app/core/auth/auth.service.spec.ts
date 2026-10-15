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
  apiUrl,
} from '../../testing/test-helpers';
import { LocalDbService } from '../storage/local-db.service';
import { AuthFlowStore } from './auth-flow.store';
import { AuthService, LocalDataNotDeletedError } from './auth.service';
import { SecureTokenStorage } from './secure-token-storage.service';
import { SessionStore } from './session.store';

/** Every value in the app's IndexedDB, as text. */
async function allIndexedDbText(): Promise<string> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('seefix-reporter');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const values: unknown[] = [];
  for (const name of Array.from(db.objectStoreNames)) {
    values.push(
      await new Promise((resolve) => {
        const request = db.transaction(name).objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result);
      }),
    );
  }
  db.close();
  return JSON.stringify(values);
}

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
    return httpMock.expectOne(apiUrl('/api/auth/me'));
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
      const req = httpMock.expectOne(apiUrl('/api/auth/login'));
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
        .expectOne(apiUrl('/api/auth/login'))
        .flush(apiError('EMAIL_VERIFICATION_REQUIRED'), { status: 403, statusText: 'Forbidden' });
      await expect(result).rejects.toMatchObject({ kind: 'VERIFICATION_REQUIRED' });
      expect(await storage.get()).toBeNull();
      expect(session.isAuthenticated()).toBe(false);
    });

    it('429 from the login rate limit: rate-limited copy with the Retry-After wait, no session, no navigation', async () => {
      const result = auth.login({ identifier: 'reporter@example.test', password: 'secret-pass' });
      await flushAsync();
      httpMock
        .expectOne(apiUrl('/api/auth/login'))
        .flush(apiError('RATE_LIMITED'), { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '300' } });
      await expect(result).rejects.toMatchObject({ kind: 'RATE_LIMITED', retryAfterMs: 300_000 });
      expect(TestBed.inject(SessionStore).isAuthenticated()).toBe(false);
      expect(nav.navigateRoot).not.toHaveBeenCalled();
    });

    it('surfaces invalid credentials without a session (AUTH-09)', async () => {
      const result = auth.login({ identifier: 'reporter@example.test', password: 'wrong' });
      await flushAsync();
      httpMock.expectOne(apiUrl('/api/auth/login')).flush(apiError('INVALID_CREDENTIALS'), { status: 401, statusText: 'x' });
      await expect(result).rejects.toMatchObject({ kind: 'UNAUTHORIZED', userMessage: 'Incorrect email or password.' });
      expect(nav.navigateRoot).not.toHaveBeenCalled();
    });

    it('denies non-Reporter accounts without storing a token (AUTH-13)', async () => {
      const result = auth.login({ identifier: 'staff@example.test', password: 'secret-pass' });
      await flushAsync();
      httpMock.expectOne(apiUrl('/api/auth/login')).flush({ user: STAFF_USER, accessToken: 'staff-token' });
      await expect(result).rejects.toBeInstanceOf(AppError);
      await expect(result).rejects.toMatchObject({ kind: 'ROLE_DENIED' });
      expect(await storage.get()).toBeNull();
    });
  });

  it('registration never signs in or stores a token (AUTH-02)', async () => {
    const result = auth.register({ fullName: 'New Reporter', email: 'new@example.test', password: 'secret-pass' });
    await flushAsync();
    const req = httpMock.expectOne(apiUrl('/api/auth/register'));
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

  describe('offline session (offline plan P1)', () => {
    const OTHER_REPORTER = { ...REPORTER_USER, id: '33333333-3333-4333-8333-333333333333', email: 'other@example.test' };
    let localDb: LocalDbService;

    beforeEach(() => (localDb = TestBed.inject(LocalDbService)));

    /** Signs in online once, which remembers the verified Reporter for this token. */
    async function verifiedOnce(user = REPORTER_USER, token = 'good-token'): Promise<void> {
      await bootstrapWith(token, (req) => req.flush({ user }));
      expect(session.verified()).toBe(true);
    }

    /** A fresh app start (new services), with the phone's storage kept. */
    async function relaunchOffline(token = 'good-token'): Promise<void> {
      TestBed.resetTestingModule();
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
      localDb = TestBed.inject(LocalDbService);
      httpMock = TestBed.inject(HttpTestingController);
      await bootstrapWith(token, (req) => req.error(new ProgressEvent('error'), { status: 0 }));
    }

    it('an offline relaunch opens as the Reporter last verified with this token', async () => {
      await verifiedOnce();
      await relaunchOffline();

      expect(session.state()).toBe('AUTHENTICATED');
      expect(session.verified()).toBe(false);
      expect(session.user()).toMatchObject({ id: REPORTER_USER.id, fullName: REPORTER_USER.fullName, role: 'REPORTER' });
      expect(await storage.get()).toBe('good-token');
    });

    it('a token the saved identity was not verified with gets no offline session', async () => {
      await verifiedOnce(OTHER_REPORTER, 'other-token');
      await relaunchOffline('good-token');

      expect(session.state()).toBe('OFFLINE_UNVERIFIED');
      expect(session.user()).toBeNull();
    });

    it('back online, the offline session is verified with the server', async () => {
      await verifiedOnce();
      await relaunchOffline();

      const done = auth.reverify();
      (await expectMe()).flush({ user: { ...REPORTER_USER, phone: '0917' } });
      await done;

      expect(session.verified()).toBe(true);
      expect(session.user()?.phone).toBe('0917');
    });

    it('an expired session keeps the Reporter’s offline data; a manual sign-out deletes it', async () => {
      await verifiedOnce();
      await localDb.putAll(REPORTER_USER.id, [{ key: 'outbox/1', value: { description: 'Leak' } }]);
      await relaunchOffline();

      const expired = auth.reverify();
      (await expectMe()).flush(apiError('INVALID_TOKEN'), { status: 401, statusText: 'x' });
      await expired;
      expect(session.notice()).toBe('SESSION_EXPIRED');
      expect(await storage.get()).toBeNull();
      expect(await localDb.keys(REPORTER_USER.id)).toEqual(['outbox/1']);
      expect(await localDb.getIdentity()).toBeUndefined();

      session.setAuthenticated(REPORTER_USER, 'next-token');
      await auth.logout();
      expect(await localDb.keys(REPORTER_USER.id)).toEqual([]);
    });

    it('if deleting the on-device data fails, sign-out stops and nothing changes', async () => {
      await storage.set('token');
      session.setAuthenticated(REPORTER_USER, 'token');
      await localDb.putAll(REPORTER_USER.id, [{ key: 'outbox/1', value: 'unsent' }]);
      vi.spyOn(localDb, 'wipeUser').mockRejectedValueOnce(new Error('IndexedDB unavailable'));

      await expect(auth.logout()).rejects.toBeInstanceOf(LocalDataNotDeletedError);

      expect(session.state()).toBe('AUTHENTICATED');
      expect(await storage.get()).toBe('token');
      expect(await localDb.keys(REPORTER_USER.id)).toEqual(['outbox/1']);
      expect(nav.navigateRoot).not.toHaveBeenCalled();
    });

    it('"Log out anyway" signs out and keeps the data for this Reporter only', async () => {
      await storage.set('token');
      session.setAuthenticated(REPORTER_USER, 'token');
      await localDb.putAll(REPORTER_USER.id, [{ key: 'outbox/1', value: 'unsent' }]);

      await auth.logout({ keepLocalData: true });

      expect(session.state()).toBe('UNAUTHENTICATED');
      expect(await storage.get()).toBeNull();
      expect(await localDb.keys(REPORTER_USER.id)).toEqual(['outbox/1']);
    });

    it('another Reporter signing in never sees the previous Reporter’s data', async () => {
      await localDb.putAll(REPORTER_USER.id, [{ key: 'outbox/1', value: 'first reporter' }]);
      await verifiedOnce(OTHER_REPORTER, 'other-token');

      expect(await localDb.keys(OTHER_REPORTER.id)).toEqual([]);
      expect(await localDb.get(OTHER_REPORTER.id, 'outbox/1')).toBeUndefined();
    });

    it('the access token is never written to IndexedDB', async () => {
      await verifiedOnce(REPORTER_USER, 'secret-jwt-value');
      expect(await allIndexedDbText()).not.toContain('secret-jwt-value');
      expect(await allIndexedDbText()).toContain(REPORTER_USER.id); // the identity itself was saved
    });
  });

  it('a later SESSION_REVOKED after sign-out does not navigate twice', async () => {
    session.setAuthenticated(REPORTER_USER, 'token');
    await auth.endSessionAfterSecurityChange('EMAIL_CHANGED');
    await auth.handleSessionEnded('SESSION_REVOKED');
    expect(nav.navigateRoot).toHaveBeenCalledTimes(1);
    expect(session.notice()).toBe('EMAIL_CHANGED');
  });
});
