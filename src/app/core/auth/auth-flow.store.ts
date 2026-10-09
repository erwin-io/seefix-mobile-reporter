import { Injectable, inject, signal } from '@angular/core';
import { OtpPurpose } from '../models/account.model';
import { SessionStore } from './session.store';

/** Server issues at most one code per purpose per minute. */
export const OTP_COOLDOWN_MS = 60_000;

/**
 * Transient account-flow state shared between screens (memory only).
 * Holds email addresses so they never travel in route URLs.
 * Never holds OTP codes or passwords; app restarts simply restart the flow.
 */
@Injectable({ providedIn: 'root' })
export class AuthFlowStore {
  /** Email awaiting first-time verification (Register / Login → Verify Email). */
  readonly verificationEmail = signal<string | null>(null);
  /** Set when registration created the account but the code email could not be sent. */
  readonly verificationDeliveryFailed = signal(false);
  /** Email used for Forgot Password → Reset Password. */
  readonly resetEmail = signal<string | null>(null);
  /** New, NOT yet active email address awaiting confirmation. */
  readonly pendingEmailChange = signal<string | null>(null);

  private readonly cooldownUntil = signal<Partial<Record<OtpPurpose, number>>>({});

  constructor() {
    inject(SessionStore).registerReset(() => this.clear());
  }

  startCooldown(purpose: OtpPurpose, now = Date.now()): void {
    this.cooldownUntil.update((map) => ({ ...map, [purpose]: now + OTP_COOLDOWN_MS }));
  }

  /** Whole seconds until another code may be requested (UX guidance; the server is authoritative). */
  cooldownSeconds(purpose: OtpPurpose, now = Date.now()): number {
    const until = this.cooldownUntil()[purpose] ?? 0;
    return Math.max(0, Math.ceil((until - now) / 1000));
  }

  clear(): void {
    this.verificationEmail.set(null);
    this.verificationDeliveryFailed.set(false);
    this.resetEmail.set(null);
    this.pendingEmailChange.set(null);
    this.cooldownUntil.set({});
  }
}
