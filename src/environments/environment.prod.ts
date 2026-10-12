// Production environment. HTTPS public API origin only — never credentials.
// The Android app runs at https://localhost (Capacitor), so that origin must be in the API's CORS_ORIGINS.

export const environment = {
  production: true,
  apiBaseUrl: 'https://seefix-api.vercel.app',
  requestTimeoutMs: 20000,
  uploadTimeoutMs: 120000,
  agentPollIntervalMs: 12000,
  maxReportImages: 5,
  // Per-photo limit, checked before upload. seefix-api enforces the same 10 MB for report images.
  maxUploadMb: 10,
  appVersion: '0.1.0',
};
