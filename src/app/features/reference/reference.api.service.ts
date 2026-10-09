import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiClient } from '../../core/http/api-client.service';
import { BuildingDto, FacilityLocationDto, ItemsResponse } from '../../core/models/reference.model';

@Injectable({ providedIn: 'root' })
export class ReferenceApiService {
  private readonly api = inject(ApiClient);

  buildings(): Observable<BuildingDto[]> {
    return this.api.get<ItemsResponse<BuildingDto>>('/api/reference/buildings').pipe(map((r) => r.items));
  }

  locations(buildingId: string): Observable<FacilityLocationDto[]> {
    return this.api
      .get<ItemsResponse<FacilityLocationDto>>('/api/reference/locations', { params: { buildingId } })
      .pipe(map((r) => r.items));
  }
}
