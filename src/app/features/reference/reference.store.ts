import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { SessionStore } from '../../core/auth/session.store';
import { AppResumeService } from '../../core/lifecycle/app-resume.service';
import { BuildingDto, FacilityLocationDto } from '../../core/models/reference.model';
import { LocalDbService } from '../../core/storage/local-db.service';
import { ReferenceApiService } from './reference.api.service';

const BUILDINGS_KEY = 'reference:buildings';
const locationsKey = (buildingId: string) => `reference:locations:${buildingId}`;

/** Offline: nothing saved on the phone yet, so the form uses free-text location right away (no 20 s wait). */
export class ReferenceOfflineError extends Error {
  constructor() {
    super('Buildings are not available offline yet.');
  }
}

/**
 * Configured buildings / facility locations for the report form. Kept in memory and saved on the phone per user
 * (IndexedDB, like drafts and the outbox), so the form works offline. Refreshed in the background when someone is
 * signed in: at sign-in / app start, when the app is back online and when it returns to the foreground.
 */
@Injectable({ providedIn: 'root' })
export class ReferenceStore {
  private readonly api = inject(ReferenceApiService);
  private readonly db = inject(LocalDbService);
  private readonly session = inject(SessionStore);
  private readonly lifecycle = inject(AppResumeService);
  private readonly _buildings = signal<BuildingDto[] | null>(null);
  private readonly locationCache = new Map<string, FacilityLocationDto[]>();
  private refreshing: Promise<void> | null = null;

  readonly buildings = this._buildings.asReadonly();

  constructor() {
    this.session.registerReset(() => {
      this._buildings.set(null);
      this.locationCache.clear();
    });
    // Signed in (login or app start with a saved session): fetch in the background.
    effect(() => {
      if (this.session.user()?.id) untracked(() => void this.refresh());
    });
    // Back online / back in front: sync from the server again.
    this.lifecycle.resumed$.pipe(takeUntilDestroyed()).subscribe(() => void this.refresh());
  }

  /** Memory, else the phone's copy (then refreshed in the background), else the server. */
  async loadBuildings(): Promise<BuildingDto[]> {
    const memory = this._buildings();
    if (memory) return memory;
    const saved = await this.read<BuildingDto[]>(BUILDINGS_KEY);
    if (saved?.length) {
      this._buildings.set(saved);
      void this.refresh();
      return saved;
    }
    if (!this.lifecycle.isOnline()) throw new ReferenceOfflineError();
    return this.fetchBuildings();
  }

  async loadLocations(buildingId: string): Promise<FacilityLocationDto[]> {
    const memory = this.locationCache.get(buildingId);
    if (memory) return memory;
    const saved = await this.read<FacilityLocationDto[]>(locationsKey(buildingId));
    if (saved) {
      this.locationCache.set(buildingId, saved);
      return saved;
    }
    if (!this.lifecycle.isOnline()) throw new ReferenceOfflineError();
    return this.fetchLocations(buildingId);
  }

  /** Background sync (one at a time): buildings, then every building's locations. Never throws. */
  refresh(): Promise<void> {
    if (!this.session.user()?.id || !this.lifecycle.isOnline()) return Promise.resolve();
    this.refreshing ??= (async () => {
      try {
        const buildings = await this.fetchBuildings();
        await Promise.all(buildings.map((b) => this.fetchLocations(b.id).catch(() => undefined)));
      } catch {
        // Offline or server down: keep the saved copy; the next resume / reconnect tries again.
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  private async fetchBuildings(): Promise<BuildingDto[]> {
    const items = await firstValueFrom(this.api.buildings());
    this._buildings.set(items);
    await this.write(BUILDINGS_KEY, items);
    return items;
  }

  private async fetchLocations(buildingId: string): Promise<FacilityLocationDto[]> {
    const items = await firstValueFrom(this.api.locations(buildingId));
    this.locationCache.set(buildingId, items);
    await this.write(locationsKey(buildingId), items);
    return items;
  }

  private async read<T>(key: string): Promise<T | undefined> {
    const userId = this.session.user()?.id;
    if (!userId) return undefined;
    return this.db.get<T>(userId, key).catch(() => undefined);
  }

  private async write(key: string, value: unknown): Promise<void> {
    const userId = this.session.user()?.id;
    // Best effort: a full or blocked store only means the next offline form uses free-text location.
    if (userId) await this.db.putAll(userId, [{ key, value }]).catch(() => undefined);
  }
}
