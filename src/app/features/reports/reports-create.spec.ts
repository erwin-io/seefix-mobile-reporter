import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { normalizeImage } from './new-report/photo-picker.service';
import { ReportsApiService } from './reports.api.service';

const UPLOAD_URL = 'https://api.cloudinary.com/v1_1/demo/image/upload';

describe('Report creation with direct uploads', () => {
  let api: ReportsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ReportsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('signs once, uploads each photo to Cloudinary in order, then posts only the public IDs', async () => {
    const created = firstValueFrom(
      api.create({
        images: [
          { blob: new Blob(['a'], { type: 'image/jpeg' }), fileName: 'a.jpg' },
          { blob: new Blob(['b'], { type: 'image/png' }), fileName: 'b.png' },
        ],
        description: '  Leaking pipe  ',
        locationId: 'loc-1',
        building: 'ignored when a location is chosen',
        gpsLat: 14.5,
        gpsLng: 121,
      }),
    );

    const sign = httpMock.expectOne('/api/uploads/sign');
    expect(sign.request.body).toEqual({ purpose: 'report-image' });
    sign.flush({ uploadUrl: UPLOAD_URL, fields: { timestamp: 1, signature: 'sig', api_key: 'k' } });

    for (const id of ['img-a', 'img-b']) {
      const upload = httpMock.expectOne(UPLOAD_URL);
      const form = upload.request.body as FormData;
      expect(form.get('signature')).toBe('sig');
      expect(form.get('file')).toBeInstanceOf(Blob);
      expect(upload.request.headers.has('Authorization')).toBe(false);
      upload.flush({ public_id: id });
    }

    const report = httpMock.expectOne('/api/reports');
    expect(report.request.body).toEqual({
      imagePublicIds: ['img-a', 'img-b'],
      description: 'Leaking pipe',
      notes: undefined,
      locationId: 'loc-1',
      building: undefined,
      floor: undefined,
      roomOrArea: undefined,
      gpsLat: 14.5,
      gpsLng: 121,
    });
    report.flush({ id: 'r1', reportNo: 'RPT-1' });
    expect((await created).reportNo).toBe('RPT-1');
  });

  it('does not create the report when an upload fails', async () => {
    const created = firstValueFrom(api.create({ images: [{ blob: new Blob(['a']), fileName: 'a.jpg' }], description: 'x' }));
    httpMock.expectOne('/api/uploads/sign').flush({ uploadUrl: UPLOAD_URL, fields: {} });
    httpMock.expectOne(UPLOAD_URL).flush({ error: { message: 'bad' } }, { status: 400, statusText: 'Bad Request' });
    await expect(created).rejects.toBeTruthy();
    httpMock.expectNone('/api/reports');
  });
});

describe('normalizeImage', () => {
  it('keeps accepted images byte-for-byte and rejects ones over the limit (no re-compression)', async () => {
    const photo = new Blob([new Uint8Array(100)], { type: 'image/jpeg' });
    expect(await normalizeImage(photo, 100)).toBe(photo);
    await expect(normalizeImage(photo, 99)).rejects.toThrow('Image is too large.');
  });
});
