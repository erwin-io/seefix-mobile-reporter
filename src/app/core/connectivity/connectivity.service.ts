import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, timeout } from 'rxjs';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { AppResumeService } from '../lifecycle/app-resume.service';

export type ConnectivityState = 'online' | 'offline' | 'slow' | 'server-down';

/** A completed seefix-api request slower than this marks the connection as slow. */
export const SLOW_REQUEST_MS = 8000;
const PROBE_TIMEOUT_MS = 15000;
/** Wait before each /health re-check while SEEFIX is unreachable. */
export const PROBE_BACKOFF_MS = [15_000, 30_000, 60_000, 120_000, 300_000];

interface NetworkInformationLike extends EventTarget {
  effectiveType?: string;
}

/**
 * What the Reporter is told about the connection: offline, slow, or SEEFIX unreachable.
 * Fed by every seefix-api response (connectivityInterceptor); /health is only called after a failure, so a
 * working connection costs no extra requests.
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private readonly http = inject(HttpClient);
  private readonly env = inject(APP_ENVIRONMENT);
  private readonly lifecycle = inject(AppResumeService);
  private readonly online = this.lifecycle.isOnline;
  private readonly connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;

  private readonly _serverDown = signal(false);
  private readonly _slowRequests = signal(false);
  private readonly _slowNetwork = signal(isSlowType(this.connection?.effectiveType));
  private probeTimer: ReturnType<typeof setTimeout> | null = null;
  private probing = false;
  private probeAttempt = 0;

  readonly state = computed<ConnectivityState>(() => {
    if (!this.online()) return 'offline';
    if (this._serverDown()) return 'server-down';
    if (this._slowNetwork() || this._slowRequests()) return 'slow';
    return 'online';
  });

  constructor() {
    const onChange = () => this._slowNetwork.set(isSlowType(this.connection?.effectiveType));
    this.connection?.addEventListener('change', onChange);
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      this.connection?.removeEventListener('change', onChange);
      this.stopProbing();
    });
    // Back online or back in front: whatever failed before may work now, so check again right away.
    this.lifecycle.resumed$.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
      if (this._serverDown()) void this.probe();
    });
  }

  /** A seefix-api request got a response the server produced. */
  apiSucceeded(durationMs: number): void {
    this._slowRequests.set(durationMs > SLOW_REQUEST_MS);
    this.markServerUp();
  }

  /** A seefix-api request failed. Only no-response and 5xx can mean SEEFIX is unreachable. */
  apiFailed(status: number, durationMs: number): void {
    if (status > 0 && status < 500) {
      this.apiSucceeded(durationMs); // 4xx: the server answered
      return;
    }
    if (this.online() && !this.probing && this.probeTimer === null) void this.probe();
  }

  /** Confirms with /health. A 503 that still reports the database reachable means SEEFIX accepts reports. */
  async probe(): Promise<void> {
    if (this.probing || !this.online()) return;
    this.probing = true;
    this.clearTimer();
    let reachable = false;
    try {
      const body = await firstValueFrom(
        this.http.get<HealthBody>(`${this.env.apiBaseUrl}/health`).pipe(timeout(PROBE_TIMEOUT_MS)),
      );
      reachable = body?.components?.database?.reachable === true;
    } catch (error) {
      // /health answers 503 whenever the AI Agent is down; reports are still accepted then.
      const body = (error as { error?: HealthBody } | null)?.error;
      reachable = body?.components?.database?.reachable === true;
    } finally {
      this.probing = false;
    }
    if (reachable) {
      this.markServerUp();
      return;
    }
    this._serverDown.set(true);
    const wait = PROBE_BACKOFF_MS[Math.min(this.probeAttempt, PROBE_BACKOFF_MS.length - 1)];
    this.probeAttempt += 1;
    this.probeTimer = setTimeout(() => {
      this.probeTimer = null;
      void this.probe();
    }, wait);
  }

  private markServerUp(): void {
    this._serverDown.set(false);
    this.stopProbing();
  }

  private stopProbing(): void {
    this.clearTimer();
    this.probeAttempt = 0;
  }

  private clearTimer(): void {
    if (this.probeTimer !== null) clearTimeout(this.probeTimer);
    this.probeTimer = null;
  }
}

interface HealthBody {
  components?: { database?: { reachable?: boolean } };
}

function isSlowType(type: string | undefined): boolean {
  return type === 'slow-2g' || type === '2g';
}
