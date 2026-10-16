import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { SessionStore } from '../../core/auth/session.store';
import { AppResumeService } from '../../core/lifecycle/app-resume.service';
import { REPORTER_USER, apiUrl } from '../../testing/test-helpers';
import { ReferenceOfflineError, ReferenceStore } from './reference.store';

type Lifecycle = { _online: { set(v: boolean): void }; resumedSubject: Subject<void> };
const BUILDINGS = [{ id: 'b1', name: 'Old Building' }, { id: 'b2', name: 'Annex 1' }];
const settle = () => new Promise((r) => setTimeout(r, 20));

/** Buildings for the report form are fetched after sign-in and saved on the phone, so the form works offline. */
describe('ReferenceStore offline buildings', () => {
  function boot(online: boolean) {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    (TestBed.inject(AppResumeService) as unknown as Lifecycle)._online.set(online);
    const http = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(ReferenceStore);
    return { http, store, lifecycle: TestBed.inject(AppResumeService) as unknown as Lifecycle };
  }

  /** Waits (up to 2 s) for one matching request: the next request starts only after the phone save finishes. */
  async function next(http: HttpTestingController, match: (r: { url: string; params: { get(k: string): string | null } }) => boolean) {
    for (let i = 0; i < 200; i++) {
      const found = http.match((r) => match(r));
      if (found.length) return found[0];
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('request never sent');
  }

  const answer = async (http: HttpTestingController) => {
    (await next(http, (r) => r.url === apiUrl('/api/reference/buildings'))).flush({ items: BUILDINGS });
    for (const b of BUILDINGS) {
      (await next(http, (r) => r.url === apiUrl('/api/reference/locations') && r.params.get('buildingId') === b.id))
        .flush({ items: [{ id: `${b.id}-l1`, buildingId: b.id, name: 'Lobby' }] });
    }
    await settle();
  };

  it('fetches in the background right after sign-in, then the form opens offline from the phone (also after an app restart)', async () => {
    const { http } = boot(true);
    TestBed.inject(SessionStore).setAuthenticated(REPORTER_USER, 't');
    TestBed.tick();
    await answer(http);

    // "Restart" the app offline: empty memory, same phone storage.
    TestBed.resetTestingModule();
    const offline = boot(false);
    TestBed.inject(SessionStore).setAuthenticated(REPORTER_USER, 't');
    await expect(offline.store.loadBuildings()).resolves.toEqual(BUILDINGS);
    await expect(offline.store.loadLocations('b1')).resolves.toEqual([{ id: 'b1-l1', buildingId: 'b1', name: 'Lobby' }]);
    offline.http.expectNone(apiUrl('/api/reference/buildings')); // offline: no request, no 20 s wait
  });

  it('offline with nothing saved yet: fails at once so the form switches to free-text location', async () => {
    const { store, http } = boot(false);
    TestBed.inject(SessionStore).setAuthenticated(REPORTER_USER, 't');
    await expect(store.loadBuildings()).rejects.toBeInstanceOf(ReferenceOfflineError);
    http.expectNone(apiUrl('/api/reference/buildings'));
  });

  it('syncs again when the app is back online', async () => {
    const { http, lifecycle } = boot(false);
    TestBed.inject(SessionStore).setAuthenticated(REPORTER_USER, 't');
    TestBed.tick();
    await settle();
    http.expectNone(apiUrl('/api/reference/buildings')); // offline at sign-in: nothing sent
    lifecycle._online.set(true);
    lifecycle.resumedSubject.next(); // back online
    await answer(http);
    expect(TestBed.inject(ReferenceStore).buildings()).toEqual(BUILDINGS);
  });

  it('a signed-out app fetches nothing', async () => {
    const { http, lifecycle } = boot(true);
    TestBed.tick();
    lifecycle.resumedSubject.next();
    await settle();
    http.expectNone(apiUrl('/api/reference/buildings'));
  });
});
