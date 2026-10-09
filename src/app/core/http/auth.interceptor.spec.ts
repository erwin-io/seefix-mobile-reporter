import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { SessionStore } from '../auth/session.store';
import { REPORTER_USER, apiError, provideNavControllerStub } from '../../testing/test-helpers';
import { authErrorInterceptor } from './auth-error.interceptor';
import { authInterceptor, isOwnApiRequest } from './auth.interceptor';

describe('auth interceptors', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  const authStub = { handleSessionEnded: vi.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    authStub.handleSessionEnded.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor, authErrorInterceptor])),
        provideHttpClientTesting(),
        provideNavControllerStub(),
        { provide: AuthService, useValue: authStub },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(SessionStore).setAuthenticated(REPORTER_USER, 'jwt-token');
  });

  afterEach(() => httpMock.verify());

  function failWith(url: string, status: number, code: string): void {
    http.get(url).subscribe({ error: () => undefined });
    httpMock.expectOne(url).flush(apiError(code), { status, statusText: 'Error' });
  }

  it('adds the bearer token to seefix-api requests', () => {
    http.get('/api/reports/my').subscribe();
    const req = httpMock.expectOne('/api/reports/my');
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-token');
    req.flush({ items: [] });
  });

  it('never sends the token to the image CDN or other origins (SEC-02)', () => {
    http.get('https://res.cloudinary.com/demo/image.jpg').subscribe();
    const req = httpMock.expectOne('https://res.cloudinary.com/demo/image.jpg');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush('');
  });

  it('ends the session on an expired token', () => {
    failWith('/api/notifications', 401, 'INVALID_TOKEN');
    expect(authStub.handleSessionEnded).toHaveBeenCalledWith('SESSION_EXPIRED');
  });

  it('shows the security-change message for SESSION_REVOKED (SEC-04)', () => {
    failWith('/api/auth/me', 401, 'SESSION_REVOKED');
    expect(authStub.handleSessionEnded).toHaveBeenCalledWith('SESSION_REVOKED');
  });

  it('does NOT sign out on a wrong current password (401 CURRENT_PASSWORD_INCORRECT)', () => {
    failWith('/api/auth/me/change-password', 401, 'CURRENT_PASSWORD_INCORRECT');
    expect(authStub.handleSessionEnded).not.toHaveBeenCalled();
  });

  it('does not sign out on an ordinary 403 (report ownership)', () => {
    failWith('/api/reports/x', 403, 'FORBIDDEN');
    expect(authStub.handleSessionEnded).not.toHaveBeenCalled();
  });

  it('routes a protected 403 EMAIL_VERIFICATION_REQUIRED to verification', () => {
    failWith('/api/reports/my', 403, 'EMAIL_VERIFICATION_REQUIRED');
    expect(authStub.handleSessionEnded).toHaveBeenCalledWith('VERIFICATION_REQUIRED');
  });
});

describe('isOwnApiRequest', () => {
  it('matches only the configured API origin', () => {
    expect(isOwnApiRequest('/api/auth/me', '')).toBe(true);
    expect(isOwnApiRequest('http://10.0.2.2:3000/api/auth/me', 'http://10.0.2.2:3000')).toBe(true);
    expect(isOwnApiRequest('http://10.0.2.2:3000.evil.test/api/x', 'http://10.0.2.2:3000')).toBe(false);
    expect(isOwnApiRequest('https://res.cloudinary.com/api/x', '')).toBe(false);
  });
});
