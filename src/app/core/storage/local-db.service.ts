import { Injectable } from '@angular/core';

const DB_NAME = 'seefix-reporter';
const DB_VERSION = 1;
/** One record: the last server-verified Reporter (see VerifiedIdentityStore). Never the token. */
const IDENTITY_STORE = 'identity';
/** Per-user records keyed `[userId, key]`; values may contain Blobs (photos). */
const USER_STORE = 'userData';
/** Headroom kept free beyond a write's own size before saving. */
const SPACE_MARGIN_BYTES = 5 * 1024 * 1024;

/** The phone has no room for the write (quota check or QuotaExceededError). Nothing was saved. */
export class StorageFullError extends Error {
  override readonly name = 'StorageFullError';
  constructor() {
    super('Not enough free space on this phone to save.');
  }
}

/** Any other failed write. The transaction rolled back, so nothing was saved. */
export class LocalDbError extends Error {
  override readonly name = 'LocalDbError';
}

export interface LocalEntry {
  key: string;
  value: unknown;
}

/**
 * IndexedDB on the device (a web API: no Capacitor plugin). Per-user data is isolated by user ID, so another
 * Reporter signing in on the same phone never reads it. Multi-entry writes are one transaction: all or nothing.
 */
@Injectable({ providedIn: 'root' })
export class LocalDbService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private persistenceRequested = false;

  getIdentity<T>(): Promise<T | undefined> {
    return this.read<T>(IDENTITY_STORE, 'current');
  }

  async setIdentity(value: unknown): Promise<void> {
    await this.write(IDENTITY_STORE, (store) => store.put(value, 'current'));
  }

  async clearIdentity(): Promise<void> {
    await this.write(IDENTITY_STORE, (store) => store.delete('current'));
  }

  get<T>(userId: string, key: string): Promise<T | undefined> {
    return this.read<T>(USER_STORE, [userId, key]);
  }

  /** Saves every entry and removes `deleteKeys` in one transaction; on any failure none of it is applied. */
  async putAll(userId: string, entries: LocalEntry[], deleteKeys: string[] = []): Promise<void> {
    await this.write(USER_STORE, (store) => {
      for (const key of deleteKeys) store.delete([userId, key]);
      for (const entry of entries) store.put(entry.value, [userId, entry.key]);
    });
  }

  async delete(userId: string, keys: string[]): Promise<void> {
    await this.putAll(userId, [], keys);
  }

  /** The user's keys starting with `prefix`, in key order. */
  async keys(userId: string, prefix = ''): Promise<string[]> {
    const db = await this.open();
    const request = db.transaction(USER_STORE).objectStore(USER_STORE).getAllKeys(userRange(userId, prefix));
    const keys = (await settle(request)) as [string, string][];
    return keys.map(([, key]) => key);
  }

  /** Removes everything stored for one user (manual sign-out only; an expired session keeps it). */
  async wipeUser(userId: string): Promise<void> {
    await this.write(USER_STORE, (store) => store.delete(userRange(userId)));
  }

  /** Throws StorageFullError when the browser reports less free quota than `bytes` plus a safety margin. */
  async ensureSpace(bytes: number): Promise<void> {
    const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
    if (estimate?.quota == null || estimate.usage == null) return; // unknown: the write itself still fails safely
    if (estimate.quota - estimate.usage < bytes + SPACE_MARGIN_BYTES) throw new StorageFullError();
  }

  /** Asks the browser to keep this app's data under storage pressure. A request only, never a guarantee. */
  async requestPersistence(): Promise<boolean> {
    if (this.persistenceRequested) return false;
    this.persistenceRequested = true;
    return (await navigator.storage?.persist?.().catch(() => false)) ?? false;
  }

  private open(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDENTITY_STORE)) db.createObjectStore(IDENTITY_STORE);
        if (!db.objectStoreNames.contains(USER_STORE)) db.createObjectStore(USER_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(toStorageError(request.error));
    }).catch((error: unknown) => {
      this.dbPromise = null; // allow a later retry
      throw error;
    });
    return this.dbPromise;
  }

  private async read<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
    const db = await this.open();
    return (await settle(db.transaction(storeName).objectStore(storeName).get(key))) as T | undefined;
  }

  /** Resolves only after the transaction committed; rejects (rolled back) otherwise. */
  private async write(storeName: string, apply: (store: IDBObjectStore) => void): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      try {
        apply(tx.objectStore(storeName));
      } catch (error) {
        // e.g. DataCloneError thrown synchronously by put(): abort so earlier operations in this call roll back.
        tx.abort();
        reject(toStorageError(error));
        return;
      }
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(toStorageError(tx.error));
      tx.onerror = () => reject(toStorageError(tx.error));
    });
  }
}

function userRange(userId: string, prefix = ''): IDBKeyRange {
  return IDBKeyRange.bound([userId, prefix], [userId, `${prefix}￿`]);
}

function settle(request: IDBRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(toStorageError(request.error));
  });
}

export function toStorageError(error: unknown): Error {
  if (error instanceof StorageFullError || error instanceof LocalDbError) return error;
  const name = (error as { name?: string } | null)?.name;
  if (name === 'QuotaExceededError') return new StorageFullError();
  return new LocalDbError(error instanceof Error ? error.message : `Local storage failed (${name ?? 'unknown'}).`);
}
