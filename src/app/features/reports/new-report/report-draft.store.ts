import { Injectable, inject } from '@angular/core';
import { SessionStore } from '../../../core/auth/session.store';
import { LocalDbService } from '../../../core/storage/local-db.service';

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
 * once when added (original bytes), not on every keystroke. Best effort: a failed autosave never blocks the form;
 * Submit does its own checked save.
 */
@Injectable({ providedIn: 'root' })
export class ReportDraftStore {
  private readonly db = inject(LocalDbService);
  private readonly session = inject(SessionStore);
  private record: DraftRecord = emptyRecord();

  constructor() {
    this.session.registerReset(() => this.reset());
  }

  async load(): Promise<{ record: DraftRecord; photos: DraftPhoto[] } | null> {
    const userId = this.session.user()?.id;
    if (!userId) return null;
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

  async saveForm(form: Record<string, string>, gps: DraftRecord['gps']): Promise<void> {
    this.record = { ...this.record, form, gps, savedAt: new Date().toISOString() };
    await this.write([]);
  }

  async addPhoto(photo: DraftPhoto): Promise<void> {
    this.record = { ...this.record, photos: [...this.record.photos, meta(photo)], savedAt: new Date().toISOString() };
    await this.write([{ key: photoKey(photo.id), value: await photo.blob.arrayBuffer() }]);
  }

  async removePhoto(id: string): Promise<void> {
    this.record = { ...this.record, photos: this.record.photos.filter((photo) => photo.id !== id) };
    await this.write([], [photoKey(id)]);
  }

  /** Keys to delete when the draft becomes a saved report (in the same transaction). */
  async keys(): Promise<string[]> {
    const userId = this.session.user()?.id;
    return userId ? this.db.keys(userId, DRAFT_PREFIX) : [];
  }

  async clear(): Promise<void> {
    this.record = emptyRecord();
    const userId = this.session.user()?.id;
    if (userId) await this.db.delete(userId, await this.db.keys(userId, DRAFT_PREFIX)).catch(() => undefined);
  }

  /** Forget the in-memory copy (the saved draft stays on disk). */
  reset(): void {
    this.record = emptyRecord();
  }

  private async write(extra: { key: string; value: unknown }[], deleteKeys: string[] = []): Promise<void> {
    const userId = this.session.user()?.id;
    if (!userId) return;
    await this.db.putAll(userId, [...extra, { key: RECORD_KEY, value: this.record }], deleteKeys).catch(() => undefined);
  }
}

function emptyRecord(): DraftRecord {
  return { form: {}, gps: null, photos: [], savedAt: new Date().toISOString() };
}

function meta(photo: DraftPhoto): DraftRecord['photos'][number] {
  return { id: photo.id, fileName: photo.fileName, mimeType: photo.mimeType };
}
