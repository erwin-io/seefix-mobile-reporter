import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../../testing/test-helpers';
import { ReferenceApiService } from './reference.api.service';

/** seefix-api#22: /api/reference/* is response-cached server side (X-Cache, X-Data-Versions); the body is unchanged. */
describe('ReferenceApiService with cached responses', () => {
  let http: HttpTestingController;
  let service: ReferenceApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(ReferenceApiService);
  });

  afterEach(() => http.verify());

  it.each(['HIT', 'MISS', 'BYPASS'])('reads { items } the same for X-Cache: %s', async (cache) => {
    const result = firstValueFrom(service.buildings());
    http
      .expectOne(apiUrl('/api/reference/buildings'))
      .flush({ items: [{ id: 'b1', name: 'Main' }] }, { headers: { 'X-Cache': cache, 'X-Data-Versions': 'reference=7' } });
    await expect(result).resolves.toEqual([{ id: 'b1', name: 'Main' }]);
  });

  it('sends only buildingId on locations (no paging params that would change the legacy shape)', async () => {
    const result = firstValueFrom(service.locations('b1'));
    const req = http.expectOne((r) => r.url === apiUrl('/api/reference/locations'));
    expect(req.request.params.keys()).toEqual(['buildingId']);
    req.flush({ items: [] }, { headers: { 'X-Cache': 'HIT' } });
    await expect(result).resolves.toEqual([]);
  });
});
