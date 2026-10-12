import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Public Capacitor configuration. Never put secrets here.
 * The app calls the HTTPS API from environment.prod.ts, so Android's default transport protections stay on.
 *
 * App ID and display name must be confirmed by the product owner before distribution.
 */
const config: CapacitorConfig = {
  appId: 'com.seefix.reporter',
  appName: 'SEEFIX Reporter',
  webDir: 'www',
};

export default config;
