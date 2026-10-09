import { InjectionToken } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../../environments/environment';

export interface AppEnvironment {
  production: boolean;
  /** Origin of seefix-api without a trailing slash; empty means same origin. */
  apiBaseUrl: string;
  requestTimeoutMs: number;
  uploadTimeoutMs: number;
  agentPollIntervalMs: number;
  maxReportImages: number;
  maxUploadBytes: number;
  maxUploadMb: number;
  appVersion: string;
}

function resolveApiBaseUrl(): string {
  const url = Capacitor.isNativePlatform() ? environment.nativeApiBaseUrl : environment.apiBaseUrl;
  return url.replace(/\/+$/, '');
}

export const APP_ENVIRONMENT = new InjectionToken<AppEnvironment>('APP_ENVIRONMENT', {
  providedIn: 'root',
  factory: () => ({
    production: environment.production,
    apiBaseUrl: resolveApiBaseUrl(),
    requestTimeoutMs: environment.requestTimeoutMs,
    uploadTimeoutMs: environment.uploadTimeoutMs,
    agentPollIntervalMs: environment.agentPollIntervalMs,
    maxReportImages: environment.maxReportImages,
    maxUploadMb: environment.maxUploadMb,
    maxUploadBytes: environment.maxUploadMb * 1024 * 1024,
    appVersion: environment.appVersion,
  }),
});
