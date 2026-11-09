import test from 'node:test';
import assert from 'node:assert/strict';
import { showcaseConfiguration } from '../scripts/showcase-v2.mjs';

test('website showcase defaults to production and keeps development state separate', async () => {
  for (const name of ['smart-fill', 'rivers-roads', 'time-series', 'change-detection', 'propagate']) {
    const prod = await showcaseConfiguration(name);
    const dev = await showcaseConfiguration(name, { env: 'dev' });
    assert.equal(prod.baseUrl, 'https://app.satify.tech');
    assert.equal(dev.baseUrl, 'https://app-dev.satify.tech');
    assert.notEqual(prod.authFile, dev.authFile);
    assert.notEqual(prod.stateFile, dev.stateFile);
  }
  await assert.rejects(showcaseConfiguration('unknown'), /Unknown showcase/);
});
