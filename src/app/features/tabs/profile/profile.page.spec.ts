import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService, LocalDataNotDeletedError } from '../../../core/auth/auth.service';
import { SessionStore } from '../../../core/auth/session.store';
import { LocalDbService } from '../../../core/storage/local-db.service';
import { AppResumeService } from '../../../core/lifecycle/app-resume.service';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { waitingItem } from '../../../testing/fixtures/outbox.fixture';
import { REPORTER_USER, provideNavControllerStub } from '../../../testing/test-helpers';
import { ReportOutboxStore } from '../../reports/outbox/report-outbox.store';
import { ReportSyncService } from '../../reports/outbox/report-sync.service';
import { ProfilePage } from './profile.page';

describe('ProfilePage log out', () => {
  let auth: { logout: ReturnType<typeof vi.fn> };
  let confirm: { confirm: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auth = { logout: vi.fn() };
    confirm = { confirm: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNavControllerStub(),
        { provide: AuthService, useValue: auth },
        { provide: ConfirmService, useValue: confirm },
      ],
    });
  });

  const page = () => TestBed.runInInjectionContext(() => new ProfilePage());

  it('cancelling the confirmation keeps the Reporter signed in', async () => {
    confirm.confirm.mockResolvedValueOnce(false);
    await page().confirmLogout();
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('when on-device data cannot be deleted, asks before signing out and keeps the data', async () => {
    confirm.confirm.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    auth.logout.mockRejectedValueOnce(new LocalDataNotDeletedError()).mockResolvedValueOnce(undefined);

    await page().confirmLogout();

    expect(confirm.confirm).toHaveBeenCalledTimes(2);
    expect(confirm.confirm.mock.calls[1][0]).toMatchObject({ header: "Couldn't delete saved data" });
    expect(auth.logout).toHaveBeenLastCalledWith({ keepLocalData: true });
  });

  it('cancelling "Log out anyway" leaves the Reporter signed in', async () => {
    confirm.confirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    auth.logout.mockRejectedValueOnce(new LocalDataNotDeletedError());

    await page().confirmLogout();

    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  describe('with a report saved on this phone and not sent (P3)', () => {
    let order: string[];

    beforeEach(async () => {
      order = [];
      TestBed.inject(SessionStore).setAuthenticated(REPORTER_USER, 't');
      (TestBed.inject(AppResumeService) as unknown as { _online: { set(v: boolean): void } })._online.set(false);
      await TestBed.inject(ReportOutboxStore).add(REPORTER_USER.id, waitingItem(), [{ bytes: new ArrayBuffer(1), mimeType: 'image/jpeg' }]);
      vi.spyOn(TestBed.inject(ReportSyncService), 'pause').mockImplementation(async () => {
        order.push('pause');
        return () => order.push('release');
      });
      auth.logout.mockImplementation(async () => order.push('logout'));
    });

    it('warns that the unsent report will be permanently deleted', async () => {
      confirm.confirm.mockResolvedValueOnce(false);
      await page().confirmLogout();

      expect(confirm.confirm.mock.calls[0][0]).toMatchObject({ header: 'Delete unsent reports?', confirmText: 'Delete and Log Out' });
      expect(confirm.confirm.mock.calls[0][0].message).toContain("a report saved on this phone that hasn't been sent to SEEFIX yet");
      expect(order).toEqual([]); // cancelled: nothing paused, nothing deleted
    });

    it('confirming pauses sending first, then deletes and signs out, then releases', async () => {
      confirm.confirm.mockResolvedValueOnce(true);
      await page().confirmLogout();
      expect(order).toEqual(['pause', 'logout', 'release']);
    });
  });

  describe('Review 4: the warning waits for the saved reports to load', () => {
    async function prepare(keys: (real: LocalDbService['keys']) => LocalDbService['keys']): Promise<void> {
      const local = TestBed.inject(LocalDbService);
      // A report saved on this phone earlier (e.g. before an offline relaunch).
      await local.putAll(REPORTER_USER.id, [{ key: `outbox/item/${waitingItem().id}`, value: waitingItem() }]);
      local.keys = keys(local.keys.bind(local));
      TestBed.inject(SessionStore).setAuthenticated(REPORTER_USER, 't');
    }

    it('right after start-up, with a slow load: still the unsent-report warning, before anything is deleted', async () => {
      await prepare((real) => (userId, prefix) => new Promise((resolve) => setTimeout(() => resolve(real(userId, prefix)), 50)));
      confirm.confirm.mockResolvedValueOnce(false);

      await page().confirmLogout(); // Log Out tapped immediately

      expect(confirm.confirm.mock.calls[0][0]).toMatchObject({ header: 'Delete unsent reports?' });
      expect(auth.logout).not.toHaveBeenCalled();
    });

    it('saved reports that cannot be read get their own destructive warning', async () => {
      await prepare(() => () => Promise.reject(new Error('IndexedDB unreadable')));
      confirm.confirm.mockResolvedValueOnce(false);

      await page().confirmLogout();

      expect(confirm.confirm.mock.calls[0][0]).toMatchObject({ header: 'Delete unsent reports?', destructive: true });
      expect(confirm.confirm.mock.calls[0][0].message).toContain("couldn't be read");
    });
  });
});
