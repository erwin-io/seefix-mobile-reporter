import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SessionStore } from '../../core/auth/session.store';
import { BuildingDto, FacilityLocationDto } from '../../core/models/reference.model';
import { ReferenceApiService } from './reference.api.service';

/** Memory cache of configured buildings / facility locations for the report form. */
@Injectable({ providedIn: 'root' })
export class ReferenceStore {
  private readonly api = inject(ReferenceApiService);
  private readonly _buildings = signal<BuildingDto[] | null>(null);
  private readonly locationCache = new Map<string, FacilityLocationDto[]>();

  readonly buildings = this._buildings.asReadonly();

  constructor() {
    inject(SessionStore).registerReset(() => {
      this._buildings.set(null);
      this.locationCache.clear();
    });
  }

  async loadBuildings(): Promise<BuildingDto[]> {
    const cached = this._buildings();
    if (cached) return cached;
    const items = await firstValueFrom(this.api.buildings());
    this._buildings.set(items);
    return items;
  }

  async loadLocations(buildingId: string): Promise<FacilityLocationDto[]> {
    const cached = this.locationCache.get(buildingId);
    if (cached) return cached;
    const items = await firstValueFrom(this.api.locations(buildingId));
    this.locationCache.set(buildingId, items);
    return items;
  }
}
