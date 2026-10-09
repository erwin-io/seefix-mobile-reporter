import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SessionStore } from '../../core/auth/session.store';
import { REPORTER_USER } from '../../testing/test-helpers';
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
    httpMock.expectOne('/api/reports/my/active').flush({ canSubmit: true, activeReport: null });
    expect(await check).toBe(true);
    expect(store.canSubmit()).toBe(true);
    expect(store.activeReport()).toBeNull();
  });

  it('blocks with the active report (an Agent FAILED report still blocks)', async () => {
    const check = store.refreshEligibility();
    httpMock.expectOne('/api/reports/my/active').flush({ canSubmit: false, activeReport: ACTIVE });
    expect(await check).toBe(false);
    expect(store.eligibility()).toBe('blocked');
    expect(store.activeReport()?.reportNo).toBe('RPT-2026-000005');
  });

  it('a failed check becomes error (still blocked), never optimistic', async () => {
    const first = store.refreshEligibility();
    httpMock.expectOne('/api/reports/my/active').flush({ canSubmit: true, activeReport: null });
    await first;
    const second = store.refreshEligibility();
    expect(store.eligibility()).toBe('allowed'); // last known state stays visible while re-checking
    httpMock.expectOne('/api/reports/my/active').error(new ProgressEvent('error'), { status: 0 });
    expect(await second).toBeNull();
    expect(store.eligibility()).toBe('error');
    expect(store.canSubmit()).toBe(false);
  });

  it('shares one in-flight check between callers', async () => {
    const a = store.refreshEligibility();
    const b = store.refreshEligibility();
    httpMock.expectOne('/api/reports/my/active').flush({ canSubmit: true, activeReport: null });
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
