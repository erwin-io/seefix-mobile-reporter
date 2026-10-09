import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiClient } from '../../core/http/api-client.service';
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

  create(payload: NewReportPayload): Observable<CreateReportResponse> {
    const form = new FormData();
    for (const image of payload.images) form.append('images', image.blob, image.fileName);
    appendIfPresent(form, 'description', payload.description);
    appendIfPresent(form, 'notes', payload.notes);
    if (payload.locationId) {
      // Node replaces textual location with the canonical facility snapshot.
      form.append('locationId', payload.locationId);
    } else {
      appendIfPresent(form, 'building', payload.building);
      appendIfPresent(form, 'floor', payload.floor);
      appendIfPresent(form, 'roomOrArea', payload.roomOrArea);
    }
    if (payload.gpsLat != null && payload.gpsLng != null) {
      form.append('gpsLat', String(payload.gpsLat));
      form.append('gpsLng', String(payload.gpsLng));
    }
    return this.api.postForm<CreateReportResponse>('/api/reports', form);
  }
}

function appendIfPresent(form: FormData, key: string, value: string | null | undefined): void {
  const text = value?.trim();
  if (text) form.append(key, text);
}
