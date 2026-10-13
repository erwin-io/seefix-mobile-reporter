import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SessionStore } from '../../../core/auth/session.store';
import { AppResumeService } from '../../../core/lifecycle/app-resume.service';
import { LocalDbService } from '../../../core/storage/local-db.service';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { waitingItem } from '../../../testing/fixtures/outbox.fixture';
import { REPORTER_USER, navControllerStub, provideNavControllerStub } from '../../../testing/test-helpers';
import { ReportDraftStore } from '../new-report/report-draft.store';
import { OutboxItem, ReportOutboxStore } from '../outbox/report-outbox.store';
import { ReportSyncService } from '../outbox/report-sync.service';
import { LocalReportPage } from './local-report.page';

describe('LocalReportPage (offline plan v3, P3)', () => {
  let nav: ReturnType<typeof navControllerStub>;
  let confirmAnswer: boolean;
  let outbox: ReportOutboxStore;
  let lastFixture: ComponentFixture<LocalReportPage> | null = null;

  beforeEach(() => {
    nav = navControllerStub();
    confirmAnswer = true;
    // jsdom has no object URLs.
    URL.createObjectURL = vi.fn((blob: Blob) => `blob:${blob.size}`) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNavControllerStub(nav),
        { provide: ConfirmService, useValue: { confirm: async () => confirmAnswer } },
      ],
    });
    TestBed.inject(SessionStore).setAuthenticated(REPORTER_USER, 't');
    outbox = TestBed.inject(ReportOutboxStore);
  });

  async function openSaved(item: OutboxItem): Promise<LocalReportPage> {
    await outbox.add(REPORTER_USER.id, item, [{ bytes: new TextEncoder().encode('original').buffer as ArrayBuffer, mimeType: 'image/jpeg' }]);
    const fixture = TestBed.createComponent(LocalReportPage);
    lastFixture = fixture;
    fixture.componentRef.setInput('id', item.id);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.photoUrls()).toHaveLength(item.photos.length));
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('shows the original photo, capture time and delivery reason, never "submitted" wording', async () => {
    (TestBed.inject(AppResumeService) as unknown as { _online: { set(v: boolean): void } })._online.set(false);
    const page = await openSaved(waitingItem());
    expect(page.status()).toEqual({ title: 'Waiting to send', detail: 'No internet connection', problem: false });
    expect(page.photoUrls()).toEqual(['blob:8']); // the 8 original bytes
    const rendered = (lastFixture!.nativeElement as HTMLElement).textContent ?? '';
    expect(rendered).toContain('Saved on this device · Not yet submitted');
    expect(rendered).toContain('No internet connection');
    expect(rendered.replace('Not yet submitted', '')).not.toMatch(/submitted/i);
  });

  it('Send now sends at once', async () => {
    const page = await openSaved(waitingItem({ reason: 'server' }));
    const sync = TestBed.inject(ReportSyncService);
    const spy = vi.spyOn(sync, 'syncNow').mockResolvedValue();
    page.sendNow();
    expect(spy).toHaveBeenCalledWith(true);
  });

  it('conflict: shows the active server report, and after it is resolved sends this one again', async () => {
    const page = await openSaved(
      waitingItem({ state: 'blocked', reason: null, activeReport: { id: 'r-5', reportNo: 'RPT-2026-000005', status: 'IN_PROGRESS' } }),
    );
    expect(page.status()).toMatchObject({ title: 'Not sent', detail: 'RPT-2026-000005 is still in progress', problem: true });
    page.viewActiveReport(page.item()!);
    expect(nav.navigateForward).toHaveBeenCalledWith(['/reports', 'r-5']);

    const spy = vi.spyOn(TestBed.inject(ReportSyncService), 'syncNow').mockResolvedValue();
    await page.tryAgain(page.item()!);
    expect(page.item()).toMatchObject({ state: 'waiting', activeReport: null });
    expect(spy).toHaveBeenCalledWith(true);
  });

  it('Edit returns it to the New Report draft with its photos, in one step', async () => {
    const item = waitingItem({ state: 'attention', message: 'The selected location is no longer available.' });
    const page = await openSaved(item);
    await page.edit(page.item()!);

    expect(outbox.items()).toEqual([]);
    const draft = await TestBed.inject(ReportDraftStore).load();
    expect(draft?.record.form).toMatchObject({ description: item.fields.description, building: 'Old Building', buildingId: '__other__' });
    expect(await draft?.photos[0].blob.text()).toBe('original');
    expect(await TestBed.inject(LocalDbService).keys(REPORTER_USER.id, 'outbox/')).toEqual([]);
    expect(nav.navigateForward).toHaveBeenCalledWith('/reports/new', { replaceUrl: true });
  });

  it('Discard asks first; cancelling keeps it, confirming deletes it and its photos', async () => {
    const page = await openSaved(waitingItem());
    confirmAnswer = false;
    await page.discard(page.item()!);
    expect(outbox.items()).toHaveLength(1);

    confirmAnswer = true;
    await page.discard(page.item()!);
    expect(outbox.items()).toEqual([]);
    expect(await TestBed.inject(LocalDbService).keys(REPORTER_USER.id)).toEqual([]);
  });

  it('once SEEFIX acknowledges it (200/201), the page becomes the server report', async () => {
    const item = waitingItem();
    await openSaved(item);
    TestBed.inject(ReportSyncService).sent$.next({
      id: item.id,
      report: { id: 'r-40', reportNo: 'RPT-2026-000040', status: 'SUBMITTED', agentStatus: 'PENDING', createdAt: '', imageCount: 1, agentTriggerAccepted: true },
    });
    expect(nav.navigateForward).toHaveBeenCalledWith(['/reports', 'r-40'], { replaceUrl: true });
  });
});
