import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import { SessionStore } from '../../../core/auth/session.store';
import { AppResumeService } from '../../../core/lifecycle/app-resume.service';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { ConnectivityService, SLOW_REQUEST_MS } from '../../../core/connectivity/connectivity.service';
import { waitingItem } from '../../../testing/fixtures/outbox.fixture';
import { REPORTER_USER, apiUrl, navControllerStub, provideNavControllerStub } from '../../../testing/test-helpers';
import { ReportOutboxStore } from '../outbox/report-outbox.store';
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

  afterEach(() => {
    // The signed-in app syncs buildings/locations in the background (ReferenceStore); not what these tests check.
    httpMock.match((r) => r.url.startsWith(apiUrl('/api/reference/'))).forEach((r) => r.flush({ items: [] }));
    httpMock.verify();
  });

  const createPage = () => TestBed.runInInjectionContext(() => new NewReportPage());

  it('opens when the server allows a new report', async () => {
    const page = createPage();
    const own = page.checkEligibility();
    httpMock.expectOne(ACTIVE_URL).flush({ canSubmit: true, activeReport: null });
    await own;
    TestBed.tick();

    expect(page.unlocked()).toBe(true);
  });

  it('opens when SEEFIX cannot be asked (offline): the report is saved on the phone (plan D7)', async () => {
    const page = createPage();
    const own = page.checkEligibility();
    httpMock.expectOne(ACTIVE_URL).error(new ProgressEvent('error'), { status: 0 });
    await own;
    TestBed.tick();

    expect(store.eligibility()).toBe('error');
    expect(page.unlocked()).toBe(true);
  });

  it('stays closed while an earlier report is still waiting on this phone', async () => {
    const outbox = TestBed.inject(ReportOutboxStore);
    await outbox.ready();
    await outbox.add(REPORTER_USER.id, waitingItem(), [{ bytes: new ArrayBuffer(4), mimeType: 'image/jpeg' }]);
    const page = createPage();
    const own = page.checkEligibility();
    httpMock.expectOne(ACTIVE_URL).flush({ canSubmit: true, activeReport: null });
    await own;
    TestBed.tick();

    expect(page.gate()).toBe('unsent');
    expect(page.unlocked()).toBe(false);
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

describe('NewReportPage submit saves on the phone first', () => {
  const nav = navControllerStub();
  let toasts: string[];
  let alerts: { header: string; message: string }[];

  beforeEach(() => {
    toasts = [];
    alerts = [];
    const overlay = { present: async () => undefined, dismiss: async () => true, onDidDismiss: async () => ({}) };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNavControllerStub(nav),
        { provide: ConfirmService, useValue: { confirm: async () => true } },
        { provide: LoadingController, useValue: { create: async () => ({ ...overlay, message: '' }) } },
        { provide: ToastController, useValue: { create: async (o: { message: string }) => (toasts.push(o.message), overlay) } },
        {
          provide: AlertController,
          useValue: { create: async (o: { header: string; message: string }) => (alerts.push(o), overlay) },
        },
      ],
    });
    TestBed.inject(SessionStore).setAuthenticated(REPORTER_USER, 't');
    (TestBed.inject(AppResumeService) as unknown as { _online: { set(v: boolean): void } })._online.set(false);
  });

  afterEach(() => delete (navigator as { storage?: unknown }).storage);

  function filledPage(): NewReportPage {
    const page = TestBed.runInInjectionContext(() => new NewReportPage());
    page.form.patchValue({ description: 'Water leak near the stairs', building: 'Old Building' });
    page.photos.set([
      { id: 'p1', blob: new Blob(['original-bytes'], { type: 'image/jpeg' }), fileName: 'a.jpg', mimeType: 'image/jpeg', size: 14, previewUrl: '' },
    ]);
    return page;
  }

  it('offline: saves the report and its original photo, says "saved on this device", never "submitted"', async () => {
    const page = filledPage();
    await page.submit();

    const outbox = TestBed.inject(ReportOutboxStore);
    expect(outbox.items()).toHaveLength(1);
    expect(outbox.items()[0]).toMatchObject({ state: 'waiting', reason: 'offline', fields: { description: 'Water leak near the stairs' } });
    const photo = await outbox.photo(REPORTER_USER.id, outbox.items()[0].id, 0);
    expect(await photo.text()).toBe('original-bytes');

    expect(alerts[0].header).toBe('Report saved on this device');
    expect(alerts[0].message).toContain('Waiting to send · No internet connection');
    expect(toasts.join(' ')).not.toMatch(/submitted/i);
    expect(nav.navigateForward).toHaveBeenCalledWith(['/reports/local', outbox.items()[0].id], { replaceUrl: true });
    TestBed.inject(HttpTestingController).expectNone(apiUrl('/api/reports'));
  });

  it('Review 4: a form that was already open cannot save a second waiting report; it keeps everything', async () => {
    const page = filledPage(); // opened while nothing was waiting
    const outbox = TestBed.inject(ReportOutboxStore);
    await outbox.add(REPORTER_USER.id, waitingItem(), [{ bytes: new ArrayBuffer(1), mimeType: 'image/jpeg' }]);

    await page.submit();

    expect(outbox.items().map((item) => item.id)).toEqual([waitingItem().id]);
    expect(toasts[0]).toContain('A report saved on this phone is still waiting to send');
    expect(page.form.value.description).toBe('Water leak near the stairs');
    expect(page.photos()).toHaveLength(1);
    expect(alerts).toEqual([]);
  });

  it('a full phone saves nothing and keeps the form as it was', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: { estimate: () => Promise.resolve({ quota: 10 * 1024 * 1024, usage: 9 * 1024 * 1024 }) },
      configurable: true,
    });
    const page = filledPage();
    await page.submit();

    expect(TestBed.inject(ReportOutboxStore).items()).toEqual([]);
    expect(toasts).toContain('Not enough free space on this phone to save the report. Free up some space and try again.');
    expect(page.form.value.description).toBe('Water leak near the stairs');
    expect(page.photos()).toHaveLength(1);
    expect(page.submitting()).toBe(false);
    expect(alerts).toEqual([]);
  });

  describe('online (Review 3)', () => {
    const SIGN_URL = apiUrl('/api/uploads/sign');
    const UPLOAD_URL = 'https://api.cloudinary.com/v1_1/demo/image/upload';
    const REPORTS_URL = apiUrl('/api/reports');

    beforeEach(() => (TestBed.inject(AppResumeService) as unknown as { _online: { set(v: boolean): void } })._online.set(true));

    async function nextRequest(url: string) {
      const http = TestBed.inject(HttpTestingController);
      for (let i = 0; i < 300; i++) {
        const found = http.match(url);
        if (found.length) return found[0];
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      throw new Error(`No request to ${url}`);
    }

    async function deliver(respond: (post: Awaited<ReturnType<typeof nextRequest>>) => void) {
      (await nextRequest(SIGN_URL)).flush({ uploadUrl: UPLOAD_URL, fields: {} });
      (await nextRequest(UPLOAD_URL)).flush({ public_id: 'seefix/reports/p1' });
      respond(await nextRequest(REPORTS_URL));
    }

    afterEach(() => {
      const http = TestBed.inject(HttpTestingController);
      http.match(() => true).filter((req) => !req.cancelled).forEach((req) => req.flush({ items: [], canSubmit: true, activeReport: null }));
    });

    it('P0: saves before any network call: the eligibility endpoint is never waited on', async () => {
      const page = filledPage();
      const submitting = page.submit();
      await vi.waitFor(() => expect(TestBed.inject(ReportOutboxStore).items()).toHaveLength(1));
      TestBed.inject(HttpTestingController).expectNone(apiUrl('/api/reports/my/active'));

      await deliver((post) => post.flush({ id: 'r-30', reportNo: 'RPT-2026-000030', status: 'SUBMITTED', agentStatus: 'PENDING', createdAt: '', imageCount: 1 }, { status: 201, statusText: 'Created' }));
      await submitting;
      expect(toasts).toEqual([]); // the app announces 'received by SEEFIX' (AppComponent)
      expect(nav.navigateForward).toHaveBeenCalledWith(['/reports', 'r-30'], { replaceUrl: true });
      expect(TestBed.inject(ReportOutboxStore).items()).toEqual([]);
    });

    it('P0: an active report found at delivery keeps this one saved and says so', async () => {
      const page = filledPage();
      const submitting = page.submit();
      await deliver((post) =>
        post.flush(
          { error: { code: 'ACTIVE_REPORT_EXISTS', details: { activeReport: { id: 'r-5', reportNo: 'RPT-2026-000005', status: 'IN_PROGRESS' } } } },
          { status: 409, statusText: 'Conflict' },
        ),
      );
      await submitting;
      expect(TestBed.inject(ReportOutboxStore).items()[0]).toMatchObject({ state: 'blocked' });
      expect(alerts[0]).toMatchObject({ header: 'Saved on this device, not sent' });
      expect(alerts[0].message).toContain('RPT-2026-000005 is still in progress');
    });

    it('P1: on a slow connection the saved report is still sent, without making Submit wait', async () => {
      TestBed.inject(ConnectivityService).apiSucceeded(SLOW_REQUEST_MS + 1);
      const page = filledPage();
      await page.submit(); // returns without waiting for the send
      expect(alerts[0].header).toBe('Report saved on this device');

      await deliver((post) => post.flush({ id: 'r-31', reportNo: 'RPT-2026-000031', status: 'SUBMITTED', agentStatus: 'PENDING', createdAt: '', imageCount: 1 }));
      await vi.waitFor(() => expect(TestBed.inject(ReportOutboxStore).items()).toEqual([]));
    });
  });
});
