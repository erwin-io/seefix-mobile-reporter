import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SessionStore } from '../../../core/auth/session.store';
import { ActiveReportDto } from '../../../core/models/report.model';
import { LocalDbService, LocalEntry } from '../../../core/storage/local-db.service';

/**
 * - `waiting`: saved on the phone, will be sent (see `reason` for why it hasn't been yet)
 * - `sending`: being sent now
 * - `blocked`: the server has another active report for this Reporter
 * - `attention`: the server rejected it; the Reporter has to act
 */
export type OutboxState = 'waiting' | 'sending' | 'blocked' | 'attention';
/** Why a `waiting` report hasn't been sent yet. */
export type OutboxReason = 'offline' | 'slow' | 'server' | 'upload' | 'busy' | 'session' | null;

export interface OutboxFields {
  description: string;
  notes: string | null;
  locationId: string | null;
  building: string | null;
  floor: string | null;
  roomOrArea: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
}

export interface OutboxPhoto {
  fileName: string;
  mimeType: string;
  size: number;
  /** SHA-256 of the original bytes (sent as imageDigests). */
  digest: string;
  /** Set as soon as Cloudinary accepted the upload, so a retry does not upload it again. */
  publicId: string | null;
}

export interface OutboxItem {
  /** Also the `clientReportId`: fixed when Submit is tapped, reused for every retry. */
  id: string;
  capturedAt: string;
  fields: OutboxFields;
  photos: OutboxPhoto[];
  state: OutboxState;
  reason: OutboxReason;
  /** Server message for `attention`. */
  message: string | null;
  /** The conflicting server report for `blocked`. */
  activeReport: ActiveReportDto | null;
  attempts: number;
  /** Times the photos had to be uploaded again because the server could not use them. */
  reuploads: number;
  nextAttemptAt: number | null;
}

/** A photo's original bytes as stored on the phone. */
export interface StoredPhoto {
  bytes: ArrayBuffer;
  mimeType: string;
}

/** A new report can't be saved: one is already waiting on this phone, or the saved reports can't be read. */
export class ReportAlreadyWaitingError extends Error {
  override readonly name = 'ReportAlreadyWaitingError';
  constructor(readonly reason: 'waiting' | 'unreadable') {
    super(reason === 'waiting' ? 'A report is already waiting to send.' : 'Saved reports could not be read.');
  }
}

const ITEM_PREFIX = 'outbox/item/';
const itemKey = (id: string) => `${ITEM_PREFIX}${id}`;
const photoKey = (id: string, index: number) => `outbox/photo/${id}/${index}`;

/**
 * Reports saved on this phone and not yet received by SEEFIX. Every operation names the Reporter it acts for, so
 * work started for one account can never land in another's storage; only the signed-in Reporter's items are
 * shown. Loading and changes run one at a time, and a report and its photos are written in one transaction.
 */
@Injectable({ providedIn: 'root' })
export class ReportOutboxStore {
  private readonly db = inject(LocalDbService);
  private readonly session = inject(SessionStore);
  private readonly _items = signal<OutboxItem[]>([]);
  private readonly _unavailable = signal(false);
  /** Whose items `_items` holds. */
  private shownFor: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  readonly items = this._items.asReadonly();
  readonly hasUnsent = computed(() => this._items().length > 0);
  /** The saved reports could not be read: never treat that as "nothing waiting". */
  readonly unavailable = this._unavailable.asReadonly();

  constructor() {
    const currentUser = () => (this.session.isAuthenticated() ? (this.session.user()?.id ?? null) : null);
    this.show(currentUser());
    // Each Reporter only ever sees their own items; another account's stay on disk, untouched.
    effect(() => {
      const userId = currentUser();
      if (userId !== this.shownFor) this.show(userId);
    });
  }

  /** Resolves once everything queued so far (including loading) is done. */
  ready(): Promise<void> {
    return this.enqueue(async () => undefined);
  }

  /**
   * The items of exactly this Reporter, loaded now if the store still shows another account (the account switch
   * reaches the store a moment after the session changes).
   */
  async itemsFor(userId: string): Promise<OutboxItem[]> {
    if (this.shownFor !== userId) this.show(userId);
    await this.ready();
    return this.shownFor === userId ? this._items() : [];
  }

  /**
   * Saves a new report with its photos' original bytes and deletes `draftKeys`, all in one transaction.
   * Throws StorageFullError / LocalDbError with nothing saved.
   */
  add(userId: string, item: OutboxItem, photos: StoredPhoto[], draftKeys: string[] = []): Promise<void> {
    return this.enqueue(async () => {
      // One report per Reporter at a time, checked on the phone's storage itself (not the list in memory, which
      // may still be loading or stale): a second one is refused, and so is any save while that can't be read.
      const waiting = await this.db.keys(userId, ITEM_PREFIX).catch(() => {
        throw new ReportAlreadyWaitingError('unreadable');
      });
      if (waiting.length) throw new ReportAlreadyWaitingError('waiting');
      await this.db.ensureSpace(photos.reduce((total, photo) => total + photo.bytes.byteLength, 0));
      await this.db.putAll(
        userId,
        [{ key: itemKey(item.id), value: item }, ...photos.map((value, index) => ({ key: photoKey(item.id, index), value }))],
        draftKeys,
      );
      if (this.shownFor === userId) this._items.update((items) => [...items, item]);
    });
  }

  update(userId: string, item: OutboxItem): Promise<void> {
    return this.enqueue(async () => {
      await this.db.putAll(userId, [{ key: itemKey(item.id), value: item }]);
      if (this.shownFor === userId) {
        this._items.update((items) => items.map((current) => (current.id === item.id ? item : current)));
      }
    });
  }

  async photo(userId: string, id: string, index: number): Promise<Blob> {
    const stored = await this.db.get<StoredPhoto>(userId, photoKey(id, index));
    if (!stored) throw new Error(`Photo ${index + 1} of the saved report is missing.`);
    return new Blob([stored.bytes], { type: stored.mimeType });
  }

  /** After SEEFIX received it (or the Reporter discarded it): the item and its photos go in one transaction. */
  remove(userId: string, item: OutboxItem): Promise<void> {
    return this.enqueue(async () => {
      await this.db.delete(userId, [itemKey(item.id), ...item.photos.map((_, index) => photoKey(item.id, index))]);
      if (this.shownFor === userId) this._items.update((items) => items.filter((current) => current.id !== item.id));
    });
  }

  /**
   * Back to editing: in one transaction the saved report and its photos become the draft (entries built by
   * `toDraft` from the original bytes) and `draftKeys` (any older draft) are deleted.
   */
  returnToDraft(
    userId: string,
    item: OutboxItem,
    toDraft: (photos: StoredPhoto[]) => Promise<LocalEntry[]>,
    draftKeys: string[] = [],
  ): Promise<void> {
    return this.enqueue(async () => {
      const photos = await Promise.all(item.photos.map((_, index) => this.db.get<StoredPhoto>(userId, photoKey(item.id, index))));
      if (photos.some((photo) => !photo)) throw new Error('A photo of the saved report is missing.');
      const outboxKeys = [itemKey(item.id), ...item.photos.map((_, index) => photoKey(item.id, index))];
      await this.db.putAll(userId, await toDraft(photos as StoredPhoto[]), [...draftKeys, ...outboxKeys]);
      if (this.shownFor === userId) this._items.update((items) => items.filter((current) => current.id !== item.id));
    });
  }

  private show(userId: string | null): void {
    this.shownFor = userId;
    this._items.set([]);
    this._unavailable.set(false);
    if (userId) void this.enqueue(() => this.load(userId));
  }

  private async load(userId: string): Promise<void> {
    try {
      const keys = await this.db.keys(userId, ITEM_PREFIX);
      const items = await Promise.all(keys.map((key) => this.db.get<OutboxItem>(userId, key)));
      if (this.shownFor !== userId) return; // the account changed while loading
      // An app closed mid-send left "sending": it is simply waiting again.
      this._items.set(
        items
          .filter((item): item is OutboxItem => !!item)
          .map((item) => (item.state === 'sending' ? { ...item, state: 'waiting' } : item)),
      );
    } catch {
      if (this.shownFor === userId) this._unavailable.set(true);
    }
  }

  /** Runs `task` after everything queued before it; a failure is reported to its caller only. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => undefined);
    return result;
  }
}

/** SHA-256 hex of a photo's original bytes. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
