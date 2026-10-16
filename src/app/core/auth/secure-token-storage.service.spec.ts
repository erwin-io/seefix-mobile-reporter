import { TestBed } from '@angular/core/testing';
import { SecureTokenStorage } from './secure-token-storage.service';

/** Browser (non-native) behaviour; the native Keychain/Keystore path is unchanged. */
describe('SecureTokenStorage in a browser', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('keeps the session across a page reload (a fresh service instance) via sessionStorage, never localStorage', async () => {
    await TestBed.inject(SecureTokenStorage).set('jwt-1');
    TestBed.resetTestingModule(); // "reload": new app, empty memory
    expect(await TestBed.inject(SecureTokenStorage).get()).toBe('jwt-1');
    expect(localStorage.length).toBe(0);
  });

  it('clear() signs out for the reloaded tab too', async () => {
    const storage = TestBed.inject(SecureTokenStorage);
    await storage.set('jwt-2');
    await storage.clear();
    TestBed.resetTestingModule();
    expect(await TestBed.inject(SecureTokenStorage).get()).toBeNull();
  });

  it('still works in memory when sessionStorage is blocked', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const storage = TestBed.inject(SecureTokenStorage);
    await storage.set('jwt-3');
    expect(await storage.get()).toBe('jwt-3');
    spy.mockRestore();
  });
});
