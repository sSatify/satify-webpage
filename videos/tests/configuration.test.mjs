import test from 'node:test';
import assert from 'node:assert/strict';
import { configuration } from '../scripts/runtime.mjs';

test('defaults to production and isolates dev login and project state for both datasets', async () => {
  for (const dataset of ['tools', 'time-series']) {
    const defaults = await configuration({ dataset });
    const prod = await configuration({ dataset, env: 'prod' });
    const dev = await configuration({ dataset, env: 'dev' });
    assert.equal(prod.baseUrl, 'https://app.satify.tech');
    assert.deepEqual(defaults, prod);
    assert.equal(dev.baseUrl, 'https://app-dev.satify.tech');
    assert.notEqual(prod.authFile, dev.authFile);
    assert.notEqual(prod.stateFile, dev.stateFile);
    assert.equal(prod.projectName, dev.projectName);
    assert.deepEqual(prod.scenes || [prod.scene], dev.scenes || [dev.scene]);
  }
  const tools = await configuration({ env: 'dev' });
  const series = await configuration({ env: 'dev', dataset: 'time-series' });
  assert.equal(tools.authFile, series.authFile);
  assert.notEqual(tools.stateFile, series.stateFile);
});

test('preserves explicit URL overrides and reuses existing state for the same origin', async () => {
  const dev = await configuration({ env: 'dev' });
  const explicit = await configuration({ url: 'https://app-dev.satify.tech/' });
  assert.deepEqual(explicit, dev);
  const custom = await configuration({ url: 'http://localhost:3030' });
  assert.equal(custom.baseUrl, 'http://localhost:3030');
  assert.notEqual(custom.authFile, dev.authFile);
});

test('rejects unknown environments and ambiguous env plus URL before running setup', async () => {
  for (const env of ['staging', '', 'toString']) {
    await assert.rejects(configuration({ env }), /Unknown environment/);
  }
  for (const env of ['prod', 'dev']) {
    await assert.rejects(configuration({ env, url: 'https://app.satify.tech' }), /either --env or --url/);
  }
});
