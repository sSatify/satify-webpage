import test from 'node:test';
import assert from 'node:assert/strict';
import { runSmart } from '../scripts/showcase-v2.mjs';

function fixture(counts) {
  let saved = 0;
  const actions = [];
  const page = {
    getByRole: (_role, options) => ({ async press(key) {
      assert.equal(options.name, 'Undo'); assert.equal(key, 'Enter'); saved = 0; actions.push('undo');
    } }),
    async evaluate() { return saved; },
    async screenshot() {},
  };
  const demo = { page, frame: { clip: { x: 80, y: 69, width: 1280, height: 960 } },
    async caption() {}, async move() {}, async hold() {}, async park() {}, async click() {},
    async point(x, y) { return { x, y }; },
    async fill(_x, _y, mode) { assert.equal(saved, 0, 'Each scope starts without labels'); saved = counts[mode]; actions.push(mode); },
    async zoomAt(factor) { actions.push(factor); return {}; }, async viewportOutline() {},
  };
  const context = { state: { sid: 'managed', sceneId: 'scene' }, directory: '.', async writesFinished() {},
    runtime: { api: async (_method, path) => path.includes('.png') ? Buffer.from('fixture') : { tiles: [{ x: 0, y: 0 }] } } };
  return { demo, context, actions };
}

test('Smart Fill compares all three scopes, resets between them, and reveals the viewport boundary', async () => {
  const f = fixture({ Local: 10, 'In viewport': 30, Global: 60 });
  await runSmart(f.demo, f.context);
  assert.deepEqual(f.actions, ['Local', 'undo', 'In viewport', .5, 'undo', 2, 'Global', .5]);
  assert.deepEqual(f.context.verifiedModes, { Local: 10, 'In viewport': 30, Global: 60 });
});

test('Smart Fill rejects a recording whose Global step does not extend past Viewport', async () => {
  const f = fixture({ Local: 10, 'In viewport': 30, Global: 30 });
  await assert.rejects(runSmart(f.demo, f.context), /different saved extents/);
});
