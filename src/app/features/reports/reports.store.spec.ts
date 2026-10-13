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
});
