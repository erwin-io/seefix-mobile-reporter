import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface AppEnvironment {
  production: boolean;
  /** Origin of seefix-api without a trailing slash. */
  apiBaseUrl: string;
  requestTimeoutMs: number;
  uploadTimeoutMs: number;
  agentPollIntervalMs: number;
  maxReportImages: number;
  maxUploadBytes: number;
  maxUploadMb: number;
  appVersion: string;
}

export const APP_ENVIRONMENT = new InjectionToken<AppEnvironment>('APP_ENVIRONMENT', {
  providedIn: 'root',
  factory: () => ({
    production: environment.production,
    apiBaseUrl: environment.apiBaseUrl.replace(/\/+$/, ''),
    requestTimeoutMs: environment.requestTimeoutMs,
    uploadTimeoutMs: environment.uploadTimeoutMs,
    agentPollIntervalMs: environment.agentPollIntervalMs,
    maxReportImages: environment.maxReportImages,
    maxUploadMb: environment.maxUploadMb,
    maxUploadBytes: environment.maxUploadMb * 1024 * 1024,
    appVersion: environment.appVersion,
  }),
});
