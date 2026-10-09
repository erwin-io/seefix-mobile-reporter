// Production environment. HTTPS public API origin only — never credentials.
// The approved production API host must be supplied before release.

export const environment = {
  production: true,
  apiBaseUrl: 'https://REPLACE-WITH-APPROVED-API-HOST',
  nativeApiBaseUrl: 'https://REPLACE-WITH-APPROVED-API-HOST',
  requestTimeoutMs: 20000,
  uploadTimeoutMs: 120000,
  agentPollIntervalMs: 12000,
  maxReportImages: 5,
  maxUploadMb: 10,
  appVersion: '0.1.0',
};
