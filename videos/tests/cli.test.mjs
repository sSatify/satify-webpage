import test from 'node:test';
import assert from 'node:assert/strict';
import { runCommand } from '../scripts/cli.mjs';

test('default setup finishes tools before starting time-series and forwards the chosen environment', async () => {
  for (const options of [{}, { env: 'dev', headed: true }]) {
    const events = [], configs = [];
    await runCommand('setup', 'all', options, async (command, selected, values, config) => {
      assert.equal(command, 'setup');
      assert.deepEqual(values, options);
      configs.push(config);
      events.push(`start ${config.dataset}`);
      await new Promise(resolve => setTimeout(resolve, 10));
      events.push(`finish ${config.dataset}`);
    });
    assert.deepEqual(events, ['start tools', 'finish tools', 'start time-series', 'finish time-series']);
    assert.ok(configs.every(config => config.baseUrl === (options.env === 'dev'
      ? 'https://app-dev.satify.tech' : 'https://app.satify.tech')));
    assert.notEqual(configs[0].projectName, configs[1].projectName);
    assert.notEqual(configs[0].stateFile, configs[1].stateFile);
    assert.equal(configs[0].authFile, configs[1].authFile);
  }
});

test('explicit dataset prepares one project and recording and login keep their existing scope', async () => {
  for (const [command, options, expected] of [
    ['setup', { dataset: 'tools', project: 'Custom tools' }, 'tools'],
    ['setup', { dataset: 'time-series' }, 'time-series'],
    ['record', {}, 'tools'],
    ['login', { env: 'dev' }, 'tools'],
  ]) {
    const configs = [];
    await runCommand(command, 'all', options, async (_command, _selected, _values, config) => configs.push(config));
    assert.deepEqual(configs.map(config => config.dataset), [expected]);
    if (options.project) assert.equal(configs[0].projectName, options.project);
  }
});

test('setup stops after the first failure so it can be resumed with existing checkpoints', async () => {
  const started = [];
  await assert.rejects(runCommand('setup', 'all', {}, async (_command, _selected, _values, config) => {
    started.push(config.dataset);
    throw new Error('Setup failed');
  }), /Setup failed/);
  assert.deepEqual(started, ['tools']);
});

test('ambiguous project names and invalid options fail before any project runs', async () => {
  for (const options of [{ project: 'Same name' }, { env: 'staging' }, { dataset: 'unknown' }]) {
    let calls = 0;
    await assert.rejects(runCommand('setup', 'all', options, async () => { calls++; }),
      /Use --dataset|Unknown environment|Unknown dataset/);
    assert.equal(calls, 0);
  }
});
