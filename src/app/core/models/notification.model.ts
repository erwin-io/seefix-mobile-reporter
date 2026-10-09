export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  payload: unknown;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationDto[];
}

export interface NotificationReadResponse {
  id: string;
  isRead: boolean;
  readAt: string | null;
}

export interface NotificationReadAllResponse {
  updated: number;
}
