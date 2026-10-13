import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { SessionStore } from '../../../core/auth/session.store';
import { AppResumeService } from '../../../core/lifecycle/app-resume.service';
import { LocalDbService, StorageFullError } from '../../../core/storage/local-db.service';
import { waitingItem } from '../../../testing/fixtures/outbox.fixture';
import { REPORTER_USER, apiUrl } from '../../../testing/test-helpers';
import { ReportOutboxStore, sha256Hex } from './report-outbox.store';
import { RETRY_BACKOFF_MS, ReportSyncService } from './report-sync.service';

const OTHER_REPORTER = { ...REPORTER_USER, id: '33333333-3333-4333-8333-333333333333' };
const SIGN_URL = apiUrl('/api/uploads/sign');
const UPLOAD_URL = 'https://api.cloudinary.com/v1_1/demo/image/upload';
const REPORTS_URL = apiUrl('/api/reports');
const CREATED = { id: 'r-24', reportNo: 'RPT-2026-000024', status: 'SUBMITTED', agentStatus: 'PENDING', createdAt: '2026-10-14T02:00:00Z', imageCount: 2 };

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

/** A fresh app start (new services) on the same phone storage, signed in as `user`. */
function launch(user = REPORTER_USER) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  TestBed.inject(SessionStore).setAuthenticated(user, 'token');
  return {
    store: TestBed.inject(ReportOutboxStore),
    http: TestBed.inject(HttpTestingController),
    lifecycle: TestBed.inject(AppResumeService) as unknown as { _online: { set(v: boolean): void }; resumedSubject: Subject<void> },
  };
}

/** Waits (IndexedDB is asynchronous) until the app has sent a request to `url`. */
async function nextRequest(http: HttpTestingController, url: string): Promise<TestRequest> {
  for (let i = 0; i < 200; i++) {
    const found = http.match(url);
    if (found.length) return found[0];
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`No request to ${url}`);
}

/** The list / eligibility / notification refreshes a send or a reconnect also triggers. */
function answerOtherRequests(http: HttpTestingController): void {
  http
    .match((req) => req.url !== SIGN_URL && req.url !== UPLOAD_URL && req.url !== REPORTS_URL)
    .filter((req) => !req.cancelled)
    .forEach((req) => req.flush({ items: [], canSubmit: true, activeReport: null }));
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 2));
}

/** A two-photo report saved on the phone, with real bytes and digests. */
async function saveTwoPhotoReport(store: ReportOutboxStore) {
  const photos = [bytes('photo-one'), bytes('photo-two')];
  const item = waitingItem({
    photos: await Promise.all(
      photos.map(async (b, i) => ({ fileName: `p${i}.jpg`, mimeType: 'image/jpeg', size: b.byteLength, digest: await sha256Hex(b), publicId: null })),
    ),
  });
  await store.ready();
  await store.add(item, photos.map((b) => ({ bytes: b, mimeType: 'image/jpeg' })));
  return item;
}

describe('Report outbox (offline plan v3, P2)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('saves the details and original photos on the phone, and they survive closing the app', async () => {
    const { store } = launch();
    const item = await saveTwoPhotoReport(store);

    const reopened = launch().store; // force-close and reopen
    await reopened.ready();
    expect(reopened.items()).toEqual([item]);
    const photo = await reopened.photo(item.id, 1);
    expect(await sha256Hex(await photo.arrayBuffer())).toBe(item.photos[1].digest);
    expect(new TextDecoder().decode(await photo.arrayBuffer())).toBe('photo-two');
  });

  it('a report that was being sent when the app closed is waiting again after reopening', async () => {
    const { store } = launch();
    const item = await saveTwoPhotoReport(store);
    await store.update({ ...item, state: 'sending' });

    const reopened = launch().store;
    await reopened.ready();
    expect(reopened.items()[0].state).toBe('waiting');
  });

  it('when the phone is full, nothing is saved', async () => {
    const { store } = launch();
    await store.ready();
    Object.defineProperty(navigator, 'storage', {
      value: { estimate: () => Promise.resolve({ quota: 10 * 1024 * 1024, usage: 9 * 1024 * 1024 }) },
      configurable: true,
    });
    try {
      await expect(store.add(waitingItem(), [{ bytes: bytes('x'), mimeType: 'image/jpeg' }])).rejects.toBeInstanceOf(StorageFullError);
    } finally {
      delete (navigator as { storage?: unknown }).storage;
    }
    expect(store.items()).toEqual([]);
    expect(await TestBed.inject(LocalDbService).keys(REPORTER_USER.id)).toEqual([]);
  });

  it('another Reporter on the same phone never sees or sends it', async () => {
    const { store } = launch();
    await saveTwoPhotoReport(store);

    const other = launch(OTHER_REPORTER);
    await other.store.ready();
    expect(other.store.items()).toEqual([]);
    await TestBed.inject(ReportSyncService).syncNow(true);
    other.http.expectNone(SIGN_URL);
    other.http.expectNone(REPORTS_URL);
  });

  describe('sending', () => {
    async function sendAll(http: HttpTestingController, photoCount = 2) {
      (await nextRequest(http, SIGN_URL)).flush({ uploadUrl: UPLOAD_URL, fields: { signature: 's' } });
      for (let i = 0; i < photoCount; i++) {
        (await nextRequest(http, UPLOAD_URL)).flush({ public_id: `seefix/reports/p${i}` });
      }
    }

    it('back online, it is sent with its clientReportId and photo digests, then removed from the phone', async () => {
      const { store, http, lifecycle } = launch();
      lifecycle._online.set(false);
      const item = await saveTwoPhotoReport(store);
      const sync = TestBed.inject(ReportSyncService);
      await sync.syncNow(true);
      expect(store.items()[0].reason).toBe('offline');
      http.expectNone(SIGN_URL);

      const received: string[] = [];
      sync.sent$.subscribe((event) => received.push(event.report.reportNo));
      lifecycle._online.set(true);
      lifecycle.resumedSubject.next(); // back online
      await sendAll(http);
      const post = await nextRequest(http, REPORTS_URL);
      expect(post.request.body).toMatchObject({
        clientReportId: item.id,
        imagePublicIds: ['seefix/reports/p0', 'seefix/reports/p1'],
        imageDigests: item.photos.map((photo) => photo.digest),
        description: 'Water leak near the stairs',
      });
      post.flush(CREATED, { status: 201, statusText: 'Created' });
      await settle();

      expect(received).toEqual(['RPT-2026-000024']);
      expect(store.items()).toEqual([]);
      expect(await TestBed.inject(LocalDbService).keys(REPORTER_USER.id)).toEqual([]);
      answerOtherRequests(http);
    });

    it('an interrupted upload resumes: photos already uploaded are not uploaded again', async () => {
      const { store, http } = launch();
      const item = await saveTwoPhotoReport(store);
      const sync = TestBed.inject(ReportSyncService);

      const first = sync.syncNow(true);
      (await nextRequest(http, SIGN_URL)).flush({ uploadUrl: UPLOAD_URL, fields: {} });
      (await nextRequest(http, UPLOAD_URL)).flush({ public_id: 'seefix/reports/p0' });
      (await nextRequest(http, UPLOAD_URL)).error(new ProgressEvent('error'), { status: 0 }); // connection drops
      await first;
      expect(store.items()[0]).toMatchObject({ state: 'waiting', reason: 'upload', attempts: 1 });
      expect(store.items()[0].photos.map((photo) => photo.publicId)).toEqual(['seefix/reports/p0', null]);

      const second = sync.syncNow(true);
      (await nextRequest(http, SIGN_URL)).flush({ uploadUrl: UPLOAD_URL, fields: {} });
      const upload = await nextRequest(http, UPLOAD_URL);
      expect((upload.request.body as FormData).get('file')).toBeTruthy();
      upload.flush({ public_id: 'seefix/reports/p1' });
      const post = await nextRequest(http, REPORTS_URL);
      expect(post.request.body.imagePublicIds).toEqual(['seefix/reports/p0', 'seefix/reports/p1']);
      expect(post.request.body.clientReportId).toBe(item.id);
      post.flush(CREATED);
      await second;
      answerOtherRequests(http);
      expect(store.items()).toEqual([]);
    });

    it('a lost response is retried with the same clientReportId, without uploading again', async () => {
      const { store, http } = launch();
      const item = await saveTwoPhotoReport(store);
      const sync = TestBed.inject(ReportSyncService);

      const first = sync.syncNow(true);
      await sendAll(http);
      (await nextRequest(http, REPORTS_URL)).error(new ProgressEvent('error'), { status: 0 }); // reached the server?
      await first;
      expect(store.items()[0]).toMatchObject({ state: 'waiting', attempts: 1 });
      expect(store.items()[0].nextAttemptAt).toBeGreaterThan(Date.now() + RETRY_BACKOFF_MS[0] - 1000);

      const retry = sync.syncNow(true);
      const post = await nextRequest(http, REPORTS_URL);
      http.expectNone(SIGN_URL);
      expect(post.request.body.clientReportId).toBe(item.id);
      post.flush({ ...CREATED, replayed: true }, { status: 200, statusText: 'OK' }); // the server already had it
      await retry;
      answerOtherRequests(http);
      expect(store.items()).toEqual([]);
    });

    async function failPostWith(status: number, body: object) {
      const { store, http } = launch();
      await saveTwoPhotoReport(store);
      const run = TestBed.inject(ReportSyncService).syncNow(true);
      await sendAll(http);
      (await nextRequest(http, REPORTS_URL)).flush(body, { status, statusText: 'x' });
      await run;
      return store.items()[0];
    }

    it('409 ACTIVE_REPORT_EXISTS: kept on the phone as blocked, with the server report', async () => {
      const item = await failPostWith(409, {
        error: { code: 'ACTIVE_REPORT_EXISTS', details: { activeReport: { id: 'r-5', reportNo: 'RPT-2026-000005', status: 'IN_PROGRESS' } } },
      });
      expect(item).toMatchObject({ state: 'blocked', activeReport: { reportNo: 'RPT-2026-000005' } });
    });

    it('a validation error stops and keeps the report for the Reporter to act on', async () => {
      const item = await failPostWith(400, { error: { code: 'INVALID_LOCATION', message: 'x' } });
      expect(item).toMatchObject({ state: 'attention', message: 'The selected location is no longer available. Please choose another.' });
    });

    it('409 CLIENT_REPORT_ID_CONFLICT stops (never treated as sent)', async () => {
      const item = await failPostWith(409, { error: { code: 'CLIENT_REPORT_ID_CONFLICT' } });
      expect(item.state).toBe('attention');
    });

    it('429 waits and retries later', async () => {
      const item = await failPostWith(429, { error: { code: 'RATE_LIMITED' } });
      expect(item).toMatchObject({ state: 'waiting', reason: 'busy', attempts: 1 });
    });

    it('a server error retries with backoff', async () => {
      const item = await failPostWith(503, {});
      expect(item).toMatchObject({ state: 'waiting', reason: 'server', attempts: 1 });
    });

    it('an expired session keeps it waiting for the same Reporter', async () => {
      const item = await failPostWith(401, { error: { code: 'INVALID_TOKEN' } });
      expect(item).toMatchObject({ state: 'waiting', reason: 'session' });
    });

    it('uploads the server can no longer use are uploaded again from the phone', async () => {
      const item = await failPostWith(400, { error: { code: 'UPLOAD_NOT_FOUND' } });
      expect(item).toMatchObject({ state: 'waiting', reason: 'upload', reuploads: 1 });
      expect(item.photos.every((photo) => photo.publicId === null)).toBe(true);
      TestBed.inject(HttpTestingController).match(() => true).forEach((req) => req.flush({}));
    });
  });
});
