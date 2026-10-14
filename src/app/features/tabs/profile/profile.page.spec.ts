import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService, LocalDataNotDeletedError } from '../../../core/auth/auth.service';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { provideNavControllerStub } from '../../../testing/test-helpers';
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
});
