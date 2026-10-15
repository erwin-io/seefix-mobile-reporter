import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { TimeoutError } from 'rxjs';
import { ERROR_COPY, mapHttpError, parseRetryAfter } from './api-error.mapper';

function httpError(status: number, code?: string, message?: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: code ? { error: { code, message } } : null });
}

describe('mapHttpError', () => {
  it('maps INVALID_CREDENTIALS to ordinary copy', () => {
    const error = mapHttpError(httpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.'));
    expect(error.kind).toBe('UNAUTHORIZED');
    expect(error.userMessage).toBe(ERROR_COPY.invalidCredentials);
  });

  it('treats status 0 as offline (not a bad credential)', () => {
    const error = mapHttpError(httpError(0));
    expect(error.kind).toBe('OFFLINE');
    expect(error.isUncertain).toBe(true);
  });

  it('treats an rxjs timeout as uncertain', () => {
    const error = mapHttpError(new TimeoutError());
    expect(error.kind).toBe('TIMEOUT');
    expect(error.isUncertain).toBe(true);
  });

  it('never echoes arbitrary 500 messages', () => {
    const error = mapHttpError(httpError(500, 'INTERNAL_ERROR', 'relation "dbo.Reports" does not exist'));
    expect(error.kind).toBe('SERVER');
    expect(error.userMessage).toBe(ERROR_COPY.server);
  });

  it('uses authored VALIDATION_ERROR messages', () => {
    const error = mapHttpError(httpError(400, 'VALIDATION_ERROR', 'Password must contain at least 8 characters.'));
    expect(error.kind).toBe('VALIDATION');
    expect(error.userMessage).toBe('Password must contain at least 8 characters.');
  });

  it('explains upload rules for rejected images', () => {
    expect(mapHttpError(httpError(413, 'FILE_TOO_LARGE')).userMessage).toBe(ERROR_COPY.uploadInvalid);
    expect(mapHttpError(httpError(415, 'UNSUPPORTED_IMAGE_TYPE')).userMessage).toBe(ERROR_COPY.uploadInvalid);
  });

  it('maps account codes to owned copy (§11.2)', () => {
    expect(mapHttpError(httpError(401, 'INVALID_CREDENTIALS')).userMessage).toBe('Incorrect email or password.');
    expect(mapHttpError(httpError(401, 'CURRENT_PASSWORD_INCORRECT')).userMessage).toBe(ERROR_COPY.currentPasswordIncorrect);
    expect(mapHttpError(httpError(400, 'OTP_INVALID')).userMessage).toBe(ERROR_COPY.otpInvalid);
    expect(mapHttpError(httpError(400, 'OTP_EXPIRED')).userMessage).toBe(ERROR_COPY.otpExpired);
    expect(mapHttpError(httpError(409, 'EMAIL_IN_USE')).userMessage).toBe(ERROR_COPY.emailTaken);
    expect(mapHttpError(httpError(429, 'OTP_COOLDOWN')).kind).toBe('RATE_LIMITED');
  });

  it('never reveals whether a reset email exists (RESET_INVALID looks like a wrong code)', () => {
    expect(mapHttpError(httpError(400, 'RESET_INVALID')).userMessage).toBe(
      mapHttpError(httpError(400, 'OTP_INVALID')).userMessage,
    );
  });

  it('distinguishes the email verification gate from ordinary 403s', () => {
    expect(mapHttpError(httpError(403, 'EMAIL_VERIFICATION_REQUIRED')).kind).toBe('VERIFICATION_REQUIRED');
    expect(mapHttpError(httpError(403, 'FORBIDDEN')).kind).toBe('FORBIDDEN');
  });

  it('classifies SMTP failures without echoing SMTP internals', () => {
    const error = mapHttpError(httpError(503, 'EMAIL_DELIVERY_FAILED', '535 Credentials not accepted'));
    expect(error.kind).toBe('EMAIL_DELIVERY');
    expect(error.userMessage).not.toContain('535');
    expect(error.isUncertain).toBe(false);
  });

  it('maps ownership failures to a safe 403 message', () => {
    const error = mapHttpError(httpError(403, 'FORBIDDEN', 'You cannot access this report.'));
    expect(error.kind).toBe('FORBIDDEN');
    expect(error.userMessage).toBe(ERROR_COPY.forbidden);
  });

  describe('429 from the V2 rate limits (seefix-api#19)', () => {
    const limited = (retryAfter?: string, code: string | undefined = 'RATE_LIMITED') =>
      new HttpErrorResponse({
        status: 429,
        error: code ? { error: { code, message: 'Too many sign-in attempts.' } } : null,
        headers: retryAfter ? new HttpHeaders({ 'Retry-After': retryAfter }) : undefined,
      });

    it('uses generic wait copy, not the code-request wording, and never echoes server text', () => {
      const error = mapHttpError(limited('900'));
      expect(error.kind).toBe('RATE_LIMITED');
      expect(error.userMessage).toBe(ERROR_COPY.rateLimited);
      expect(error.userMessage).not.toContain('code');
      expect(error.retryAfterMs).toBe(900_000);
    });

    it('keeps the specific OTP copy for the existing OTP codes', () => {
      expect(mapHttpError(limited(undefined, 'OTP_RATE_LIMIT')).userMessage).toBe(ERROR_COPY.otpRateLimit);
      expect(mapHttpError(limited(undefined, 'OTP_COOLDOWN')).userMessage).toBe(ERROR_COPY.otpCooldown);
    });

    it('a 429 without a body or Retry-After (cross-origin header hidden) is still RATE_LIMITED with no wait hint', () => {
      const error = mapHttpError(limited(undefined, undefined));
      expect(error).toMatchObject({ kind: 'RATE_LIMITED', userMessage: ERROR_COPY.rateLimited, retryAfterMs: null });
    });

    it('parses Retry-After as seconds or an HTTP date and ignores junk', () => {
      expect(parseRetryAfter('120')).toBe(120_000);
      expect(parseRetryAfter('Thu, 01 Jan 2026 00:01:00 GMT', Date.parse('2026-01-01T00:00:00Z'))).toBe(60_000);
      expect(parseRetryAfter('soon')).toBeNull();
      expect(parseRetryAfter(null)).toBeNull();
    });
  });
});
