import { TestBed } from '@angular/core/testing';
import { SessionStore } from '../../../core/auth/session.store';
import { LocalDbService } from '../../../core/storage/local-db.service';
import { REPORTER_USER } from '../../../testing/test-helpers';
import { ReportDraftStore } from './report-draft.store';

describe('ReportDraftStore (autosave of the New Report form)', () => {
  function launch(user = REPORTER_USER): ReportDraftStore {
    TestBed.resetTestingModule();
    TestBed.inject(SessionStore).setAuthenticated(user, 't');
    return TestBed.inject(ReportDraftStore);
  }

  it('an unfinished report and its photos come back after the app was closed', async () => {
    const draft = launch();
    await draft.addPhoto({ id: 'p1', blob: new Blob(['first'], { type: 'image/jpeg' }), fileName: 'a.jpg', mimeType: 'image/jpeg' });
    await draft.addPhoto({ id: 'p2', blob: new Blob(['second'], { type: 'image/png' }), fileName: 'b.png', mimeType: 'image/png' });
    await draft.removePhoto('p1');
    await draft.saveForm({ description: 'Broken window' }, { lat: 14.5, lng: 121, accuracy: 10 });

    const restored = await launch().load();
    expect(restored?.record.form).toEqual({ description: 'Broken window' });
    expect(restored?.record.gps).toEqual({ lat: 14.5, lng: 121, accuracy: 10 });
    expect(restored?.photos.map((photo) => photo.id)).toEqual(['p2']);
    expect(await restored?.photos[0].blob.text()).toBe('second');
  });

  it('is per Reporter, and Discard removes it', async () => {
    const draft = launch();
    await draft.saveForm({ description: 'Mine' }, null);
    expect(await launch({ ...REPORTER_USER, id: '33333333-3333-4333-8333-333333333333' }).load()).toBeNull();

    const again = launch();
    await again.clear();
    expect(await again.load()).toBeNull();
  });

  it('autosaves still queued when Submit seals the draft can never recreate it', async () => {
    const draft = launch();
    draft.open();
    void draft.saveForm({ description: 'typed before Submit' }, null);
    void draft.addPhoto({ id: 'p1', blob: new Blob(['bytes'], { type: 'image/jpeg' }), fileName: 'a.jpg', mimeType: 'image/jpeg' });
    const keys = await draft.seal(); // what Submit deletes together with saving the report
    await TestBed.inject(LocalDbService).delete(REPORTER_USER.id, keys);
    void draft.saveForm({ description: 'a late debounce' }, null);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(await draft.load()).toBeNull();
    expect(await TestBed.inject(LocalDbService).keys(REPORTER_USER.id, 'draft/')).toEqual([]);
  });

  it('the saved record never lists a photo whose bytes failed to save', async () => {
    const draft = launch();
    draft.open();
    const local = TestBed.inject(LocalDbService);
    const real = local.putAll.bind(local);
    local.putAll = () => Promise.reject(new Error('write failed'));
    await draft.addPhoto({ id: 'lost', blob: new Blob(['x'], { type: 'image/jpeg' }), fileName: 'a.jpg', mimeType: 'image/jpeg' });
    local.putAll = real;
    await draft.saveForm({ description: 'next' }, null);

    const restored = await launch().load();
    expect(restored?.record.photos).toEqual([]);
  });
});
