import { Provider } from '@angular/core';
import { NavController } from '@ionic/angular';
import { vi } from 'vitest';
import { AuthUser } from '../core/models/auth.model';

/** Legacy-style Reporter: unverified email that is not required to verify (may sign in). */
export const REPORTER_USER: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111',
  institutionalId: null,
  fullName: 'Test Reporter',
  email: 'reporter@example.test',
  role: 'REPORTER',
  jobTitle: null,
  departmentOrTrade: null,
  phone: null,
  isActive: true,
  emailVerified: false,
  emailVerificationRequired: false,
};

export function apiError(code: string): { error: { code: string; message: string } } {
  return { error: { code, message: 'server text that must not be shown' } };
}

export const STAFF_USER: AuthUser = { ...REPORTER_USER, id: '22222222-2222-4222-8222-222222222222', role: 'MAINTENANCE_STAFF' };

export function navControllerStub() {
  return {
    navigateRoot: vi.fn().mockResolvedValue(true),
    navigateForward: vi.fn().mockResolvedValue(true),
    navigateBack: vi.fn().mockResolvedValue(true),
  };
}

export function provideNavControllerStub(stub = navControllerStub()): Provider {
  return { provide: NavController, useValue: stub };
}

/** Lets pending promise continuations (storage, firstValueFrom) run. */
export function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
