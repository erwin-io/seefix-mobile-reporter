import { OutboxItem } from '../../features/reports/outbox/report-outbox.store';

/** A report saved on the phone and waiting to be sent. */
export function waitingItem(overrides: Partial<OutboxItem> = {}): OutboxItem {
  return {
    id: '7d9f2c1e-0b5a-4c3d-9e8f-123456789abc',
    capturedAt: '2026-10-14T01:00:00.000Z',
    fields: {
      description: 'Water leak near the stairs',
      notes: null,
      locationId: null,
      building: 'Old Building',
      floor: null,
      roomOrArea: null,
      gpsLat: null,
      gpsLng: null,
    },
    photos: [{ fileName: 'a.jpg', mimeType: 'image/jpeg', size: 4, digest: 'a'.repeat(64), publicId: null }],
    state: 'waiting',
    reason: 'offline',
    message: null,
    activeReport: null,
    attempts: 0,
    reuploads: 0,
    nextAttemptAt: null,
    ...overrides,
  };
}
