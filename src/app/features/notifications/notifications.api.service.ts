import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiClient } from '../../core/http/api-client.service';
import {
  NotificationDto,
  NotificationListResponse,
  NotificationReadAllResponse,
  NotificationReadResponse,
} from '../../core/models/notification.model';

/** In-app inbox only; there is no OS push registration in v1. */
@Injectable({ providedIn: 'root' })
export class NotificationsApiService {
  private readonly api = inject(ApiClient);

  /** Up to 100, newest first. */
  list(unreadOnly = false): Observable<NotificationDto[]> {
    return this.api
      .get<NotificationListResponse>('/api/notifications', { params: { unread: unreadOnly ? true : undefined } })
      .pipe(map((response) => response.items));
  }

  markRead(id: string): Observable<NotificationReadResponse> {
    return this.api.post<NotificationReadResponse>(`/api/notifications/${encodeURIComponent(id)}/read`, {});
  }

  markAllRead(): Observable<NotificationReadAllResponse> {
    return this.api.post<NotificationReadAllResponse>('/api/notifications/read-all', {});
  }
}
