import { TestBed } from '@angular/core/testing';
import { REPORTER_USER } from '../../testing/test-helpers';
import { AuthFlowStore, OTP_COOLDOWN_MS } from './auth-flow.store';
import { SessionStore } from './session.store';

describe('AuthFlowStore', () => {
  let flow: AuthFlowStore;
  let session: SessionStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    flow = TestBed.inject(AuthFlowStore);
    session = TestBed.inject(SessionStore);
  });

  it('counts down a per-purpose resend cooldown', () => {
    flow.startCooldown('EMAIL_VERIFY', 1_000);
    expect(flow.cooldownSeconds('EMAIL_VERIFY', 1_000)).toBe(60);
    expect(flow.cooldownSeconds('EMAIL_VERIFY', 1_000 + OTP_COOLDOWN_MS - 500)).toBe(1);
    expect(flow.cooldownSeconds('EMAIL_VERIFY', 1_000 + OTP_COOLDOWN_MS)).toBe(0);
    expect(flow.cooldownSeconds('PASSWORD_RESET', 1_000)).toBe(0);
  });

  it('holds no codes or passwords and is wiped when the session ends (SEC-05 / ACCT-09)', () => {
    session.setAuthenticated(REPORTER_USER, 't');
    flow.pendingEmailChange.set('new@example.test');
    flow.startCooldown('EMAIL_CHANGE');

    session.setUnauthenticated('SIGNED_OUT');

    expect(flow.pendingEmailChange()).toBeNull();
    expect(flow.cooldownSeconds('EMAIL_CHANGE')).toBe(0);
    expect(Object.keys(flow)).not.toContain('code');
    expect(Object.keys(flow)).not.toContain('password');
  });
});
