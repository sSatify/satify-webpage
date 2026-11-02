import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupSeries } from '../scripts/showcase-v2.mjs';

function fixture({ stalled = false } = {}) {
  const state = { sid: 'managed', sceneIds: ['date0', 'date1', 'date2'] };
  const undoStates = [[0, 0, 0], [2, 3, 4], [5, 6, 6]];
  let saved = [9, 8, 7], clicks = 0;
  const page = {
    getByRole: () => ({ async click() {
      clicks++;
      if (!stalled) saved = [...undoStates.at(-1)];
    } }),
    async evaluate(_callback, { base64 }) {
      return saved[Number(Buffer.from(base64, 'base64').toString())];
    },
  };
  const api = async (_method, path) => path.includes('.png')
    ? Buffer.from(path.match(/date(\d)/)[1]) : { tiles: [{ x: 0, y: 0 }] };
  return {
    demo: { page, async hold() {} },
    context: { state, runtime: { api }, applied: true, undoStates },
    get clicks() { return clicks; },
    get saved() { return saved; },
  };
}

test('multi-class cleanup undoes only its three operations and verifies every date', async () => {
  const f = fixture();
  await cleanupSeries(f.demo, f.context);
  assert.equal(f.clicks, 3);
  assert.deepEqual(f.saved, [0, 0, 0]);
  assert.equal(f.context.applied, false);
  await cleanupSeries(f.demo, f.context);
  assert.equal(f.clicks, 3, 'Repeated cleanup must not undo unrelated history');
});

test('a failed restoration cannot trigger a second Undo on cleanup retry', async () => {
  const f = fixture({ stalled: true });
  await assert.rejects(cleanupSeries(f.demo, f.context), /could not be fully undone/);
  await assert.rejects(cleanupSeries(f.demo, f.context), /could not be fully undone/);
  assert.equal(f.clicks, 1);
  assert.equal(f.context.applied, true);
  assert.equal(f.context.undoStates.length, 3);
});
