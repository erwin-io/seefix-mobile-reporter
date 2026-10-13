import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SessionStore } from '../../../core/auth/session.store';
import { ActiveReportDto } from '../../../core/models/report.model';
import { LocalDbService } from '../../../core/storage/local-db.service';

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
interface StoredPhoto {
  bytes: ArrayBuffer;
  mimeType: string;
}

const ITEM_PREFIX = 'outbox/item/';
const itemKey = (id: string) => `${ITEM_PREFIX}${id}`;
const photoKey = (id: string, index: number) => `outbox/photo/${id}/${index}`;

/**
 * Reports saved on this phone and not yet received by SEEFIX, for the signed-in Reporter only. A report and its
 * photos are written in one transaction, so it is either fully saved or not at all.
 */
@Injectable({ providedIn: 'root' })
export class ReportOutboxStore {
  private readonly db = inject(LocalDbService);
  private readonly session = inject(SessionStore);
  private readonly _items = signal<OutboxItem[]>([]);
  private loaded: Promise<void> = Promise.resolve();
  private loadedFor: string | null = null;

  readonly items = this._items.asReadonly();
  readonly hasUnsent = computed(() => this._items().length > 0);

  constructor() {
    const currentUser = () => (this.session.isAuthenticated() ? (this.session.user()?.id ?? null) : null);
    this.loaded = this.load(currentUser());
    // Each Reporter only ever sees their own items; another account's stay on disk, untouched.
    effect(() => {
      const userId = currentUser();
      if (userId !== this.loadedFor) this.loaded = this.load(userId);
    });
  }

  /** Resolves once the current Reporter's items are loaded. */
  ready(): Promise<void> {
    return this.loaded;
  }

  /**
   * Saves a new report with its photos' original bytes and deletes `draftKeys`, all in one transaction.
   * Throws StorageFullError / LocalDbError with nothing saved.
   */
  async add(item: OutboxItem, photos: StoredPhoto[], draftKeys: string[] = []): Promise<void> {
    const userId = this.requireUser();
    await this.db.ensureSpace(photos.reduce((total, photo) => total + photo.bytes.byteLength, 0));
    await this.db.putAll(
      userId,
      [{ key: itemKey(item.id), value: item }, ...photos.map((value, index) => ({ key: photoKey(item.id, index), value }))],
      draftKeys,
    );
    this._items.update((items) => [...items, item]);
  }

  async update(item: OutboxItem): Promise<void> {
    await this.db.putAll(this.requireUser(), [{ key: itemKey(item.id), value: item }]);
    this._items.update((items) => items.map((current) => (current.id === item.id ? item : current)));
  }

  async photo(id: string, index: number): Promise<Blob> {
    const stored = await this.db.get<StoredPhoto>(this.requireUser(), photoKey(id, index));
    if (!stored) throw new Error(`Photo ${index + 1} of the saved report is missing.`);
    return new Blob([stored.bytes], { type: stored.mimeType });
  }

  /** After SEEFIX received it (or the Reporter discarded it): the item and its photos go in one transaction. */
  async remove(id: string): Promise<void> {
    const item = this._items().find((current) => current.id === id);
    const keys = [itemKey(id), ...(item?.photos ?? []).map((_, index) => photoKey(id, index))];
    await this.db.delete(this.requireUser(), keys);
    this._items.update((items) => items.filter((current) => current.id !== id));
  }

  private async load(userId: string | null): Promise<void> {
    this.loadedFor = userId;
    this._items.set([]);
    if (!userId) return;
    try {
      const keys = await this.db.keys(userId, ITEM_PREFIX);
      const items = await Promise.all(keys.map((key) => this.db.get<OutboxItem>(userId, key)));
      if (this.loadedFor !== userId) return; // the account changed while loading
      // An app closed mid-send left "sending": it is simply waiting again.
      this._items.set(
        items
          .filter((item): item is OutboxItem => !!item)
          .map((item) => (item.state === 'sending' ? { ...item, state: 'waiting' } : item)),
      );
    } catch {
      // Unreadable storage: nothing to show or send; the next sign-in tries again.
    }
  }

  private requireUser(): string {
    const userId = this.session.user()?.id;
    if (!userId) throw new Error('No signed-in Reporter.');
    return userId;
  }
}

/** SHA-256 hex of a photo's original bytes. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
