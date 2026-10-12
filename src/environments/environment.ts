// Development environment. Public URLs only — never credentials or API keys.
// `npm start` calls a local seefix-api directly: add this app's origin (http://localhost:4200) to the API's
// CORS_ORIGINS. Native builds (Android) use environment.prod.ts.

export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000',
  requestTimeoutMs: 20000,
  uploadTimeoutMs: 120000,
  agentPollIntervalMs: 12000,
  maxReportImages: 5,
  // Per-photo limit, checked before upload. seefix-api enforces the same 10 MB for report images.
  maxUploadMb: 10,
  appVersion: '0.1.0',
};
