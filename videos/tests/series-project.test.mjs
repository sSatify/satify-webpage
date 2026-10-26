import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { configuration } from '../scripts/runtime.mjs';
import { verifyAsset } from '../scripts/project.mjs';
import { setupSeriesProject, validateSeries } from '../scripts/series-project.mjs';

const config = { baseUrl: 'https://app.satify.tech', projectName: 'Time-series test', timeoutMs: 20,
  calibration: { scale: 0.0001, offset: 0 }, labels: [{ id: 1, labelName: 'Vegetation', color: '#44aa44' }] };
const assets = ['2021-09-01', '2022-08-15', '2022-09-04'].map(date => ({ bytes: Buffer.from(date), scene: {
  file: `coast-${date}.tif`, sha256: date, bytes: 10, displayName: `Coast ${date}`, acquisition_date: date,
  width: 10, height: 10, crs_wkt: 'EPSG:32632', geotransform: [0, 10, 0, 100, 0, -10],
  bands: ['B2', 'B3', 'B4'].map((name, i) => ({ index: i + 1, name })),
} }));

function fixture() {
  const calls = [], sessions = [], uploads = [];
  let finished = false;
  const scenes = assets.map(({ scene }, i) => ({ id: `prepared-${i}`, source_product_id: scene.file,
    ready: true, band_count: 3 }));
  const api = async (method, path, options = {}) => {
    calls.push({ method, path, options });
    switch (path.split('?')[0]) {
      case '/session/list': return { sessions };
      case '/imports/detect': return { hard_errors: [], scenes: assets.toReversed().map(({ scene }) => ({
        id: scene.file, metadata_suggestion: { sensor: 'sentinel-2', product_level: null,
          bands: scene.bands.map(b => ({ file_path: scene.file, channel_index: b.index, suggested_name: b.name,
            roles: [['blue'], ['green'], ['red']][b.index - 1] })) },
      })) };
      case '/session/new': sessions.push({ sid: 'ours', name: config.projectName }); return { sid: 'ours' };
      case '/session/switch': return { sid: 'ours', manifest_revision: 8 };
      case '/session/manifest':
      case '/session/metadata-repair': return { ok: true };
      case '/session/preparation-admission': return { status: 'active' };
      case '/session/bands': uploads.push(options.multipart.file.name); return { ok: true };
      case '/session/metadata-repair/process':
        assert.deepEqual(options.data.scene_ids, assets.map(a => a.scene.file));
        assert.equal(uploads.length, 3); finished = true; return { ok: true };
      case '/session/compute-progress': return { finished, running: false };
      case '/session/scenes': return { scenes: scenes.toReversed() };
      default: throw new Error(`Unexpected call: ${method} ${path}`);
    }
  };
  return { api, calls, sessions, uploads, scenes };
}
const run = (f, extra = {}) => setupSeriesProject({ api: f.api, config, assets, state: null,
  save: async () => {}, log: () => {}, wait: async () => {}, ...extra });

test('creates one project, uploads every date once and matches reordered prepared scenes by source identity', async () => {
  const f = fixture(), saved = [];
  const state = await run(f, { save: async value => saved.push(structuredClone(value)) });
  assert.deepEqual(state.sceneIds, ['prepared-0', 'prepared-1', 'prepared-2']);
  assert.equal(saved[0].sid, 'ours');
  assert.deepEqual(saved.filter(s => s.stage === 'created').map(s => s.uploadedFiles.length), [0, 1, 2, 3]);
  assert.equal(f.sessions.length, 1);
  assert.deepEqual(f.calls.filter(c => c.path === '/session/metadata-repair').map(c => c.options.data.draft.scene_name),
    assets.map(a => a.scene.displayName));
  assert.ok(!f.calls.some(c => c.method === 'DELETE'));
  f.calls.length = 0;
  await run(f, { state });
  assert.ok(f.calls.every(c => c.method === 'GET'), 'A ready project is reused without server writes');
});

test('resumes an interrupted second upload without creating again or reuploading the first date', async () => {
  const f = fixture();
  let state;
  const savedApi = f.api;
  await assert.rejects(run(f, { api: async (method, path, options) => {
    if (path.startsWith('/session/bands') && f.uploads.length === 1) throw new Error('Interrupted upload');
    return savedApi(method, path, options);
  }, save: async value => { state = structuredClone(value); } }), /Interrupted upload/);
  assert.equal(state.stage, 'created');
  assert.equal(state.uploadedFiles.length, 1);
  await run(f, { state });
  assert.deepEqual(f.uploads, assets.map(a => a.scene.file));
  assert.equal(f.sessions.length, 1);
});

test('rejects changed selection, foreign project, invalid saved upload state and same-name collisions before writes', async () => {
  const f = fixture();
  const state = await run(f);
  for (const invalid of [{ ...state, setupKey: 'different' }, { ...state, sid: 'foreign' },
    { ...state, uploadedFiles: [] }, { ...state, origin: 'https://other.example' }]) {
    f.calls.length = 0;
    await assert.rejects(run(f, { state: invalid }));
    assert.ok(f.calls.every(c => c.method === 'GET'));
  }
  f.calls.length = 0;
  await assert.rejects(run(f), /not managed/);
  assert.ok(f.calls.every(c => c.method === 'GET'));
});

test('rejects wrong prepared identities and incomplete preparation without marking ready', async () => {
  for (const change of ['source', 'band', 'ready', 'count']) {
    const f = fixture();
    if (change === 'source') f.scenes[0].source_product_id = 'another.tif';
    if (change === 'band') f.scenes[0].band_count = 2;
    if (change === 'ready') f.scenes[0].ready = false;
    if (change === 'count') f.scenes.pop();
    const stages = [];
    await assert.rejects(run(f, { save: async s => stages.push(s.stage) }));
    assert.ok(!stages.includes('ready'));
  }
});

test('detection mismatch fails before creation and failed preparation never marks the project ready', async () => {
  for (const failure of ['detection', 'preparation']) {
    const f = fixture(), stages = [];
    await assert.rejects(run(f, { api: async (method, path, options) => {
      const result = await f.api(method, path, options);
      if (failure === 'detection' && path === '/imports/detect') result.scenes[0].id = 'unexpected.tif';
      if (failure === 'preparation' && path.startsWith('/session/compute-progress')) {
        return { running: true, finished: false, failed: true };
      }
      return result;
    }, save: async state => stages.push(state.stage) }));
    assert.ok(!stages.includes('ready'));
    if (failure === 'detection') assert.equal(f.sessions.length, 0);
  }
});

test('rejects nonoverlapping images, repeated dates, bad dates and duplicate filenames before server access', async () => {
  for (const change of ['overlap', 'date', 'invalid-date', 'file']) {
    const selected = structuredClone(assets);
    if (change === 'overlap') selected[1].scene.geotransform[0] = 1000;
    if (change === 'date') selected[1].scene.acquisition_date = selected[0].scene.acquisition_date;
    if (change === 'invalid-date') selected[1].scene.acquisition_date = '2022-02-30';
    if (change === 'file') selected[1].scene.file = selected[0].scene.file;
    const f = fixture();
    await assert.rejects(run(f, { assets: selected }));
    assert.equal(f.calls.length, 0);
  }
});

test('time-series profile has separate project state, shared origin login and verified aligned dated cutouts', async () => {
  const tools = await configuration({});
  const series = await configuration({ dataset: 'time-series' });
  assert.notEqual(tools.stateFile, series.stateFile);
  assert.equal(tools.authFile, series.authFile);
  assert.equal(tools.scene, 'assets/demo-scene.json');
  assert.equal(series.scene, undefined);
  const selected = [];
  for (const path of series.scenes) {
    const manifestUrl = new URL(`../${path}`, import.meta.url);
    const scene = JSON.parse(await readFile(manifestUrl, 'utf8'));
    await verifyAsset(scene, new URL(scene.file, manifestUrl));
    assert.deepEqual([scene.width, scene.height, scene.bands.length], [1024, 1024, 13]);
    selected.push({ scene });
  }
  validateSeries(selected);
  for (const { scene } of selected) assert.deepEqual(scene.geotransform, selected[0].scene.geotransform);
  await assert.rejects(configuration({ dataset: 'unknown' }), /Unknown dataset/);
});
