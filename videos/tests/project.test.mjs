import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { baseline, detectionInput, DRAWING_LAYER, hash, importDraft, resetProject, setupKey, setupProject, verifyAsset } from '../scripts/project.mjs';

const config = { baseUrl: 'http://localhost:3030', projectName: 'Tool demos', timeoutMs: 30,
  calibration: { scale: 0.0001, offset: 0 }, labels: [{ id: 1, labelName: 'Forest', color: '#44aa44' }] };
const scene = { sha256: 'sample', file: 'demo-scene.tif', bytes: 20, width: 510, height: 510,
  bands: [{ index: 1, name: 'B2' }, { index: 2, name: 'B3' }, { index: 3, name: 'B4' }] };
const report = { hard_errors: [], scenes: [{ id: 'demo-scene.tif', metadata_suggestion: {
  sensor: 'sentinel-2', product_level: null,
  bands: scene.bands.map(b => ({ file_path: 'demo-scene.tif', file_name: 'demo-scene.tif', channel_index: b.index,
    suggested_name: b.name, roles: ['blue', 'green', 'red'].slice(b.index - 1, b.index), measurement_type: 'unknown' })),
} }] };
const binding = () => ({ schemaVersion: 1, origin: config.baseUrl, sid: 'ours', setupKey: setupKey(config, scene),
  stage: 'ready', sceneId: 'prepared-scene', import: importDraft(report, scene, config) });

function server({ projects = [], uploaded = false, finished = false, running = false, failed = false } = {}) {
  const calls = [];
  const api = async (method, path, options = {}) => {
    calls.push({ method, path, options });
    const route = path.split('?')[0];
    if (route === '/session/list') return { sessions: projects };
    if (route === '/imports/detect') return structuredClone(report);
    if (route === '/session/new') { projects.push({ sid: 'ours', name: config.projectName }); return { sid: 'ours' }; }
    if (route === '/session/switch') return { sid: 'ours', manifest_revision: 7, manifest: baseline(config, scene) };
    if (route === '/session/preparation-admission') return { status: 'active' };
    if (route === '/session/manifest' || route === '/session/metadata-repair') return { ok: true };
    if (route === '/session/bands') { uploaded = true; return { ok: true }; }
    if (route === '/session/metadata-repair/process') {
      assert.ok(uploaded, 'Preparation must follow upload'); finished = !failed; return { ok: true };
    }
    if (route === '/session/compute-progress') return { finished, running, failed };
    if (route === '/session/scenes') return { scenes: [{ id: 'prepared-scene', ready: true, band_count: 3 }] };
    if (route.startsWith('/session/labeltiles/') && method === 'GET') return { tiles: [{ x: 0, y: 1 }, { x: 1, y: 1 }] };
    if (route.startsWith('/session/labeltiles/') && method === 'DELETE') return { ok: true };
    if (route.startsWith('/session/layers/') && method === 'DELETE') return { ok: true };
    throw new Error(`Unexpected API call ${method} ${path}`);
  };
  return { api, calls };
}
const args = fixture => ({ api: fixture.api, config, scene, bytes: Buffer.from('asset'), state: null,
  save: async () => {}, log: () => {}, wait: async () => {} });

test('creates once, records its identity before upload, prepares even if initial progress says finished', async () => {
  const fixture = server({ finished: true });
  const saved = [];
  const state = await setupProject({ ...args(fixture), save: async value => saved.push(structuredClone(value)) });
  assert.equal(state.sceneId, 'prepared-scene');
  assert.deepEqual(saved.map(s => s.stage), ['created', 'uploaded', 'processing', 'ready']);
  assert.equal(fixture.calls.filter(c => c.path === '/session/new').length, 1);
  assert.equal(fixture.calls.filter(c => c.path === '/session/metadata-repair/process').length, 1);
  assert.equal(saved[0].sid, 'ours');
});

test('reuses ready project without upload, preparation, or mutation of server state', async () => {
  const fixture = server({ projects: [{ sid: 'ours', name: config.projectName }], finished: true });
  await setupProject({ ...args(fixture), state: binding() });
  assert.ok(fixture.calls.every(call => call.method === 'GET'));
});

test('does not adopt another same-named project', async () => {
  const fixture = server({ projects: [{ sid: 'someone-else', name: config.projectName }] });
  await assert.rejects(setupProject(args(fixture)), /not managed/);
  assert.equal(fixture.calls.length, 1);
});

test('refuses changed asset/configuration, missing project, and renamed project before writes', async () => {
  for (const change of ['asset', 'missing', 'renamed']) {
    const fixture = server({ projects: change === 'missing' ? [] : [{ sid: 'ours', name: change === 'renamed' ? 'Personal work' : config.projectName }] });
    const state = binding();
    if (change === 'asset') state.setupKey = 'different';
    await assert.rejects(resetProject({ ...args(fixture), state }));
    assert.ok(fixture.calls.every(call => call.method === 'GET'));
  }
});

test('resumes after upload without creating a project or uploading again', async () => {
  const fixture = server({ projects: [{ sid: 'ours', name: config.projectName }], uploaded: true });
  const state = { ...binding(), stage: 'uploaded' };
  await setupProject({ ...args(fixture), state });
  assert.ok(!fixture.calls.some(c => c.path === '/session/new' || c.path.startsWith('/session/bands')));
  assert.ok(fixture.calls.some(c => c.path === '/session/metadata-repair/process'));
});

test('server failure never marks the project ready', async () => {
  const fixture = server({ projects: [{ sid: 'ours', name: config.projectName }], running: true, failed: true });
  const saved = [];
  await assert.rejects(setupProject({ ...args(fixture), state: { ...binding(), stage: 'processing' },
    save: async state => saved.push(state.stage) }), /Server preparation failed/);
  assert.ok(!saved.includes('ready'));
});

test('reset deletes only reserved-layer tiles after switching to the saved project, with revision-checked manifest', async () => {
  const fixture = server({ projects: [{ sid: 'ours', name: config.projectName }] });
  await resetProject({ ...args(fixture), state: binding() });
  const mutations = fixture.calls.filter(c => c.method !== 'GET');
  assert.equal(mutations[0].path, '/session/switch');
  assert.deepEqual(mutations[0].options.data, { sid: 'ours' });
  for (const call of mutations.filter(c => c.method === 'DELETE')) {
    assert.ok(call.path.startsWith(`/session/labeltiles/prepared-scene/${encodeURIComponent(DRAWING_LAYER)}/`)
      || call.path === `/session/layers/${encodeURIComponent(`prepared-scene__${DRAWING_LAYER}`)}`);
  }
  assert.ok(mutations.some(c => c.path === `/session/layers/${encodeURIComponent(`prepared-scene__${DRAWING_LAYER}`)}`));
  const write = mutations.at(-1);
  assert.match(write.path, /sid=ours&base_revision=7/);
  assert.equal(write.options.data.editor.selectedDrawingLayer, DRAWING_LAYER);
});

test('calibration is explicit, roles/channel identity preserved, processing level not invented', () => {
  const { draft } = importDraft(report, scene, config);
  assert.equal(draft.product_level, null);
  assert.deepEqual(draft.bands.map(b => b.scale), [0.0001, 0.0001, 0.0001]);
  assert.deepEqual(draft.bands.map(b => b.offset), [0, 0, 0]);
  assert.equal(detectionInput(scene).files[0].rasterInfo.samples[1].description, 'B3');
  const duplicate = structuredClone(report);
  duplicate.scenes[0].metadata_suggestion.bands[1].channel_index = 1;
  assert.throws(() => importDraft(duplicate, scene, config), /unique channel/);
});

test('bundled asset matches its manifest and tampering is rejected', async () => {
  const manifest = JSON.parse(await readFile(new URL('../assets/demo-scene.json', import.meta.url), 'utf8'));
  const asset = new URL('../assets/demo-scene.tif', import.meta.url);
  assert.equal(hash(await verifyAsset(manifest, asset)), manifest.sha256);
  await assert.rejects(verifyAsset({ ...manifest, sha256: 'wrong' }, asset), /does not match/);
});
