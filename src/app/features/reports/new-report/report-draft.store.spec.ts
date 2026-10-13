import { TestBed } from '@angular/core/testing';
import { SessionStore } from '../../../core/auth/session.store';
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
});
