// Development environment. Public URLs only — never credentials or API keys.
//
// - Browser (`npm start`): `apiBaseUrl` is empty so requests go to the same
//   origin and `proxy.conf.json` forwards `/api` to http://127.0.0.1:3000.
// - Android emulator: 10.0.2.2 reaches the host PC's loopback.
// - Physical device: replace `nativeApiBaseUrl` with the PC's LAN IP
//   (e.g. http://192.168.1.20:3000) and bind seefix-api to a reachable interface.

export const environment = {
  production: false,
  apiBaseUrl: '',
  nativeApiBaseUrl: 'http://10.0.2.2:3000',
  requestTimeoutMs: 20000,
  uploadTimeoutMs: 120000,
  agentPollIntervalMs: 12000,
  maxReportImages: 5,
  maxUploadMb: 10,
  appVersion: '0.1.0',
};
