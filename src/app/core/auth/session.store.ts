import { Injectable, computed, signal } from '@angular/core';
import { AuthUser, SessionNotice, SessionState } from '../models/auth.model';

/**
 * In-memory session state. Starts INITIALIZING so routes wait for bootstrap
 * instead of flashing Login then Home.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly _state = signal<SessionState>('INITIALIZING');
  private readonly _user = signal<AuthUser | null>(null);
  private readonly _token = signal<string | null>(null);
  private readonly _notice = signal<SessionNotice | null>(null);
  private readonly _verified = signal(false);
  private readonly resetHandlers = new Set<() => void>();
  private _generation = 0;

  /** Changes whenever a session ends or another account signs in; work started under an older value is stale. */
  get generation(): number {
    return this._generation;
  }

  readonly state = this._state.asReadonly();
  readonly user = this._user.asReadonly();
  readonly accessToken = this._token.asReadonly();
  readonly notice = this._notice.asReadonly();
  /** False while the app runs offline on the saved verified identity; true once the server confirmed the token. */
  readonly verified = this._verified.asReadonly();
  readonly isAuthenticated = computed(() => this._state() === 'AUTHENTICATED');
  readonly firstName = computed(() => this._user()?.fullName?.trim().split(/\s+/)[0] ?? '');

  setAuthenticated(user: AuthUser, token: string, verified = true): void {
    // A different account must never see the previous account's cached data.
    if (this._user() && this._user()?.id !== user.id) this.runResets();
    this._token.set(token);
    this._user.set(user);
    this._verified.set(verified);
    this._state.set('AUTHENTICATED');
    this._notice.set(null);
  }

  updateUser(user: AuthUser): void {
    this._user.set(user);
  }

  /** A token exists but could not be verified because the API is unreachable. */
  setOfflineUnverified(token: string): void {
    this._token.set(token);
    this._state.set('OFFLINE_UNVERIFIED');
  }

  setUnauthenticated(notice: SessionNotice | null = null): void {
    this._token.set(null);
    this._user.set(null);
    this._verified.set(false);
    this._state.set('UNAUTHENTICATED');
    this._notice.set(notice);
    this.runResets();
  }

  /** Queues a Login-screen message without changing the session (e.g. after email verification). */
  setNotice(notice: SessionNotice): void {
    this._notice.set(notice);
  }

  consumeNotice(): SessionNotice | null {
    const notice = this._notice();
    this._notice.set(null);
    return notice;
  }

  /**
   * Feature stores register a reset so that no previous account's reports,
   * notifications or pollers survive logout / session expiry.
   */
  registerReset(handler: () => void): void {
    this.resetHandlers.add(handler);
  }

  private runResets(): void {
    this._generation += 1;
    this.resetHandlers.forEach((reset) => reset());
  }
}
