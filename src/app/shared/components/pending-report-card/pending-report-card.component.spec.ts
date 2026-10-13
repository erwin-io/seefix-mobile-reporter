import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SessionStore } from '../../../core/auth/session.store';
import { AppResumeService } from '../../../core/lifecycle/app-resume.service';
import { ReportOutboxStore } from '../../../features/reports/outbox/report-outbox.store';
import { ReportSyncService } from '../../../features/reports/outbox/report-sync.service';
import { waitingItem } from '../../../testing/fixtures/outbox.fixture';
import { REPORTER_USER, navControllerStub, provideNavControllerStub } from '../../../testing/test-helpers';
import { PendingReportCardComponent } from './pending-report-card.component';

describe('PendingReportCardComponent (Home / My Reports)', () => {
  const nav = navControllerStub();

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideNavControllerStub(nav)] });
    TestBed.inject(SessionStore).setAuthenticated(REPORTER_USER, 't');
    (TestBed.inject(AppResumeService) as unknown as { _online: { set(v: boolean): void } })._online.set(false);
  });

  async function render(items = [waitingItem()]) {
    const outbox = TestBed.inject(ReportOutboxStore);
    for (const item of items) await outbox.add(REPORTER_USER.id, item, [{ bytes: new ArrayBuffer(1), mimeType: 'image/jpeg' }]);
    const fixture = TestBed.createComponent(PendingReportCardComponent);
    fixture.detectChanges();
    return { fixture, text: () => (fixture.nativeElement as HTMLElement).textContent ?? '' };
  }

  it('shows nothing when no report is waiting on this phone', async () => {
    const { text } = await render([]);
    expect(text().trim()).toBe('');
  });

  it('shows a waiting report prominently: saved on this device, why it is waiting, what it is', async () => {
    const { text } = await render();
    expect(text()).toContain('Saved on this device');
    expect(text()).toContain('Waiting to send');
    expect(text()).toContain('No internet connection');
    expect(text()).toContain('Water leak near the stairs');
    expect(text()).toContain('1 photo');
    expect(text()).not.toMatch(/\bsubmitted\b/i);
  });

  it('a conflict says which server report is in the way', async () => {
    const { text } = await render([
      waitingItem({ state: 'blocked', reason: null, activeReport: { id: 'r-5', reportNo: 'RPT-2026-000005', status: 'IN_PROGRESS' } }),
    ]);
    expect(text()).toContain('Not sent');
    expect(text()).toContain('RPT-2026-000005 is still in progress');
  });

  it('View opens the saved report; Send now sends at once', async () => {
    const { fixture } = await render();
    const card = fixture.componentInstance;
    card.open(TestBed.inject(ReportOutboxStore).items()[0]);
    expect(nav.navigateForward).toHaveBeenCalledWith(['/reports/local', waitingItem().id]);

    const spy = vi.spyOn(TestBed.inject(ReportSyncService), 'syncNow').mockResolvedValue();
    card.sendNow();
    expect(spy).toHaveBeenCalledWith(true);
  });
});
