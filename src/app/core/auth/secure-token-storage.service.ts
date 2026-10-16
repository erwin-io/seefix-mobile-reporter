import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

const TOKEN_KEY = 'access_token';
/** Browser-only key (same policy as the Web Admin's session token). */
const WEB_KEY = 'seefix_reporter_access_token';

/**
 * Persists the JWT in the iOS Keychain / Android Keystore on native builds.
 * In a browser (e.g. `ionic serve`) the token lives in sessionStorage: it survives a reload of the tab and is gone
 * when the tab closes, like the Web Admin. Never localStorage / Capacitor Preferences (they outlive the session).
 * If sessionStorage is unavailable (blocked), the token stays in memory and a reload asks to sign in.
 */
@Injectable({ providedIn: 'root' })
export class SecureTokenStorage {
  private readonly native = Capacitor.isNativePlatform();
  private memoryToken: string | null = null;
  private prefixReady: Promise<void> | null = null;

  async get(): Promise<string | null> {
    if (!this.native) return this.memoryToken ?? webGet();
    try {
      await this.ensurePrefix();
      const value = await SecureStorage.get(TOKEN_KEY);
      return typeof value === 'string' && value ? value : null;
    } catch {
      return null;
    }
  }

  async set(token: string): Promise<void> {
    if (!this.native) {
      this.memoryToken = token;
      webSet(token);
      return;
    }
    await this.ensurePrefix();
    await SecureStorage.set(TOKEN_KEY, token);
  }

  async clear(): Promise<void> {
    this.memoryToken = null;
    if (!this.native) {
      webSet(null);
      return;
    }
    try {
      await this.ensurePrefix();
      await SecureStorage.remove(TOKEN_KEY);
    } catch {
      // Nothing stored; treat as cleared.
    }
  }

  private ensurePrefix(): Promise<void> {
    this.prefixReady ??= SecureStorage.setKeyPrefix('seefix_reporter_');
    return this.prefixReady;
  }
}

function webGet(): string | null {
  try {
    return sessionStorage.getItem(WEB_KEY) || null;
  } catch {
    return null;
  }
}

function webSet(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(WEB_KEY, token);
    else sessionStorage.removeItem(WEB_KEY);
  } catch {
    // Storage blocked: the in-memory copy still works until the tab reloads.
  }
}
