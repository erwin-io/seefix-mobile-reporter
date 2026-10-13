import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SessionStore } from '../../../core/auth/session.store';
import { REPORTER_USER, apiUrl, provideNavControllerStub } from '../../../testing/test-helpers';
import { ReportsStore } from '../reports.store';
import { NewReportPage } from './new-report.page';

describe('NewReportPage eligibility gate', () => {
  let store: ReportsStore;
  let httpMock: HttpTestingController;
  const ACTIVE_URL = apiUrl('/api/reports/my/active');

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideNavControllerStub()],
    });
    TestBed.inject(SessionStore).setAuthenticated(REPORTER_USER, 't');
    store = TestBed.inject(ReportsStore);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  const createPage = () => TestBed.runInInjectionContext(() => new NewReportPage());

  it('opens when a background re-check succeeds after the page’s own check failed (offline → online)', async () => {
    const page = createPage();

    // Opened while the connection was dropping: the page's own check fails.
    const own = page.checkEligibility();
    httpMock.expectOne(ACTIVE_URL).error(new ProgressEvent('error'), { status: 0 });
    await own;
    TestBed.tick();
    expect(store.eligibility()).toBe('error');
    expect(page.unlocked()).toBe(false);

    // Back online: the app re-checks in the background and the server allows a report.
    const background = store.refreshEligibility();
    httpMock.expectOne(ACTIVE_URL).flush({ canSubmit: true, activeReport: null });
    await background;
    TestBed.tick();

    expect(page.unlocked()).toBe(true);
  });

  it('stays closed while the server says a report is already active', async () => {
    const page = createPage();
    const own = page.checkEligibility();
    httpMock.expectOne(ACTIVE_URL).flush({
      canSubmit: false,
      activeReport: { id: 'r-5', reportNo: 'RPT-2026-000005', status: 'SUBMITTED', agentStatus: 'PENDING' },
    });
    await own;
    TestBed.tick();

    expect(page.unlocked()).toBe(false);
  });
});
