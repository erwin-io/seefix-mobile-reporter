import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { SessionStore } from '../../core/auth/session.store';
import { AppResumeService } from '../../core/lifecycle/app-resume.service';
import { REPORT_4_SUMMARY } from '../../testing/fixtures/reports.fixture';
import { REPORTER_USER, apiUrl, flushAsync } from '../../testing/test-helpers';
import { ReportsStore } from './reports.store';

const ACTIVE = { id: 'r-5', reportNo: 'RPT-2026-000005', status: 'PENDING_REVIEW', agentStatus: 'FAILED', createdAt: '2026-10-09T00:00:00Z' };

describe('ReportsStore submit eligibility (one active report per Reporter)', () => {
  let store: ReportsStore;
  let session: SessionStore;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    session = TestBed.inject(SessionStore);
    session.setAuthenticated(REPORTER_USER, 't');
    store = TestBed.inject(ReportsStore);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('starts unknown and fails closed (cannot submit)', () => {
    expect(store.eligibility()).toBe('unknown');
    expect(store.canSubmit()).toBe(false);
  });

  it('allows submission when the server says canSubmit=true', async () => {
    const check = store.refreshEligibility();
    expect(store.eligibility()).toBe('loading');
    httpMock.expectOne(apiUrl('/api/reports/my/active')).flush({ canSubmit: true, activeReport: null });
    expect(await check).toBe(true);
    expect(store.canSubmit()).toBe(true);
    expect(store.activeReport()).toBeNull();
  });

  it('blocks with the active report (an Agent FAILED report still blocks)', async () => {
    const check = store.refreshEligibility();
    httpMock.expectOne(apiUrl('/api/reports/my/active')).flush({ canSubmit: false, activeReport: ACTIVE });
    expect(await check).toBe(false);
    expect(store.eligibility()).toBe('blocked');
    expect(store.activeReport()?.reportNo).toBe('RPT-2026-000005');
  });

  it('a failed check becomes error (still blocked), never optimistic', async () => {
    const first = store.refreshEligibility();
    httpMock.expectOne(apiUrl('/api/reports/my/active')).flush({ canSubmit: true, activeReport: null });
    await first;
    const second = store.refreshEligibility();
    expect(store.eligibility()).toBe('allowed'); // last known state stays visible while re-checking
    httpMock.expectOne(apiUrl('/api/reports/my/active')).error(new ProgressEvent('error'), { status: 0 });
    expect(await second).toBeNull();
    expect(store.eligibility()).toBe('error');
    expect(store.canSubmit()).toBe(false);
  });

  it('shares one in-flight check between callers', async () => {
    const a = store.refreshEligibility();
    const b = store.refreshEligibility();
    httpMock.expectOne(apiUrl('/api/reports/my/active')).flush({ canSubmit: true, activeReport: null });
    expect(await a).toBe(true);
    expect(await b).toBe(true);
  });

  it('markBlocked after a 201/409, and logout clears eligibility (SEC-03)', () => {
    store.markBlocked(ACTIVE);
    expect(store.eligibility()).toBe('blocked');
    session.setUnauthenticated('SIGNED_OUT');
    expect(store.eligibility()).toBe('unknown');
    expect(store.activeReport()).toBeNull();
  });
});

describe('ReportsStore keeps Home and My Reports current', () => {
  let store: ReportsStore;
  let httpMock: HttpTestingController;
  const LIST_URL = (req: { url: string }) => req.url === apiUrl('/api/reports/my');

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    TestBed.inject(SessionStore).setAuthenticated(REPORTER_USER, 't');
    store = TestBed.inject(ReportsStore);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  async function loadList(items: unknown[] = []): Promise<void> {
    const loading = store.refresh();
    httpMock.expectOne(LIST_URL).flush({ items });
    await loading;
  }

  it('after a submission or status change, a list already shown is re-fetched right away', async () => {
    await loadList();
    expect(store.items()).toHaveLength(0);

    store.invalidate();
    httpMock.expectOne(LIST_URL).flush({ items: [REPORT_4_SUMMARY] });
    await flushAsync();
    expect(store.items().map((item) => item.reportNo)).toEqual(['RPT-2026-000004']);
  });

  it('a list never shown is not fetched early (the next page entry loads it)', () => {
    store.invalidate();
    httpMock.expectNone(LIST_URL);
  });

  it('coming back online or to the foreground refreshes a shown list and the eligibility', async () => {
    await loadList();
    (TestBed.inject(AppResumeService) as unknown as { resumedSubject: Subject<void> }).resumedSubject.next();

    httpMock.expectOne(apiUrl('/api/reports/my/active')).flush({ canSubmit: true, activeReport: null });
    httpMock.expectOne(LIST_URL).flush({ items: [REPORT_4_SUMMARY] });
    await flushAsync();
    expect(store.items()).toHaveLength(1);
  });

  it('overlapping refreshes (page entry, submission, app resume): every caller resolves with the latest list', async () => {
    await loadList();
    let settled = 0;
    const onEntry = store.refresh().then(() => settled++); // page entry
    store.invalidate(); // submission
    const onResume = store.refresh().then(() => settled++); // app resume

    const requests = httpMock.match(LIST_URL);
    expect(requests).toHaveLength(3);
    expect(requests.slice(0, 2).every((req) => req.cancelled)).toBe(true); // replaced, never answered
    requests[2].flush({ items: [REPORT_4_SUMMARY] });
    await Promise.all([onEntry, onResume]);

    expect(settled).toBe(2);
    expect(store.items()).toHaveLength(1);
    expect(store.loading()).toBe(false);
  });

  it('a refresh interrupted by sign-out still resolves, and does not leave "loading" on', async () => {
    const pending = store.refresh();
    TestBed.inject(SessionStore).setUnauthenticated('SIGNED_OUT');
    await pending;
    expect(store.loading()).toBe(false);
    expect(httpMock.match(LIST_URL)[0].cancelled).toBe(true);
  });
});

describe('ReportsStore eligibility across account changes', () => {
  const OTHER = { ...REPORTER_USER, id: '33333333-3333-4333-8333-333333333333' };
  const ACTIVE_URL = apiUrl('/api/reports/my/active');
  let store: ReportsStore;
  let session: SessionStore;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    session = TestBed.inject(SessionStore);
    session.setAuthenticated(REPORTER_USER, 'a');
    store = TestBed.inject(ReportsStore);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('a check started for Reporter A that answers after switching to Reporter B is discarded', async () => {
    const forA = store.refreshEligibility();
    session.setAuthenticated(OTHER, 'b'); // account switch resets the store

    const forB = store.refreshEligibility(); // B's own check is not merged into A's
    const [reqA, reqB] = httpMock.match(ACTIVE_URL);
    reqA.flush({ canSubmit: false, activeReport: { id: 'a-1', reportNo: 'RPT-A', status: 'SUBMITTED', agentStatus: null } });
    expect(await forA).toBeNull();
    expect(store.eligibility()).toBe('loading'); // A's answer never shows for B
    expect(store.activeReport()).toBeNull();

    reqB.flush({ canSubmit: true, activeReport: null });
    expect(await forB).toBe(true);
    expect(store.eligibility()).toBe('allowed');
  });

  it('a failed check from before sign-out does not mark the next account as "error"', async () => {
    const before = store.refreshEligibility();
    session.setUnauthenticated('SIGNED_OUT');
    httpMock.expectOne(ACTIVE_URL).error(new ProgressEvent('error'), { status: 0 });
    expect(await before).toBeNull();
    expect(store.eligibility()).toBe('unknown');
  });
});
