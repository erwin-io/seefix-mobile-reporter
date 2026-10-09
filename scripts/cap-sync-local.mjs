// Syncs the Android project with local-development HTTP enabled.
// Use only for emulator / LAN device testing against a local seefix-api.
import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['cap', 'sync', 'android'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, SEEFIX_LOCAL_HTTP: 'true' },
});
process.exit(result.status ?? 1);
