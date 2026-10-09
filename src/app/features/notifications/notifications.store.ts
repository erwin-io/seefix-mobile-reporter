import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, firstValueFrom } from 'rxjs';
import { SessionStore } from '../../core/auth/session.store';
import { AppError, mapHttpError } from '../../core/http/api-error.mapper';
import { AppResumeService } from '../../core/lifecycle/app-resume.service';
import { NotificationDto } from '../../core/models/notification.model';
import { NotificationsApiService } from './notifications.api.service';

@Injectable({ providedIn: 'root' })
export class NotificationsStore {
  private readonly api = inject(NotificationsApiService);
  private readonly session = inject(SessionStore);
  private readonly _items = signal<NotificationDto[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<AppError | null>(null);
  private readonly _lastFetchedAt = signal<number | null>(null);
  private inFlight: Subscription | null = null;

  readonly items = this._items.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly loaded = computed(() => this._lastFetchedAt() !== null);
  readonly unreadCount = computed(() => this._items().filter((item) => !item.isRead).length);

  constructor() {
    this.session.registerReset(() => this.reset());
    inject(AppResumeService)
      .resumed$.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => {
        if (this.session.isAuthenticated()) void this.refresh();
      });
  }

  refresh(): Promise<void> {
    if (!this.session.isAuthenticated()) return Promise.resolve();
    this.inFlight?.unsubscribe();
    this._loading.set(true);
    this._error.set(null);
    return new Promise<void>((resolve) => {
      this.inFlight = this.api.list().subscribe({
        next: (items) => {
          this._items.set(items);
          this._lastFetchedAt.set(Date.now());
        },
        error: (error: unknown) => {
          this._error.set(mapHttpError(error));
          this._loading.set(false);
          resolve();
        },
        complete: () => {
          this._loading.set(false);
          resolve();
        },
      });
    });
  }

  /** Updates local state only after the server confirms. */
  async markRead(id: string): Promise<void> {
    const target = this._items().find((item) => item.id === id);
    if (!target || target.isRead) return;
    const result = await firstValueFrom(this.api.markRead(id));
    this._items.update((items) =>
      items.map((item) => (item.id === id ? { ...item, isRead: result.isRead, readAt: result.readAt } : item)),
    );
  }

  async markAllRead(): Promise<void> {
    await firstValueFrom(this.api.markAllRead());
    const now = new Date().toISOString();
    this._items.update((items) => items.map((item) => (item.isRead ? item : { ...item, isRead: true, readAt: now })));
  }

  reset(): void {
    this.inFlight?.unsubscribe();
    this.inFlight = null;
    this._items.set([]);
    this._loading.set(false);
    this._error.set(null);
    this._lastFetchedAt.set(null);
  }
}
