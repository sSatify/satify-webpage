// Isolated production recorder. Review captures before selecting website assets.
import { mkdir, open, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configuration, launch, connect, readJson, writeJson, root } from './runtime.mjs';
import { setupProject, verifyAsset, resetProject } from './project.mjs';
import { tidy, encode } from './showcase-v2.mjs';
import { frameScene, placeToolPanel } from './framing.mjs';
import { presentation, waitForCanvas } from './presentation.mjs';
import { waitForMutation, trackEditorWrites } from './editor-api.mjs';
import { countSeriesLabels } from './series-recording.mjs';

export const roadSettings = { brush: '79.9 m', curvature: .85, fitWidth: true, bufferPx: 1, replaceExisting: false };
// Native pixel centres, reviewed against the unlabelled RGB source. Follow both
// S-bends to the owner's red mark, rather than stopping at the first bend.
export const roadPixels = [[112,27.5],[114,33.5],[116,39.5],[118,45.5],
  [119.5,51.5],[121.5,57.5],[123,63.5],[125,69.5],[126.5,75.5],
  [128,81.5],[129.5,87.5],[132,91.5],[134,93.5],[137,95.5],
  [139,97.5],[139,99.5],[137,101.5],[133.5,103.5],[130.5,105.5],
  [128.5,107.5],[127,109.5],[126,113.5],[125.5,116.5],
  [126.5,119.5],[127.5,121.5],[130,122.5],[132.5,123.5],
  [134.5,124.5],[136.5,125.5],[138,127.5],[139,129.5],
  [140,132.5],[140.5,136.5]];
export const trialPath = roadPixels.map(([x,y]) => [x / 510, y / 510]);
// Halve the movement budget and sample count. Review exported timing too:
// pointer-event/capture overhead varies with workstation load.
const traceMsPerPixel = 25;

function guideError(points) {
  return Math.max(...points.map(([x,y]) => Math.min(...roadPixels.slice(1).map((b,i) => {
    const a = roadPixels[i], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x-a[0])*dx + (y-a[1])*dy) / (dx*dx+dy*dy)));
    return Math.hypot(x-a[0]-t*dx, y-a[1]-t*dy);
  }))));
}

const config = await configuration({ env: 'prod', project: 'SATIFY forest road trial 2019-08-20 2026-11-09' });
config.scene = 'assets/forest-scene.json';
config.labels = [{ id: 1, labelName: 'Road', color: '#ba5bd2' }];
config.selectedLabel = 'Road';
const scene = await readJson(resolve(root, config.scene));
const bytes = await verifyAsset(scene, resolve(root, 'assets', scene.file));
await mkdir(config.stateDir, { recursive: true });
const lockPath = resolve(config.stateDir, 'run.lock');
const lock = await open(lockPath, 'wx');
await lock.writeFile(String(process.pid));
const directory = resolve(root, 'output', new Date().toISOString().replace(/[:.]/g, '-') + '-forest-road-trial');
await mkdir(directory, { recursive: true });
let runtime, page, recording = false;
try {
  console.log(`Target: ${config.baseUrl} · Separate trial: ${config.projectName}`);
  runtime = await launch(config);
  await connect(runtime, config);
  const state = await setupProject({ api: runtime.api, config, scene, bytes,
    state: await readJson(config.stateFile, null),
    save: async state => { await writeJson(config.stateFile, state); await runtime.saveAuth(); } });
  page = await runtime.context.newPage();
  // A newly prepared scene is already empty. Its automatic mask batch may
  // still be finishing; do not request an unnecessary layer removal then.
  if (await countSeriesLabels(page, runtime.api, { ...state, sceneIds: [state.sceneId] }, state.sceneId)) {
    await resetProject({ api: runtime.api, config, scene, state });
  }
  async function prepareEditor() {
    await page.goto(config.baseUrl + '/data-store');
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    const switched = page.waitForResponse(r => r.url().endsWith('/session/switch') && r.request().method() === 'POST');
    const [opened] = await Promise.all([switched,
      page.getByRole('button', { name: `Open ${config.projectName} in editor`, exact: true }).click()]);
    if (!opened.ok() || (await opened.json()).sid !== state.sid) throw new Error('Wrong trial project.');
    await page.locator('.ol-paint-host').first().waitFor();
    await page.setViewportSize({ width: 1360, height: 1000 });
    await tidy(page);
    await page.getByTitle(/^Show classes/).filter({ hasText: 'Road' }).waitFor();
    const frame = await frameScene(page, scene, { width: 1280, height: 960, viewportWidth: 1360,
      cropX: 80, focus: [.29,.20], zoom: 2.4, subjectAt: [.40,.45], panelAt: [.76,.07], restOnPanel: true });
    await page.getByRole('button', { name: 'Rivers & roads pen', exact: true }).click();
    await placeToolPanel(page, frame);
    const panel = page.locator('.editor-tool-hint');
    const size = panel.getByRole('textbox', { name: 'Brush size', exact: true });
    await size.fill(roadSettings.brush); await size.press('Enter');
    await panel.getByRole('radio', { name: /^Draw:/ }).click();
    await panel.getByRole('radio', { name: /^Trace:/ }).click();
    const curvature = panel.getByRole('slider', { name: 'Preserve curvature', exact: true });
    await curvature.press('Home');
    for (let step = 0; step < 17; step++) await curvature.press('ArrowRight');
    await panel.getByRole('checkbox', { name: 'Fit width', exact: true }).check();
    const buffer = panel.getByRole('slider', { name: /^Buffer/ });
    await buffer.press('Home');
    const minimum = Number(await buffer.getAttribute('min'));
    for (let value = minimum; value < roadSettings.bufferPx; value++) await buffer.press('ArrowRight');
    const replace = panel.getByRole('switch', { name: 'Replace existing', exact: true });
    if (await replace.getAttribute('aria-checked') === 'true') await replace.click();
    if (Number(await curvature.inputValue()) !== .85 || Number(await buffer.inputValue()) !== 1) throw new Error('Trial settings did not apply.');
    await page.locator('html[data-theme="dark"].dark').waitFor();
    return { frame, panel };
  }
  let { frame, panel } = await prepareEditor();
  let demo = await presentation(page, scene, frame);
  let previewBody;
  function observePreviews() {
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/session/lines/preview')) {
        previewBody = request.postDataJSON();
      }
    });
  }
  observePreviews();
  async function finalGuide() {
    // Preview requests can also occur during a stroke. The displayed final area
    // becomes ready only after release and after the newest preview tiles load.
    await panel.getByText(/^Adds [\d,.]+ m²/).waitFor({ timeout: 120_000 });
    if (previewBody?.scope?.strokes?.length !== 1) throw new Error('Expected one road guide.');
    return previewBody.scope.strokes[0].points;
  }
  // Measure this camera through an unapplied UI guide, then discard it. Real
  // fit/wheel/pan gestures round the image transform; do not guess its offset.
  const start = roadPixels[0], end = roadPixels.at(-1);
  await demo.move(await demo.point(...trialPath[0]));
  await page.mouse.down();
  await demo.move(await demo.point(...trialPath.at(-1)), 600);
  await page.mouse.up();
  const probePoints = await finalGuide();
  const camera = [0,1].map(axis => {
    const gain = (probePoints.at(-1)[axis] - probePoints[0][axis]) / (end[axis] - start[axis]);
    return { gain, offset: probePoints[0][axis] - gain * start[axis] };
  });
  if (camera.some(c => Math.abs(c.gain - 1) > .03 || Math.abs(c.offset) > 5)) throw new Error(`Unexpected road camera transform: ${JSON.stringify(camera)}.`);
  await page.keyboard.press('Escape');
  await panel.getByText('Draw along a river or road.', { exact: true }).waitFor();
  // Production v3.0.0 can briefly reuse the discarded calibration preview when
  // the next stroke starts. A fresh editor page clears that in-memory state;
  // keep the real imagery and tool rendering intact throughout the recording.
  await page.close();
  page = await runtime.context.newPage();
  ({ frame, panel } = await prepareEditor());
  demo = await presentation(page, scene, frame);
  previewBody = null;
  observePreviews();
  const writesFinished = trackEditorWrites(page);
  async function roadPoint([x,y]) {
    return demo.point((x-camera[0].offset)/camera[0].gain/scene.width,
      (y-camera[1].offset)/camera[1].gain/scene.height);
  }
  await page.locator('#video-caption').evaluate((el, clip) => {
    el.style.font = '700 40px/1.2 system-ui, sans-serif';
    el.style.padding = '16px 26px'; el.style.bottom = `${innerHeight - clip.y - clip.height + Math.round(clip.height * .14)}px`;
    el.style.background = '#0b201af5'; el.style.border = '2px solid #b9e4b0';
  }, frame.clip);
  await demo.park(); await waitForCanvas(page);
  await page.screenshot({ path: resolve(directory, 'before.png'), clip: frame.clip });
  await page.screencast.start({ path: resolve(directory, 'capture.webm'), size: frame.viewport, fps: 30 }); recording = true;
  const captureStartedAt = performance.now();
  await demo.caption('Trace the road through the forest.', 1000);
  await demo.move(await roadPoint(start), 650);
  const traceStartedAt = performance.now();
  await page.mouse.down();
  try {
    for (let i = 1; i < roadPixels.length; i++) {
      const distance = Math.hypot(roadPixels[i][0]-roadPixels[i-1][0], roadPixels[i][1]-roadPixels[i-1][1]);
      await demo.move(await roadPoint(roadPixels[i]), distance * traceMsPerPixel);
    }
  }
  finally { await page.mouse.up(); }
  const traceFinishedAt = performance.now();
  const guide = await finalGuide();
  const maxGuideError = guideError(guide);
  if (maxGuideError > .65 || Math.hypot(guide.at(-1)[0]-end[0], guide.at(-1)[1]-end[1]) > .65) {
    throw new Error(`Road guide missed the reviewed centreline: ${maxGuideError.toFixed(2)} native pixels; endpoint ${guide.at(-1)}.`);
  }
  await demo.park();
  await demo.caption('Review the detected path and width.', 2800);
  await page.screenshot({ path: resolve(directory, 'detected-preview.png'), clip: frame.clip });
  const saved = waitForMutation(page, 'lines');
  const [applied] = await Promise.all([saved, demo.click(panel.getByRole('button', { name: 'Apply', exact: true }))]);
  if (!applied.ok()) throw new Error('The road trial could not be applied.');
  const result = await applied.json();
  if (!(result.pixels_written > 0)) throw new Error('The road trial saved no labels.');
  await writesFinished();
  await demo.caption('Follow the road through both bends.', 3000);
  await demo.park(); await demo.settle();
  await page.screencast.stop(); recording = false;
  await page.screenshot({ path: resolve(directory, 'poster.png'), clip: frame.clip });
  const count = await countSeriesLabels(page, runtime.api, { ...state, sceneIds: [state.sceneId] }, state.sceneId, '#ba5bd2');
  if (count !== result.pixels_written) throw new Error('Saved road pixels differ from the Apply receipt.');
  const mp4 = encode(directory, 'forest-road-trial', frame, { resultPreview: false });
  await writeFile(resolve(directory, 'trial.json'), JSON.stringify({ origin: config.baseUrl, project: config.projectName,
    theme: 'dark', sourceScene: scene.source_scene, sourceSha256: scene.sha256, settings: roadSettings,
    path: trialPath, frame, camera, maxGuideError, traceMsPerPixel,
    traceStartMs: Math.round(traceStartedAt - captureStartedAt), traceDurationMs: Math.round(traceFinishedAt - traceStartedAt),
    previewWorkaround: 'fresh-editor-page-after-calibration',
    pixelsWritten: result.pixels_written, verifiedPixels: count, mutation: applied.request().postDataJSON(),
    recordedAt: new Date().toISOString(), published: false }, null, 2));
  console.log(`Trial captured for visual review: ${mp4} · ${count} saved road pixels · guide error ${maxGuideError.toFixed(2)} px`);
} catch (error) {
  await page?.screenshot({ path: resolve(directory, 'failure.png') }).catch(() => {});
  console.error(`Trial diagnostics: ${directory}`);
  throw error;
} finally {
  if (recording) await page.screencast.stop().catch(() => {});
  try { await runtime?.close(); }
  finally { await lock.close(); await unlink(lockPath); }
}
