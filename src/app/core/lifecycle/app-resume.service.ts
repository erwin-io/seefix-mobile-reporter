import { Injectable, NgZone, inject, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { Observable, Subject } from 'rxjs';

/**
 * App foreground/background and connectivity signals. Started once from
 * AppComponent; listeners are released by `stop()`.
 */
@Injectable({ providedIn: 'root' })
export class AppResumeService {
  private readonly zone = inject(NgZone);
  private readonly _foreground = signal(true);
  private readonly _online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  private readonly resumedSubject = new Subject<void>();
  private handles: PluginListenerHandle[] = [];
  private removeWebListeners: (() => void) | null = null;
  private started = false;

  readonly isForeground = this._foreground.asReadonly();
  readonly isOnline = this._online.asReadonly();
  /** Emits when the app returns to the foreground. */
  readonly resumed$: Observable<void> = this.resumedSubject.asObservable();

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    if (Capacitor.isNativePlatform()) {
      this.handles.push(
        await App.addListener('appStateChange', ({ isActive }) => this.zone.run(() => this.setForeground(isActive))),
      );
    } else {
      const onVisibility = () => this.setForeground(document.visibilityState === 'visible');
      document.addEventListener('visibilitychange', onVisibility);
      this.removeWebListeners = () => document.removeEventListener('visibilitychange', onVisibility);
    }

    try {
      const status = await Network.getStatus();
      this._online.set(status.connected);
      this.handles.push(
        await Network.addListener('networkStatusChange', ({ connected }) =>
          this.zone.run(() => {
            const wasOffline = !this._online();
            this._online.set(connected);
            if (connected && wasOffline) this.resumedSubject.next();
          }),
        ),
      );
    } catch {
      // Network plugin unavailable; keep navigator.onLine default.
    }
  }

  async stop(): Promise<void> {
    await Promise.all(this.handles.map((handle) => handle.remove()));
    this.handles = [];
    this.removeWebListeners?.();
    this.removeWebListeners = null;
    this.started = false;
  }

  private setForeground(active: boolean): void {
    const wasBackground = !this._foreground();
    this._foreground.set(active);
    if (active && wasBackground) this.resumedSubject.next();
  }
}
