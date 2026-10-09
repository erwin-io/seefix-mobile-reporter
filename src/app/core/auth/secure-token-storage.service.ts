import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

const TOKEN_KEY = 'access_token';

/**
 * Persists the JWT in the iOS Keychain / Android Keystore on native builds.
 * On the web the token lives in memory only, so a page reload requires sign-in.
 * Never fall back to localStorage / Capacitor Preferences for the token.
 */
@Injectable({ providedIn: 'root' })
export class SecureTokenStorage {
  private readonly native = Capacitor.isNativePlatform();
  private memoryToken: string | null = null;
  private prefixReady: Promise<void> | null = null;

  async get(): Promise<string | null> {
    if (!this.native) return this.memoryToken;
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
      return;
    }
    await this.ensurePrefix();
    await SecureStorage.set(TOKEN_KEY, token);
  }

  async clear(): Promise<void> {
    this.memoryToken = null;
    if (!this.native) return;
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
