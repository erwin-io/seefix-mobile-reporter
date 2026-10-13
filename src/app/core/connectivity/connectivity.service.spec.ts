import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';
import { apiUrl, flushAsync } from '../../testing/test-helpers';
import { AppResumeService } from '../lifecycle/app-resume.service';
import { connectivityInterceptor } from './connectivity.interceptor';
import { ConnectivityService, PROBE_BACKOFF_MS, SLOW_REQUEST_MS } from './connectivity.service';

describe('ConnectivityService', () => {
  let service: ConnectivityService;
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let lifecycle: AppResumeService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([connectivityInterceptor])), provideHttpClientTesting()],
    });
    service = TestBed.inject(ConnectivityService);
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    lifecycle = TestBed.inject(AppResumeService);
  });

  afterEach(() => {
    vi.useRealTimers();
    httpMock.verify();
  });

  const setOnline = (online: boolean) => (lifecycle as unknown as { _online: { set(v: boolean): void } })._online.set(online);
  const health = (database: boolean) => ({ status: 'degraded', components: { database: { reachable: database } } });

  /** An API request that fails without a response (or with `status`). */
  async function failApiRequest(status = 0): Promise<void> {
    const request = firstValueFrom(http.get(apiUrl('/api/reports/my'))).catch(() => undefined);
    const req = httpMock.expectOne(apiUrl('/api/reports/my'));
    if (status === 0) req.error(new ProgressEvent('error'), { status: 0 });
    else req.flush({}, { status, statusText: 'x' });
    await request;
  }

  it('is offline whenever the device has no network', () => {
    setOnline(false);
    expect(service.state()).toBe('offline');
  });

  it('an unanswered API request while online is confirmed with /health before showing "server down"', async () => {
    expect(service.state()).toBe('online');
    await failApiRequest(0);
    expect(service.state()).toBe('online'); // not yet: waiting for /health

    httpMock.expectOne(apiUrl('/health')).error(new ProgressEvent('error'), { status: 0 });
    await flushAsync();
    expect(service.state()).toBe('server-down');
  });

  it('a 503 from /health that still reports the database reachable is NOT server down (the AI Agent is down)', async () => {
    await failApiRequest(502);
    httpMock.expectOne(apiUrl('/health')).flush(health(true), { status: 503, statusText: 'Service Unavailable' });
    await flushAsync();
    expect(service.state()).toBe('online');
  });

  it('a 4xx means the server answered: never "server down", no /health call', async () => {
    await failApiRequest(409);
    httpMock.expectNone(apiUrl('/health'));
    expect(service.state()).toBe('online');
  });

  it('while down, /health is re-checked with backoff and the state clears when it recovers', async () => {
    vi.useFakeTimers();
    const first = service.probe();
    httpMock.expectOne(apiUrl('/health')).flush(health(false), { status: 503, statusText: 'x' });
    await first;
    expect(service.state()).toBe('server-down');

    await vi.advanceTimersByTimeAsync(PROBE_BACKOFF_MS[0] - 1);
    httpMock.expectNone(apiUrl('/health'));
    await vi.advanceTimersByTimeAsync(1);
    httpMock.expectOne(apiUrl('/health')).flush(health(true));
    await vi.advanceTimersByTimeAsync(0);
    expect(service.state()).toBe('online');

    await vi.advanceTimersByTimeAsync(PROBE_BACKOFF_MS.at(-1)! * 2);
    httpMock.expectNone(apiUrl('/health')); // no polling once healthy
  });

  it('any successful API response clears "server down"', async () => {
    await failApiRequest(0);
    httpMock.expectOne(apiUrl('/health')).error(new ProgressEvent('error'), { status: 0 });
    await flushAsync();
    expect(service.state()).toBe('server-down');

    service.apiSucceeded(200);
    expect(service.state()).toBe('online');
  });

  it('a response slower than the threshold shows "slow" until a fast one arrives', () => {
    service.apiSucceeded(SLOW_REQUEST_MS + 1);
    expect(service.state()).toBe('slow');
    service.apiSucceeded(300);
    expect(service.state()).toBe('online');
  });

  it('requests to other hosts (e.g. Cloudinary) are not counted', async () => {
    const request = firstValueFrom(http.get('https://api.cloudinary.com/x')).catch(() => undefined);
    httpMock.expectOne('https://api.cloudinary.com/x').error(new ProgressEvent('error'), { status: 0 });
    await request;
    httpMock.expectNone(apiUrl('/health'));
    expect(service.state()).toBe('online');
  });
});
