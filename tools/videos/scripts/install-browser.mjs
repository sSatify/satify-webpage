import './browser.mjs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const cli = resolve(dirname(require.resolve('playwright/package.json')), 'cli.js');
const result = spawnSync(process.execPath, [cli, 'install', 'chromium'], {
  stdio: 'inherit', env: process.env, windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
