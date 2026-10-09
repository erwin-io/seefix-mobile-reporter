import { DestroyRef, Signal, computed, inject, signal } from '@angular/core';
import { AuthFlowStore } from '../../core/auth/auth-flow.store';
import { OtpPurpose } from '../../core/models/account.model';

/**
 * Per-page countdown for "Resend code" (UX guidance only; the server enforces
 * its own cooldown). Must be created in an injection context.
 */
export function createCooldownTimer(purpose: OtpPurpose): { seconds: Signal<number>; start: () => void } {
  const flow = inject(AuthFlowStore);
  const now = signal(Date.now());
  const timer = setInterval(() => now.set(Date.now()), 1000);
  inject(DestroyRef).onDestroy(() => clearInterval(timer));

  return {
    seconds: computed(() => flow.cooldownSeconds(purpose, now())),
    start: () => {
      flow.startCooldown(purpose);
      now.set(Date.now());
    },
  };
}
