import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError, timeout } from 'rxjs';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { mapHttpError } from './api-error.mapper';

export interface ApiRequestOptions {
  params?: Record<string, string | number | boolean | null | undefined>;
  context?: HttpContext;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Single entry point to seefix-api. Applies the base URL, timeouts and
 * error normalization; feature services never touch HttpClient directly.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly env = inject(APP_ENVIRONMENT);

  url(path: string): string {
    return `${this.env.apiBaseUrl}${path}`;
  }

  get<T>(path: string, options: ApiRequestOptions = {}): Observable<T> {
    return this.http
      .get<T>(this.url(path), { params: toParams(options.params), context: options.context, headers: options.headers })
      .pipe(this.normalize<T>(options.timeoutMs ?? this.env.requestTimeoutMs));
  }

  post<T>(path: string, body: unknown, options: ApiRequestOptions = {}): Observable<T> {
    return this.http
      .post<T>(this.url(path), body ?? {}, {
        params: toParams(options.params),
        context: options.context,
        headers: options.headers,
      })
      .pipe(this.normalize<T>(options.timeoutMs ?? this.env.requestTimeoutMs));
  }

  patch<T>(path: string, body: unknown, options: ApiRequestOptions = {}): Observable<T> {
    return this.http
      .patch<T>(this.url(path), body ?? {}, { context: options.context, headers: options.headers })
      .pipe(this.normalize<T>(options.timeoutMs ?? this.env.requestTimeoutMs));
  }

  /** Multipart POST. The browser/WebView sets the multipart boundary header. */
  postForm<T>(path: string, form: FormData, options: ApiRequestOptions = {}): Observable<T> {
    return this.http
      .post<T>(this.url(path), form, { context: options.context })
      .pipe(this.normalize<T>(options.timeoutMs ?? this.env.uploadTimeoutMs));
  }

  private normalize<T>(ms: number) {
    return (source: Observable<T>) =>
      source.pipe(
        timeout(ms),
        catchError((error: unknown) => throwError(() => mapHttpError(error))),
      );
  }
}

function toParams(params: ApiRequestOptions['params']): HttpParams | undefined {
  if (!params) return undefined;
  let result = new HttpParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') result = result.set(key, String(value));
  }
  return result;
}
