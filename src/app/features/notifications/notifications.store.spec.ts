import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SessionStore } from '../../core/auth/session.store';
import { NotificationDto } from '../../core/models/notification.model';
import { REPORTER_USER, flushAsync } from '../../testing/test-helpers';
import { NotificationsStore } from './notifications.store';

const item = (id: string, isRead: boolean): NotificationDto => ({
  id,
  type: 'REPORT_SUBMITTED',
  title: 'Report submitted',
  message: 'Report RPT-2026-000005 was submitted and queued for assessment.',
  entityType: 'REPORT',
  entityId: '00000000-0000-4000-8000-000000000005',
  payload: null,
  isRead,
  readAt: isRead ? '2026-10-09T00:00:00.000Z' : null,
  createdAt: '2026-10-09T00:00:00.000Z',
});

describe('NotificationsStore', () => {
  let store: NotificationsStore;
  let session: SessionStore;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    session = TestBed.inject(SessionStore);
    session.setAuthenticated(REPORTER_USER, 't');
    store = TestBed.inject(NotificationsStore);
    httpMock = TestBed.inject(HttpTestingController);

    const loaded = store.refresh();
    httpMock.expectOne('/api/notifications').flush({ items: [item('a', false), item('b', true), item('c', false)] });
    await loaded;
  });

  afterEach(() => httpMock.verify());

  it('counts unread items (NOTIF-01)', () => {
    expect(store.unreadCount()).toBe(2);
  });

  it('marks one read after server confirmation (NOTIF-02)', async () => {
    const done = store.markRead('a');
    await flushAsync();
    httpMock.expectOne('/api/notifications/a/read').flush({ id: 'a', isRead: true, readAt: '2026-10-09T01:00:00Z' });
    await done;
    expect(store.unreadCount()).toBe(1);
  });

  it('keeps unread state when read-all fails, then clears it on success (NOTIF-03)', async () => {
    const failed = store.markAllRead();
    await flushAsync();
    httpMock.expectOne('/api/notifications/read-all').flush({}, { status: 500, statusText: 'Server Error' });
    await expect(failed).rejects.toBeTruthy();
    expect(store.unreadCount()).toBe(2);

    const ok = store.markAllRead();
    await flushAsync();
    httpMock.expectOne('/api/notifications/read-all').flush({ updated: 2 });
    await ok;
    expect(store.unreadCount()).toBe(0);
  });

  it('drops the previous account inbox on sign-out (SEC-03)', () => {
    session.setUnauthenticated();
    expect(store.items()).toEqual([]);
    expect(store.unreadCount()).toBe(0);
  });
});
