// Real local SATIFY capture for the five-second Roads pilot.
import { parseArgs } from 'node:util';
import { copyFile, mkdir, open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configuration, launch, connect, readJson, writeJson, root } from './runtime.mjs';
import { setupProject, verifyAsset, resetProject } from './project.mjs';
import { tidy } from './showcase-v2.mjs';
import { frameScene, placeToolPanel } from './framing.mjs';
import { presentation, waitForCanvas } from './presentation.mjs';
import { waitForMutation, trackEditorWrites } from './editor-api.mjs';
import { countSeriesLabels } from './series-recording.mjs';

const { values } = parseArgs({ options: {
  url: { type: 'string' }, project: { type: 'string' }, auth: { type: 'string' },
  'expect-version': { type: 'string' }, prepare: { type: 'boolean', default: false },
} });
if (values.url !== 'http://127.0.0.1:3030') throw Error('Explicit --url http://127.0.0.1:3030 is required.');
if (!values['expect-version']) throw Error('Pass --expect-version for the intended local build.');
const config = await configuration({ url: values.url,
  project: values.project || 'SATIFY micro road showcase 2026-11-11' });
config.scene = 'assets/forest-scene.json';
config.labels = [{ id: 1, labelName: 'Road', color: '#ba5bd2' }];
config.selectedLabel = 'Road';
const settings = { brush: '159.8 m', curvature: .25, fitWidth: true, bufferPx: 0 };
// Intentionally loose, sparse and off-centre, while the road stays in the corridor.
const guide = [[108,27.5],[125,62],[129,86],[144,98],[122,116],[144,139]];
const scene = await readJson(resolve(root, config.scene));
const bytes = await verifyAsset(scene, resolve(root, 'assets', scene.file));
await mkdir(config.stateDir, { recursive: true });
if (values.auth) await copyFile(resolve(values.auth), config.authFile);
const lockPath = resolve(config.stateDir, 'run.lock');
const lock = await open(lockPath, 'wx');
await lock.writeFile(String(process.pid));
const directory = resolve(root, 'output', new Date().toISOString().replace(/[:.]/g, '-') + '-local-road-micro');
await mkdir(directory, { recursive: true });
let runtime, page, recording = false;
try {
  console.log(`Target: ${config.baseUrl} · Project: ${config.projectName}`);
  runtime = await launch(config);
  await connect(runtime, config);
  const state = await setupProject({ api: runtime.api, config, scene, bytes,
    state: await readJson(config.stateFile, null),
    save: async value => { await writeJson(config.stateFile, value); await runtime.saveAuth(); } });
  page = await runtime.context.newPage();
  await page.goto(config.baseUrl + '/');
  const version = `v${values['expect-version'].replace(/^v/, '')}`;
  await page.getByText(version, { exact: true }).waitFor();
  if (await page.evaluate(() => localStorage.getItem('explainerVideos')) !== 'off') throw Error('Tool videos are not off.');
  console.log(`Verified ${version}, dark mode requested, Tool videos off.`);
  if (values.prepare) { console.log('Managed local road project is ready.'); }
  else {
    await resetProject({ api: runtime.api, config, scene, state });
    await page.reload();
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    const switched = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/session/switch'));
    await page.getByRole('button', { name: `Open ${config.projectName} in editor`, exact: true }).click();
    const response = await switched;
    if (!response.ok() || (await response.json()).sid !== state.sid) throw Error('Wrong recording project.');
    await page.locator('.ol-paint-host').first().waitFor();
    await tidy(page);
    const frame = await frameScene(page, scene, { width: 1280, height: 960, viewportWidth: 1360,
      cropX: 80, focus: [.29,.20], zoom: 2.4, subjectAt: [.4,.45], panelAt: [.76,.07], restOnPanel: true });
    await page.getByRole('button', { name: 'Rivers & roads pen', exact: true }).click();
    await placeToolPanel(page, frame);
    const panel = page.locator('.editor-tool-hint');
    const size = panel.getByRole('textbox', { name: 'Brush size', exact: true });
    await size.fill(settings.brush); await size.press('Enter');
    await panel.getByRole('radio', { name: /^Trace:/ }).click();
    const curvature = panel.getByRole('slider', { name: 'Preserve curvature', exact: true });
    await curvature.press('Home');
    for (let i = 0; i < 5; i++) await curvature.press('ArrowRight');
    await panel.getByRole('checkbox', { name: 'Fit width', exact: true }).check();
    const buffer = panel.getByRole('slider', { name: /^Buffer/ });
    await buffer.press('Home');
    for (let i = Number(await buffer.getAttribute('min')); i < 0; i++) await buffer.press('ArrowRight');
    const replace = panel.getByRole('switch', { name: 'Replace existing', exact: true });
    if (await replace.getAttribute('aria-checked') === 'true') await replace.click();
    if (Number(await curvature.inputValue()) !== .25 || Number(await buffer.inputValue()) !== 0) throw Error('Recording settings differ.');
    await page.locator('html[data-theme="dark"].dark').waitFor();
    const count = () => countSeriesLabels(page, runtime.api, { ...state, sceneIds: [state.sceneId] }, state.sceneId, '#ba5bd2');
    if (await count() !== 0) throw Error('Managed road layer is not empty.');
    let previewBody, previewRoute;
    page.on('request', request => {
      if (request.method() === 'POST' && /\/session\/lines\/preview(?:\/v2)?$/.test(new URL(request.url()).pathname)) {
        previewBody = request.postDataJSON(); previewRoute = new URL(request.url()).pathname;
      }
    });
    const demo = await presentation(page, scene, frame);
    const at = ([x,y], camera) => demo.point(camera ? (x-camera[0].offset)/camera[0].gain/510 : x/510,
      camera ? (y-camera[1].offset)/camera[1].gain/510 : y/510);
    await demo.move(await at(guide[0])); await page.mouse.down();
    await demo.move(await at(guide.at(-1)), 400); await page.mouse.up();
    await panel.getByText(/^Adds [\d,.]+ m²/).waitFor({ timeout: 120_000 });
    const probe = previewBody.scope.strokes[0].points;
    const camera = [0,1].map(axis => {
      const gain = (probe.at(-1)[axis]-probe[0][axis])/(guide.at(-1)[axis]-guide[0][axis]);
      return { gain, offset: probe[0][axis]-gain*guide[0][axis] };
    });
    if (camera.some(c => Math.abs(c.gain-1) > .03 || Math.abs(c.offset) > 5)) throw Error('Unexpected camera calibration.');
    await page.keyboard.press('Escape');
    await panel.getByText('Draw along a river or road.', { exact: true }).waitFor();
    await demo.move(await at(guide[0], camera), 300);
    await waitForCanvas(page);
    await page.screenshot({ path: resolve(directory, 'before.png'), clip: frame.clip });
    const writes = trackEditorWrites(page);
    await page.screencast.start({ path: resolve(directory, 'capture.webm'), size: frame.viewport, fps: 30 });
    recording = true;
    const began = performance.now(), stamp = () => (performance.now()-began)/1000;
    await page.waitForTimeout(650);
    const traceStart = stamp();
    await page.mouse.down();
    try { for (const point of guide.slice(1)) await demo.move(await at(point, camera), 500); }
    finally { await page.mouse.up(); }
    const traceEnd = stamp();
    await panel.getByText(/^Adds [\d,.]+ m²/).waitFor({ timeout: 120_000 });
    await waitForCanvas(page);
    const previewReady = stamp();
    const request = structuredClone(previewBody);
    if (!previewRoute.endsWith('/v2') || request.scope.strokes[0].fit_revision !== 2) throw Error('The updated fitting revision is not active.');
    // Measure the preview against the empty layer. After Apply, Replace existing
    // off correctly makes the same request report zero additional pixels.
    const preview = await runtime.api('POST', '/session/lines/preview/v2', { data: request });
    if (!(preview.pixels_written > 0)) throw Error('The ready preview is empty.');
    await page.waitForTimeout(700);
    const applyStart = stamp();
    const [applied] = await Promise.all([waitForMutation(page, 'lines'), panel.getByRole('button', { name: 'Apply', exact: true }).click()]);
    if (!applied.ok()) throw Error('Road Apply failed.');
    const receipt = await applied.json();
    await writes(); await waitForCanvas(page);
    const savedReady = stamp();
    const persisted = await count();
    if (persisted <= 0 || persisted !== receipt.pixels_written) throw Error('Saved road differs from Apply receipt.');
    await page.waitForTimeout(850);
    const end = stamp();
    await page.screencast.stop(); recording = false;
    await page.screenshot({ path: resolve(directory, 'poster.png'), clip: frame.clip });
    if (preview.pixels_written !== persisted) throw Error('Preview and saved road counts differ.');
    for (const [x,y] of [[0,0],[0,1],[1,0],[1,1]]) {
      const png = await runtime.api('GET', `/session/labeltiles/${state.sceneId}/Drawing%20Layer%201/${x}/${y}.png?sid=${state.sid}`,
        { responseType: 'buffer', allowNotFound: true });
      if (png) await (await import('node:fs/promises')).writeFile(resolve(directory, `saved-${x}-${y}.png`), png);
    }
    // Keep the original capture. Render in a separate process so browser and
    // export can use the appropriate Windows filesystem context independently.
    const rawVideo = resolve(directory, 'capture.webm');
    await writeJson(resolve(directory, 'recording.json'), { origin: config.baseUrl, appVersion: version, theme: 'dark',
      explainerVideos: 'off', project: config.projectName, sid: state.sid, sourceSha256: scene.sha256,
      settings, guide, camera, frame, fitRevision: 2, pixelsWritten: persisted,
      previewApplyCountParity: true, request, times: { traceStart, traceEnd, previewReady, applyStart, savedReady, end },
      rawVideo, rawCrop: frame.clip, recordedAt: new Date().toISOString(), published: false });
    console.log(`Captured ${rawVideo} · ${persisted} verified road pixels · fitting revision 2.`);
    await page.getByRole('button', { name: /^Undo/ }).click();
    let clean = false;
    for (let i=0; i<80; i++) { if (await count() === 0) { clean = true; break; } await page.waitForTimeout(200); }
    if (!clean) throw Error('Could not verify cleanup to empty after recording.');
    console.log('Undid the recorded label and verified an empty managed layer.');
  }
} catch (error) {
  await page?.screenshot({ path: resolve(directory, 'failure.png') }).catch(() => {});
  console.error(`Diagnostics: ${directory}`); throw error;
} finally {
  if (recording) await page.screencast.stop().catch(() => {});
  try { await runtime?.close(); } finally { await lock.close(); await unlink(lockPath); }
}
