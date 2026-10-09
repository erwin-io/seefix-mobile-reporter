import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Public Capacitor configuration. Never put secrets here.
 *
 * Local HTTP (cleartext / mixed content) is only enabled when the native
 * project is synced with SEEFIX_LOCAL_HTTP=true (see `npm run cap:sync:local`),
 * so release builds keep Android's default transport protections.
 *
 * App ID and display name must be confirmed by the product owner before distribution.
 */
const localHttp = process.env['SEEFIX_LOCAL_HTTP'] === 'true';

const config: CapacitorConfig = {
  appId: 'com.seefix.reporter',
  appName: 'SEEFIX Reporter',
  webDir: 'www',
  server: localHttp ? { cleartext: true } : undefined,
  android: {
    allowMixedContent: localHttp,
  },
};

export default config;
