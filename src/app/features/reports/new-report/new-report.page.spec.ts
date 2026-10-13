import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import { SessionStore } from '../../../core/auth/session.store';
import { AppResumeService } from '../../../core/lifecycle/app-resume.service';
import { ConfirmService } from '../../../shared/services/confirm.service';
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

  afterEach(() => httpMock.verify());

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
    await outbox.add(waitingItem(), [{ bytes: new ArrayBuffer(4), mimeType: 'image/jpeg' }]);
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
    const photo = await outbox.photo(outbox.items()[0].id, 0);
    expect(await photo.text()).toBe('original-bytes');

    expect(alerts[0].header).toBe('Report saved on this device');
    expect(alerts[0].message).toContain('Waiting to send · No internet connection');
    expect(toasts.join(' ')).not.toMatch(/submitted/i);
    expect(nav.navigateRoot).toHaveBeenCalledWith('/tabs/home');
    TestBed.inject(HttpTestingController).expectNone(apiUrl('/api/reports'));
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
});
