import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { LocalDbError, LocalDbService, StorageFullError, toStorageError } from './local-db.service';

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('LocalDbService', () => {
  let db: LocalDbService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    db = TestBed.inject(LocalDbService);
  });

  afterEach(() => delete (navigator as { storage?: unknown }).storage);

  /** jsdom has no navigator.storage; define the one under test. */
  function stubStorage(value: Partial<StorageManager> | undefined): void {
    Object.defineProperty(navigator, 'storage', { value, configurable: true });
  }

  it('keeps each user’s data separate', async () => {
    await db.putAll(ALICE, [{ key: 'outbox/1', value: { text: 'alice' } }]);
    await db.putAll(BOB, [{ key: 'outbox/1', value: { text: 'bob' } }]);

    expect(await db.get(ALICE, 'outbox/1')).toEqual({ text: 'alice' });
    expect(await db.get(BOB, 'outbox/1')).toEqual({ text: 'bob' });
    expect(await db.keys(ALICE)).toEqual(['outbox/1']);
  });

  it('lists keys by prefix', async () => {
    await db.putAll(ALICE, [
      { key: 'draft', value: 1 },
      { key: 'outbox/a', value: 2 },
      { key: 'outbox/b', value: 3 },
    ]);
    expect(await db.keys(ALICE, 'outbox/')).toEqual(['outbox/a', 'outbox/b']);
  });

  it('a multi-entry save is all or nothing: one bad entry rolls back the whole write', async () => {
    await db.putAll(ALICE, [{ key: 'keep', value: 'original' }]);

    const write = db.putAll(
      ALICE,
      [
        { key: 'outbox/1', value: { ok: true } },
        { key: 'outbox/1-photo', value: () => 'functions cannot be stored' }, // DataCloneError
      ],
      ['keep'],
    );

    await expect(write).rejects.toBeInstanceOf(LocalDbError);
    expect(await db.keys(ALICE)).toEqual(['keep']);
    expect(await db.get(ALICE, 'keep')).toBe('original');
  });

  it('wiping one user leaves other users untouched', async () => {
    await db.putAll(ALICE, [{ key: 'outbox/1', value: 1 }]);
    await db.putAll(BOB, [{ key: 'outbox/1', value: 2 }]);

    await db.wipeUser(ALICE);

    expect(await db.keys(ALICE)).toEqual([]);
    expect(await db.get(BOB, 'outbox/1')).toBe(2);
  });

  it('refuses to save when the browser reports too little free space', async () => {
    stubStorage({ estimate: () => Promise.resolve({ quota: 100 * 1024 * 1024, usage: 90 * 1024 * 1024 }) });

    await expect(db.ensureSpace(8 * 1024 * 1024)).rejects.toBeInstanceOf(StorageFullError);
    await expect(db.ensureSpace(1024)).resolves.toBeUndefined();
  });

  it('an unknown quota does not block saving', async () => {
    stubStorage(undefined);
    await expect(db.ensureSpace(50 * 1024 * 1024)).resolves.toBeUndefined();
  });

  it('maps QuotaExceededError to StorageFullError', () => {
    expect(toStorageError(new DOMException('full', 'QuotaExceededError'))).toBeInstanceOf(StorageFullError);
    expect(toStorageError(new DOMException('other', 'DataError'))).toBeInstanceOf(LocalDbError);
  });

  it('asks for persistent storage only once', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    stubStorage({ persist });

    expect(await db.requestPersistence()).toBe(true);
    expect(await db.requestPersistence()).toBe(false);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('stores one identity record', async () => {
    expect(await db.getIdentity()).toBeUndefined();
    await db.setIdentity({ user: { id: ALICE } });
    expect(await db.getIdentity()).toEqual({ user: { id: ALICE } });
    await db.clearIdentity();
    expect(await db.getIdentity()).toBeUndefined();
  });
});
