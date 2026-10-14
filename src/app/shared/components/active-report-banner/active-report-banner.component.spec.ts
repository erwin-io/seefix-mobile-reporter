import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SessionStore } from '../../../core/auth/session.store';
import { AppResumeService } from '../../../core/lifecycle/app-resume.service';
import { ReportOutboxStore } from '../../../features/reports/outbox/report-outbox.store';
import { ReportsStore } from '../../../features/reports/reports.store';
import { waitingItem } from '../../../testing/fixtures/outbox.fixture';
import { REPORTER_USER, apiUrl, navControllerStub, provideNavControllerStub } from '../../../testing/test-helpers';
import { ActiveReportBannerComponent } from './active-report-banner.component';

const ACTIVE = { id: 'r-5', reportNo: 'RPT-2026-000005', status: 'PENDING_REVIEW', agentStatus: 'FAILED', createdAt: '2026-10-09T00:00:00Z' };

describe('ActiveReportBannerComponent (Home / My Reports, issue #13)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideNavControllerStub(navControllerStub())] });
    TestBed.inject(SessionStore).setAuthenticated(REPORTER_USER, 't');
  });

  function setOnline(online: boolean): void {
    (TestBed.inject(AppResumeService) as unknown as { _online: { set(v: boolean): void } })._online.set(online);
  }

  /** The eligibility check fails, as it does when the phone cannot reach SEEFIX. */
  async function failEligibility(): Promise<void> {
    const store = TestBed.inject(ReportsStore);
    const request = store.refreshEligibility();
    TestBed.inject(HttpTestingController).expectOne(apiUrl('/api/reports/my/active')).error(new ProgressEvent('error'), { status: 0 });
    await request;
    expect(store.eligibility()).toBe('error');
  }

  function render() {
    const fixture = TestBed.createComponent(ActiveReportBannerComponent);
    fixture.detectChanges();
    return () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('offline: no misleading "Can\'t check right now" card (D7 lets the form save on the phone)', async () => {
    setOnline(false);
    await failEligibility();
    const text = render();
    expect(text()).not.toContain("Can't check right now");
    expect(text()).not.toContain('Retry');
  });

  it('online, nothing waiting, check failed: the Retry card stays available', async () => {
    setOnline(true);
    await failEligibility();
    const text = render();
    expect(text()).toContain("Can't check right now");
    expect(text()).toContain('Retry');
  });

  it('a report waiting on this phone: no duplicate Retry card next to the pending-report card', async () => {
    setOnline(true);
    await TestBed.inject(ReportOutboxStore).add(REPORTER_USER.id, waitingItem(), [{ bytes: new ArrayBuffer(1), mimeType: 'image/jpeg' }]);
    await failEligibility();
    const text = render();
    expect(text()).not.toContain("Can't check right now");
    expect(text()).not.toContain('Retry');
  });

  it('a server-confirmed active report stays visible, even offline with a report waiting', async () => {
    setOnline(false);
    await TestBed.inject(ReportOutboxStore).add(REPORTER_USER.id, waitingItem(), [{ bytes: new ArrayBuffer(1), mimeType: 'image/jpeg' }]);
    TestBed.inject(ReportsStore).markBlocked(ACTIVE);
    const text = render();
    expect(text()).toContain('Report in progress');
    expect(text()).toContain('RPT-2026-000005');
    expect(text()).toContain('View active report');
  });
});
