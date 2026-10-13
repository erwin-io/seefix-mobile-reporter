import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { SessionStore } from '../../../core/auth/session.store';
import { ConnectivityService } from '../../../core/connectivity/connectivity.service';
import { AppResumeService } from '../../../core/lifecycle/app-resume.service';
import { LocalDbService, StorageFullError } from '../../../core/storage/local-db.service';
import { waitingItem } from '../../../testing/fixtures/outbox.fixture';
import { REPORTER_USER, apiUrl } from '../../../testing/test-helpers';
import { ReportsStore } from '../reports.store';
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
  await store.add(REPORTER_USER.id, item, photos.map((b) => ({ bytes: b, mimeType: 'image/jpeg' })));
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
    const photo = await reopened.photo(REPORTER_USER.id, item.id, 1);
    expect(await sha256Hex(await photo.arrayBuffer())).toBe(item.photos[1].digest);
    expect(new TextDecoder().decode(await photo.arrayBuffer())).toBe('photo-two');
  });

  it('a report that was being sent when the app closed is waiting again after reopening', async () => {
    const { store } = launch();
    const item = await saveTwoPhotoReport(store);
    await store.update(REPORTER_USER.id, { ...item, state: 'sending' });

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
      await expect(store.add(REPORTER_USER.id, waitingItem(), [{ bytes: bytes('x'), mimeType: 'image/jpeg' }])).rejects.toBeInstanceOf(StorageFullError);
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

describe('Review 3 corrections (P2)', () => {
  afterEach(() => {
    const http = TestBed.inject(HttpTestingController);
    answerOtherRequests(http);
    http.verify();
  });

  /** Reporter B signs in on the same phone. */
  const switchToB = () => TestBed.inject(SessionStore).setAuthenticated(OTHER_REPORTER, 'b-token');
  const db = () => TestBed.inject(LocalDbService);

  async function expectARecoverableAndBUntouched(itemId: string): Promise<void> {
    expect(await db().keys(REPORTER_USER.id, 'outbox/item/')).toEqual([`outbox/item/${itemId}`]);
    expect(await db().keys(OTHER_REPORTER.id)).toEqual([]);
  }

  describe('P0: switching account while a report is being sent', () => {
    it('during an upload: stops; nothing is written for B, no request is made for A under B', async () => {
      const { store, http } = launch();
      const item = await saveTwoPhotoReport(store);
      const run = TestBed.inject(ReportSyncService).syncNow(true);
      const sign = await nextRequest(http, SIGN_URL);
      expect(sign.request.headers.get('Authorization')).toBe('Bearer token');
      sign.flush({ uploadUrl: UPLOAD_URL, fields: {} });
      const upload = await nextRequest(http, UPLOAD_URL);

      switchToB();
      upload.flush({ public_id: 'seefix/reports/p0' });
      await run;
      await settle();

      http.expectNone(UPLOAD_URL);
      http.expectNone(REPORTS_URL);
      await expectARecoverableAndBUntouched(item.id);
    });

    it('before the report POST: the POST is never made', async () => {
      const { store, http } = launch();
      const item = await saveTwoPhotoReport(store);
      const run = TestBed.inject(ReportSyncService).syncNow(true);
      (await nextRequest(http, SIGN_URL)).flush({ uploadUrl: UPLOAD_URL, fields: {} });
      (await nextRequest(http, UPLOAD_URL)).flush({ public_id: 'seefix/reports/p0' });
      const last = await nextRequest(http, UPLOAD_URL);

      last.flush({ public_id: 'seefix/reports/p1' });
      switchToB(); // the upload answered; the POST would come next
      await run;
      await settle();

      http.expectNone(REPORTS_URL);
      await expectARecoverableAndBUntouched(item.id);
    });

    it('during the POST: it carries A\u2019s token; the late answer writes nothing for B', async () => {
      const { store, http } = launch();
      const item = await saveTwoPhotoReport(store);
      const run = TestBed.inject(ReportSyncService).syncNow(true);
      (await nextRequest(http, SIGN_URL)).flush({ uploadUrl: UPLOAD_URL, fields: {} });
      (await nextRequest(http, UPLOAD_URL)).flush({ public_id: 'seefix/reports/p0' });
      (await nextRequest(http, UPLOAD_URL)).flush({ public_id: 'seefix/reports/p1' });
      const post = await nextRequest(http, REPORTS_URL);
      expect(post.request.headers.get('Authorization')).toBe('Bearer token');

      switchToB();
      post.flush(CREATED, { status: 201, statusText: 'Created' });
      await run;
      await settle();

      // A's report stays on the phone; when A signs in again the same clientReportId is an idempotent 200 replay.
      await expectARecoverableAndBUntouched(item.id);
      expect(store.items()).toEqual([]); // B's view
      http.expectNone(apiUrl('/api/reports/my'));
    });
  });

  it('Review 4: a Submit racing the cold-start load cannot add a second waiting report; the first stays', async () => {
    const { store } = launch();
    const existing = await saveTwoPhotoReport(store);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const local = TestBed.inject(LocalDbService);
    const realKeys = local.keys.bind(local);
    // A slow read at start-up: it answers only after the new report was saved.
    local.keys = (userId: string, prefix?: string) =>
      realKeys(userId, prefix).then((keys) => new Promise<string[]>((resolve) => setTimeout(() => resolve(keys), 30)));
    TestBed.inject(SessionStore).setAuthenticated(REPORTER_USER, 'token');
    const reopened = TestBed.inject(ReportOutboxStore);
    const added = waitingItem({ id: '0f0e0d0c-0b0a-4908-8706-050403020100' });
    await expect(reopened.add(REPORTER_USER.id, added, [{ bytes: bytes('x'), mimeType: 'image/jpeg' }])).rejects.toMatchObject({
      name: 'ReportAlreadyWaitingError',
      reason: 'waiting',
    });
    await reopened.ready();

    expect(reopened.items().map((item) => item.id)).toEqual([existing.id]);
    expect(await realKeys(REPORTER_USER.id, 'outbox/item/')).toEqual([`outbox/item/${existing.id}`]);
  });

  it('Review 4: a save is refused while the saved reports cannot be read', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    TestBed.inject(SessionStore).setAuthenticated(REPORTER_USER, 'token');
    const store = TestBed.inject(ReportOutboxStore);
    await store.ready();
    TestBed.inject(LocalDbService).keys = () => Promise.reject(new Error('IndexedDB unreadable'));

    await expect(store.add(REPORTER_USER.id, waitingItem(), [{ bytes: bytes('x'), mimeType: 'image/jpeg' }])).rejects.toMatchObject({
      reason: 'unreadable',
    });
    expect(store.items()).toEqual([]);
  });

  it('P1: saved reports that cannot be read block starting a new report instead of looking empty', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const local = TestBed.inject(LocalDbService);
    local.keys = () => Promise.reject(new Error('IndexedDB unreadable'));
    TestBed.inject(SessionStore).setAuthenticated(REPORTER_USER, 'token');
    const store = TestBed.inject(ReportOutboxStore);
    await store.ready();

    expect(store.unavailable()).toBe(true);
    const reports = TestBed.inject(ReportsStore);
    const check = reports.refreshEligibility();
    TestBed.inject(HttpTestingController).expectOne(apiUrl('/api/reports/my/active')).flush({ canSubmit: true, activeReport: null });
    await check;
    expect(reports.canStartReport()).toBe(false);
  });

  it('P1: SEEFIX becoming reachable again (server-down cleared) sends at once, not at the next backoff', async () => {
    const { store, http } = launch();
    const item = await saveTwoPhotoReport(store);
    await store.update(REPORTER_USER.id, { ...item, reason: 'server', attempts: 3, nextAttemptAt: Date.now() + 3_600_000 });
    TestBed.inject(ReportSyncService);
    const connectivity = TestBed.inject(ConnectivityService);
    connectivity.apiFailed(503, 100);
    (await nextRequest(http, apiUrl('/health'))).flush({ components: { database: { reachable: false } } }, { status: 503, statusText: 'x' });
    await settle();
    TestBed.tick();
    expect(connectivity.state()).toBe('server-down');

    connectivity.apiSucceeded(200); // e.g. any API call works again
    TestBed.tick();
    const sign = await nextRequest(http, SIGN_URL);
    sign.flush({ uploadUrl: UPLOAD_URL, fields: {} });
    (await nextRequest(http, UPLOAD_URL)).flush({ public_id: 'seefix/reports/p0' });
    (await nextRequest(http, UPLOAD_URL)).flush({ public_id: 'seefix/reports/p1' });
    (await nextRequest(http, REPORTS_URL)).flush(CREATED);
    await settle();
    expect(store.items()).toEqual([]);
  });

  it('429: waits at least as long as the server\u2019s Retry-After', async () => {
    const { store, http } = launch();
    await saveTwoPhotoReport(store);
    const run = TestBed.inject(ReportSyncService).syncNow(true);
    (await nextRequest(http, SIGN_URL)).flush({ uploadUrl: UPLOAD_URL, fields: {} });
    (await nextRequest(http, UPLOAD_URL)).flush({ public_id: 'seefix/reports/p0' });
    (await nextRequest(http, UPLOAD_URL)).flush({ public_id: 'seefix/reports/p1' });
    (await nextRequest(http, REPORTS_URL)).flush({ error: { code: 'RATE_LIMITED' } }, {
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'Retry-After': '600' },
    });
    await run;
    expect(store.items()[0]).toMatchObject({ state: 'waiting', reason: 'busy' });
    expect(store.items()[0].nextAttemptAt).toBeGreaterThanOrEqual(Date.now() + 590_000);
  });
});

describe('Pausing sends (P3 sign-out)', () => {
  afterEach(() => {
    const http = TestBed.inject(HttpTestingController);
    answerOtherRequests(http);
    http.verify();
  });

  it('while paused nothing is sent; a send already running writes nothing more; release resumes', async () => {
    const { store, http } = launch();
    const item = await saveTwoPhotoReport(store);
    const sync = TestBed.inject(ReportSyncService);
    const run = sync.syncNow(true);
    (await nextRequest(http, SIGN_URL)).flush({ uploadUrl: UPLOAD_URL, fields: {} });
    const upload = await nextRequest(http, UPLOAD_URL);

    const release = await sync.pause(); // e.g. sign-out is about to delete the saved reports
    upload.flush({ public_id: 'seefix/reports/p0' });
    await run;
    await settle();
    http.expectNone(UPLOAD_URL);
    expect((await TestBed.inject(LocalDbService).get<{ photos: { publicId: string | null }[] }>(REPORTER_USER.id, `outbox/item/${item.id}`))?.photos[0].publicId).toBeNull();

    await sync.syncNow(true);
    http.expectNone(SIGN_URL);

    release();
    (await nextRequest(http, SIGN_URL)).flush({ uploadUrl: UPLOAD_URL, fields: {} });
    (await nextRequest(http, UPLOAD_URL)).flush({ public_id: 'seefix/reports/p0' });
    (await nextRequest(http, UPLOAD_URL)).flush({ public_id: 'seefix/reports/p1' });
    (await nextRequest(http, REPORTS_URL)).flush(CREATED);
    await settle();
    expect(store.items()).toEqual([]);
  });
});

describe('Account switch: a run right after it never uses the previous account\u2019s items', () => {
  afterEach(() => {
    const http = TestBed.inject(HttpTestingController);
    answerOtherRequests(http);
    http.verify();
  });

  it('a send started for B before the store caught up does not send A\u2019s report', async () => {
    const { store, http, lifecycle } = launch();
    lifecycle._online.set(false); // A's report waits on the phone
    const item = await saveTwoPhotoReport(store);
    const sync = TestBed.inject(ReportSyncService);
    await sync.syncNow(true);
    lifecycle._online.set(true);

    TestBed.inject(SessionStore).setAuthenticated(OTHER_REPORTER, 'b-token');
    await sync.syncNow(true); // before any change detection: the store still holds A's items
    await settle();

    http.expectNone(SIGN_URL);
    http.expectNone(REPORTS_URL);
    expect(await TestBed.inject(LocalDbService).keys(OTHER_REPORTER.id)).toEqual([]);
    expect(await TestBed.inject(LocalDbService).keys(REPORTER_USER.id, 'outbox/item/')).toEqual([`outbox/item/${item.id}`]);
  });
});
