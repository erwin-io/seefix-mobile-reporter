import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap } from 'rxjs';
import { ApiClient } from '../../core/http/api-client.service';
import { DirectUploadService } from '../../core/http/direct-upload.service';
import {
  ActiveReportResponse,
  AgentStatusResponse,
  CancelReportResponse,
  CreateReportResponse,
  ReportDetail,
  ReportDetailResponse,
  ReportListResponse,
  ReportSummary,
} from '../../core/models/report.model';
import { toReportDetail, toReportSummary } from './report.mapper';

export const REPORT_LIST_MAX = 100;

export interface NewReportPayload {
  images: { blob: Blob; fileName: string }[];
  description: string;
  notes?: string | null;
  locationId?: string | null;
  building?: string | null;
  floor?: string | null;
  roomOrArea?: string | null;
  gpsLat?: number | null;
  gpsLng?: number | null;
}

@Injectable({ providedIn: 'root' })
export class ReportsApiService {
  private readonly api = inject(ApiClient);
  private readonly uploads = inject(DirectUploadService);

  /** Newest first. The endpoint has no pagination; `limit` is capped at 100. */
  listMine(limit: number, status?: string): Observable<ReportSummary[]> {
    return this.api
      .get<ReportListResponse>('/api/reports/my', {
        params: { limit: Math.min(Math.max(limit, 1), REPORT_LIST_MAX), status },
      })
      .pipe(map((response) => response.items.map(toReportSummary)));
  }

  getDetail(id: string): Observable<ReportDetail> {
    return this.api
      .get<ReportDetailResponse>(`/api/reports/${encodeURIComponent(id)}`)
      .pipe(map(toReportDetail));
  }

  /** One active report per Reporter: whether a new report may be submitted now (advisory; POST still 409s). */
  getActive(): Observable<ActiveReportResponse> {
    return this.api.get<ActiveReportResponse>('/api/reports/my/active');
  }

  /** Reporter cancellation (5–500 char reason). Idempotent: a repeat returns `alreadyCancelled: true`. */
  cancel(id: string, reason: string): Observable<CancelReportResponse> {
    return this.api.post<CancelReportResponse>(`/api/reports/${encodeURIComponent(id)}/cancel`, { reason: reason.trim() });
  }

  getAgentStatus(id: string): Observable<AgentStatusResponse> {
    return this.api.get<AgentStatusResponse>(`/api/reports/${encodeURIComponent(id)}/agent-status`);
  }

  /** Uploads the photos straight to Cloudinary, then creates the report with their public IDs. */
  create(payload: NewReportPayload): Observable<CreateReportResponse> {
    return this.uploads.upload('report-image', payload.images).pipe(
      switchMap((imagePublicIds) => {
        const useLocationId = !!payload.locationId; // Node replaces textual location with the canonical facility snapshot.
        const hasGps = payload.gpsLat != null && payload.gpsLng != null;
        return this.api.post<CreateReportResponse>('/api/reports', {
          imagePublicIds,
          description: trimmed(payload.description),
          notes: trimmed(payload.notes),
          locationId: useLocationId ? payload.locationId : undefined,
          building: useLocationId ? undefined : trimmed(payload.building),
          floor: useLocationId ? undefined : trimmed(payload.floor),
          roomOrArea: useLocationId ? undefined : trimmed(payload.roomOrArea),
          gpsLat: hasGps ? payload.gpsLat : undefined,
          gpsLng: hasGps ? payload.gpsLng : undefined,
        });
      }),
    );
  }
}

function trimmed(value: string | null | undefined): string | undefined {
  return value?.trim() || undefined;
}
