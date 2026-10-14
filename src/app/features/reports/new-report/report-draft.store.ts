import { Injectable, inject } from '@angular/core';
import { SessionStore } from '../../../core/auth/session.store';
import { LocalDbService } from '../../../core/storage/local-db.service';
import type { OutboxItem } from '../outbox/report-outbox.store';

/** Building choice meaning "my location isn't listed": free-text building/floor/area. */
export const OTHER_LOCATION = '__other__';
export const DRAFT_PREFIX = 'draft/';
const RECORD_KEY = 'draft/record';
const photoKey = (id: string) => `draft/photo/${id}`;

/** The unfinished New Report form, as saved on the phone. */
export interface DraftRecord {
  form: Record<string, string>;
  gps: { lat: number; lng: number; accuracy: number | null } | null;
  photos: { id: string; fileName: string; mimeType: string }[];
  savedAt: string;
}

export interface DraftPhoto {
  id: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
}

/**
 * Autosaves the New Report form for the signed-in Reporter so it survives the app closing. Each photo is written
 * once when added (original bytes), not on every keystroke. Writes run one at a time, and the saved record only
 * changes after its write succeeded, so it never lists a photo that isn't stored. `seal()` stops all autosaving
 * (including writes already queued) before the draft becomes a saved report, so nothing can recreate it.
 * Best effort: a failed autosave never blocks the form; Submit does its own checked save.
 */
@Injectable({ providedIn: 'root' })
export class ReportDraftStore {
  private readonly db = inject(LocalDbService);
  private readonly session = inject(SessionStore);
  private record: DraftRecord = emptyRecord();
  private queue: Promise<unknown> = Promise.resolve();
  private sealed = false;

  constructor() {
    this.session.registerReset(() => this.reset());
  }

  /** Allows autosaving again (a New Report page opened, or a Submit failed and the form stays). */
  open(): void {
    this.sealed = false;
  }

  async load(): Promise<{ record: DraftRecord; photos: DraftPhoto[] } | null> {
    const userId = this.session.user()?.id;
    if (!userId) return null;
    await this.queue;
    try {
      const record = await this.db.get<DraftRecord>(userId, RECORD_KEY);
      if (!record) return null;
      const photos: DraftPhoto[] = [];
      for (const meta of record.photos) {
        const bytes = await this.db.get<ArrayBuffer>(userId, photoKey(meta.id));
        if (bytes) photos.push({ ...meta, blob: new Blob([bytes], { type: meta.mimeType }) });
      }
      this.record = { ...record, photos: record.photos.filter((meta) => photos.some((photo) => photo.id === meta.id)) };
      return { record: this.record, photos };
    } catch {
      return null;
    }
  }

  saveForm(form: Record<string, string>, gps: DraftRecord['gps']): Promise<void> {
    return this.write(async () => ({ next: { ...this.record, form, gps, savedAt: new Date().toISOString() }, extra: [] }));
  }

  addPhoto(photo: DraftPhoto): Promise<void> {
    return this.write(async () => ({
      next: { ...this.record, photos: [...this.record.photos, meta(photo)], savedAt: new Date().toISOString() },
      extra: [{ key: photoKey(photo.id), value: await photo.blob.arrayBuffer() }],
    }));
  }

  removePhoto(id: string): Promise<void> {
    return this.write(async () => ({
      next: { ...this.record, photos: this.record.photos.filter((photo) => photo.id !== id) },
      extra: [],
      deleteKeys: [photoKey(id)],
    }));
  }

  /**
   * Stops autosaving, waits for writes already running, and returns the keys to delete in the same transaction
   * that saves the report. Writes queued but not started are dropped.
   */
  async seal(): Promise<string[]> {
    this.sealed = true;
    await this.queue;
    const userId = this.session.user()?.id;
    return userId ? this.db.keys(userId, DRAFT_PREFIX) : [];
  }

  async clear(): Promise<void> {
    this.sealed = true;
    await this.queue;
    this.record = emptyRecord();
    const userId = this.session.user()?.id;
    if (userId) await this.db.delete(userId, await this.db.keys(userId, DRAFT_PREFIX)).catch(() => undefined);
  }

  /** Forget the in-memory copy (the saved draft stays on disk). */
  reset(): void {
    this.record = emptyRecord();
  }

  private write(
    build: () => Promise<{ next: DraftRecord; extra: { key: string; value: unknown }[]; deleteKeys?: string[] }>,
  ): Promise<void> {
    const userId = this.session.user()?.id;
    if (!userId || this.sealed) return Promise.resolve();
    const task = this.queue.then(async () => {
      if (this.sealed || this.session.user()?.id !== userId) return;
      const { next, extra, deleteKeys = [] } = await build();
      await this.db.putAll(userId, [...extra, { key: RECORD_KEY, value: next }], deleteKeys);
      this.record = next;
    });
    const settled = task.catch(() => undefined);
    this.queue = settled;
    return settled;
  }
}

/**
 * The draft entries for a saved report going back to editing (fields, GPS and the original photo bytes).
 * A selected facility location is not restored: the Reporter picks the location again (it may be why SEEFIX
 * rejected the report); the text location is kept.
 */
export function draftEntriesFor(
  item: Pick<OutboxItem, 'id' | 'fields' | 'photos'>,
  photos: { bytes: ArrayBuffer }[],
): { key: string; value: unknown }[] {
  const ids = item.photos.map((_, index) => `${item.id}-${index}`);
  const record: DraftRecord = {
    form: {
      description: item.fields.description,
      buildingId: item.fields.building ? OTHER_LOCATION : '',
      notes: item.fields.notes ?? '',
      building: item.fields.building ?? '',
      floor: item.fields.floor ?? '',
      roomOrArea: item.fields.roomOrArea ?? '',
    },
    gps: item.fields.gpsLat != null && item.fields.gpsLng != null ? { lat: item.fields.gpsLat, lng: item.fields.gpsLng, accuracy: null } : null,
    photos: item.photos.map((photo, index) => ({ id: ids[index], fileName: photo.fileName, mimeType: photo.mimeType })),
    savedAt: new Date().toISOString(),
  };
  return [{ key: RECORD_KEY, value: record }, ...photos.map((photo, index) => ({ key: photoKey(ids[index]), value: photo.bytes }))];
}

function emptyRecord(): DraftRecord {
  return { form: {}, gps: null, photos: [], savedAt: new Date().toISOString() };
}

function meta(photo: DraftPhoto): DraftRecord['photos'][number] {
  return { id: photo.id, fileName: photo.fileName, mimeType: photo.mimeType };
}
