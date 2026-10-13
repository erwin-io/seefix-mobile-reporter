import { Injectable, inject } from '@angular/core';
import { AuthUser } from '../models/auth.model';
import { LocalDbService } from '../storage/local-db.service';

/** The minimum the app needs to open offline as the right Reporter. */
export interface VerifiedIdentity {
  /** SHA-256 of the access token: ties the identity to that token without storing the token. */
  tokenHash: string;
  user: Pick<AuthUser, 'id' | 'fullName' | 'email' | 'role' | 'emailVerified' | 'emailVerificationRequired'>;
  verifiedAt: string;
}

/**
 * Remembers the last Reporter the server confirmed (/api/auth/me) so an offline launch knows whose data to show.
 * It is only used with the exact token it was verified with; the token itself stays in secure storage.
 */
@Injectable({ providedIn: 'root' })
export class VerifiedIdentityStore {
  private readonly db = inject(LocalDbService);

  /** Best effort: a storage failure must never block signing in. */
  async remember(user: AuthUser, token: string): Promise<void> {
    try {
      const { id, fullName, email, role, emailVerified, emailVerificationRequired } = user;
      const identity: VerifiedIdentity = {
        tokenHash: await sha256(token),
        user: { id, fullName, email, role, emailVerified, emailVerificationRequired },
        verifiedAt: new Date().toISOString(),
      };
      await this.db.setIdentity(identity);
    } catch {
      // Offline launch is then unavailable until the next successful verification.
    }
  }

  /** The Reporter verified with this exact token, or null. */
  async restore(token: string): Promise<AuthUser | null> {
    try {
      const identity = await this.db.getIdentity<VerifiedIdentity>();
      if (!identity || identity.user.role !== 'REPORTER' || identity.tokenHash !== (await sha256(token))) return null;
      return {
        ...identity.user,
        institutionalId: null,
        jobTitle: null,
        departmentOrTrade: null,
        phone: null,
        isActive: true,
      };
    } catch {
      return null;
    }
  }

  async forget(): Promise<void> {
    await this.db.clearIdentity().catch(() => undefined);
  }
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
