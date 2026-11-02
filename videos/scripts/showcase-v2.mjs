import { mkdir, writeFile, open, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { configuration, launch, connect, readJson, root } from './runtime.mjs';
import { resetProject, validateBinding } from './project.mjs';
import { frameScene, placeToolPanel } from './framing.mjs';
import { presentation, waitForCanvas } from './presentation.mjs';
import { countSeriesLabels } from './series-recording.mjs';

export const toolsFraming = { width: 1280, height: 960, viewportWidth: 1360,
  cropX: 80, cropTop: 0, cropBottom: 0, focus: [.5, .5], zoom: 1.05,
  subjectAt: [.55, .5], panelAt: [.16, .07], restOnPanel: true };

export async function tidy(page, { collapse = true } = {}) {
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const help = page.getByRole('button', { name: /^(Controls hint|Controls reference)$/ });
  if (await help.count()) {
    const expanded = await help.getAttribute('aria-expanded');
    if (expanded === 'true') await help.click();
  }
  const basemap = page.getByTitle('Hide the baselayer', { exact: true });
  if (await basemap.isVisible()) await basemap.click();
  const hide = page.getByRole('button', { name: /^Hide settings and (classes|labels)$/ });
  if (await hide.isVisible()) await hide.click();
  const classes = page.getByTitle('Collapse classes', { exact: true });
  if (collapse && await classes.isVisible()) await classes.click();
}

export async function chooseClass(page, name, demo) {
  if (demo) {
    const at = await demo.point(.44, .40);
    await demo.move(at, 400);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    const picker = page.getByRole('dialog', { name: /^Select or create (class|label)$/ });
    await picker.waitFor();
    await demo.hold(400);
    await demo.click(picker.getByRole('button', { name, exact: true }));
    await picker.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: `Current class: ${name}`, exact: true }).waitFor();
    return;
  }
  const box = await page.locator('.ol-paint-host').first().boundingBox();
  await page.mouse.click(box.x + box.width * .6, box.y + box.height * .4, { button: 'right' });
  const picker = page.getByRole('dialog', { name: /^Select or create (class|label)$/ });
  await picker.getByRole('button', { name, exact: true }).click();
  await picker.waitFor({ state: 'hidden' });
}

export async function selectMask(page, index) {
  const source = page.getByRole('slider', { name: 'Source mask', exact: true });
  await source.press('Home');
  for (let n = 0; n < index; n++) await source.press('ArrowRight');
  if (Number(await source.inputValue()) !== index) throw new Error('The expected source mask is unavailable.');
}

export async function prepareSmart(page, context) {
  await page.setViewportSize({ width: 1360, height: 1000 });
  await tidy(page);
  await chooseClass(page, 'Forest');
  const frame = await frameScene(page, context.scene, toolsFraming);
  await page.getByRole('button', { name: 'Smart fill', exact: true }).click();
  await placeToolPanel(page, frame);
  await selectMask(page, 5);
  await page.getByRole('radio', { name: /^Local:/ }).click();
  return frame;
}

export async function runSmart(demo) {
  await demo.caption('Preview the region.');
  await demo.move(await demo.point(.64, .77), 700);
  await demo.hold(1100);
  await demo.fill(.64, .77);
  await demo.park();
  await demo.hold(900);
  await demo.caption('Fill matching regions together.');
  await demo.click(demo.page.getByRole('radio', { name: /^In viewport:/ }));
  await demo.move(await demo.point(.64, .77), 650);
  await demo.hold(750);
  await demo.fill(.64, .77, 'In viewport');
  await demo.park();
  await demo.hold(900);
  await chooseClass(demo.page, 'Water', demo);
  await demo.click(demo.page.getByRole('radio', { name: /^Local:/ }));
  await demo.caption('Add the details that matter.');
  await demo.move(await demo.point(.59, .635), 650);
  await demo.hold(650);
  await demo.fill(.59, .635);
  await demo.park();
  await demo.caption('A few clicks. A landscape labelled.');
  await demo.hold(2500);
}

// Follow the arterial roads marked in the review: down to the junction, then
// around the broad northeast bend, avoiding the parallel residential streets.
export const roadPath = [[.32156,.50635],[.34344,.52302],[.36531,.53917],[.38667,.55479],
  [.4075,.57042],[.42938,.58448],[.44083,.5699],[.45229,.55427],[.46531,.5376],
  [.4799,.52198],[.49604,.50844],[.51427,.49594],[.53563,.48552],[.55906,.47615],
  [.58406,.4699],[.61531,.46521]];

export async function prepareRoads(page, context) {
  await page.setViewportSize({ width: 1360, height: 1000 });
  await tidy(page);
  await chooseClass(page, 'Built-up');
  const frame = await frameScene(page, context.scene, { ...toolsFraming,
    focus: [.55, .46], zoom: 2, subjectAt: [.62, .55] });
  await page.getByRole('button', { name: 'Rivers & roads pen', exact: true }).click();
  await placeToolPanel(page, frame);
  const size = page.locator('.editor-tool-hint input[type=text]');
  await size.fill('8 px'); await size.press('Enter');
  await page.getByRole('radio', { name: /^Trace:/ }).click();
  await page.getByRole('checkbox', { name: 'Fit width', exact: true }).check();
  await page.getByText('Draw along a river or road.', { exact: true }).waitFor({ timeout: 120_000 });
  return frame;
}

export async function runRoads(demo) {
  await demo.caption('Guide a stroke along the road.');
  await demo.hold(700);
  await demo.move(await demo.point(...roadPath[0]), 650);
  await demo.page.mouse.down();
  try { for (const point of roadPath.slice(1)) await demo.move(await demo.point(...point), 320); }
  finally { await demo.page.mouse.up(); }
  const apply = demo.page.locator('.editor-tool-hint').getByRole('button', { name: 'Apply', exact: true });
  await demo.page.getByText(/^Adds [\d,.]+ m²/).waitFor({ timeout: 120_000 });
  await demo.park();
  await demo.caption('Review the path and its width.');
  await demo.hold(1800);
  const saved = demo.page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/lines/apply'), { timeout: 120_000 });
  const [response] = await Promise.all([saved, demo.click(apply)]);
  if (!response.ok()) throw new Error('The road could not be labelled.');
  await demo.page.getByText(/^Added [\d,.]+ m²/).waitFor({ timeout: 60_000 });
  await demo.caption('Follow the bend.');
  await demo.park();
  await demo.hold(2800);
}

export async function prepareComparison(page, context, mode = 'Change detection') {
  const { state, runtime } = context;
  if (state.kind !== 'time-series' || state.stage !== 'ready' || state.sceneIds?.length !== 3) {
    throw new Error('A managed, prepared three-date project is required.');
  }
  for (const id of state.sceneIds) {
    if (await countSeriesLabels(page, runtime.api, state, id)) throw new Error('Demo dates contain labels; preserve them before recording.');
  }
  await page.setViewportSize({ width: 1600, height: 972 });
  await page.getByRole('combobox', { name: 'Current file', exact: true }).selectOption({ label: '[3] Coastal farmland 2022-09-04' });
  await tidy(page);
  await page.getByRole('button', { name: 'Fit image', exact: true }).click();
  if (mode === 'Time series') await chooseClass(page, 'Water');
  await page.getByRole('button', { name: 'Change detection', exact: true }).click();
  await page.getByRole('combobox', { name: 'Index', exact: true }).waitFor({ timeout: 60_000 });
  if (mode === 'Time series') await page.getByRole('radio', { name: mode, exact: true }).click();
  return { clip: { x: 0, y: 69, width: 1600, height: 900 }, viewport: page.viewportSize(), restAt: [.18, .025] };
}

export async function prepareSync(page, context) {
  const frame = await prepareComparison(page, context, 'Time series');
  const sync = page.getByRole('switch', { name: 'Sync labelling', exact: true });
  if (await sync.getAttribute('aria-checked') === 'true') await sync.click();
  await page.getByRole('button', { name: 'Smart fill', exact: true }).click();
  await selectMask(page, 0);
  await page.getByRole('radio', { name: /^Local:/ }).click();
  await page.waitForTimeout(1500);
  return { ...frame, restOnPanel: true };
}

export async function runSync(demo, context) {
  await demo.caption('Three dates. One shared workflow.');
  await demo.hold(1300);
  await demo.click(demo.page.getByRole('switch', { name: 'Sync labelling', exact: true }));
  if (await demo.page.getByRole('checkbox').filter({ visible: true }).count() < 2) throw new Error('Missing sync targets.');
  await demo.hold(700);
  await demo.caption('Preview each date using its own imagery.');
  const box = await demo.page.locator('.ol-paint-host').first().boundingBox();
  await demo.move({ x: box.x + box.width * .75, y: box.y + box.height * .79 }, 800);
  await demo.hold(1800);
  const synced = demo.page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/timeseries/sync'), { timeout: 120_000 });
  await demo.page.mouse.down(); await demo.hold(100); await demo.page.mouse.up();
  context.applied = true;
  const response = await synced;
  if (!response.ok()) throw new Error('The dates could not be synced.');
  const result = await response.json();
  const targets = result.results?.flatMap(op => op.per_target ?? []);
  if (targets?.length !== 2 || targets.some(t => t.status !== 'ok' || !t.changed_tiles?.length)) throw new Error('Not every selected date was labelled.');
  await demo.park();
  await demo.caption('One action. Several dates.');
  await demo.hold(3200);
  const counts = await Promise.all(context.state.sceneIds.map(id => countSeriesLabels(demo.page, context.runtime.api, context.state, id)));
  if (counts.some(n => n <= 0)) throw new Error('A recorded date has no saved labels.');
  context.verifiedCounts = counts;
}

export async function prepareChange(page, context) {
  const frame = await prepareComparison(page, context);
  await page.getByRole('combobox', { name: 'Reference image', exact: true }).selectOption(context.state.sceneIds[1]);
  await page.getByRole('combobox', { name: 'Index', exact: true }).selectOption('NDVI');
  await page.getByRole('button', { name: 'Viewport', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Show all', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Show Range 1', exact: true }).check();
  await page.getByRole('combobox', { name: /^(Class|Label) to apply$/ }).click();
  await page.getByRole('option', { name: 'Open ground', exact: true }).click();
  const bar = page.getByRole('slider', { name: /^Boundary 1/ });
  await bar.focus();
  for (let n = 0; n < 80; n++) {
    const value = Number(await bar.getAttribute('aria-valuenow'));
    if (Math.abs(value) < .015) break;
    await bar.press(value > 0 ? 'ArrowLeft' : 'ArrowRight');
  }
  await page.getByRole('button', { name: 'Apply to image', exact: true }).scrollIntoViewIfNeeded();
  return frame;
}

export async function runChange(demo, context) {
  await demo.caption('Same place. Two dates.');
  await demo.hold(1800);
  await demo.click(demo.page.getByRole('list', { name: 'Ranges', exact: true }).getByRole('button', { name: /^Range 1 / }));
  await demo.caption('Isolate the vegetation-index decrease.');
  const bar = demo.page.getByRole('slider', { name: /^Boundary 1/ });
  const handle = await bar.locator('rect').first().boundingBox();
  const box = await demo.page.getByRole('group', { name: /^Histogram of the difference/ }).boundingBox();
  const lo = Number(await bar.getAttribute('aria-valuemin'));
  const hi = Number(await bar.getAttribute('aria-valuemax'));
  const value = Number(await bar.getAttribute('aria-valuenow'));
  const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  await demo.move(start, 600);
  await demo.page.mouse.down();
  try { await demo.move({ x: start.x + (-.2 - value) / (hi - lo) * (box.width - 20), y: start.y }, 2000); }
  finally { await demo.page.mouse.up(); }
  await demo.park();
  await demo.hold(1400);
  await demo.caption('Turn the selected change into labels.');
  await demo.page.getByRole('button', { name: 'Apply to image', exact: true }).evaluate(el => el.scrollIntoView({ block: 'center' }));
  const saved = demo.page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/change/convey'), { timeout: 120_000 });
  const [response] = await Promise.all([saved, demo.click(demo.page.getByRole('button', { name: 'Apply to image', exact: true }))]);
  if (!response.ok()) throw new Error('Change labelling failed.');
  const result = await response.json();
  if (!(result.pixels_written > 0)) throw new Error('No changed pixels were labelled.');
  context.applied = true;
  await demo.page.getByRole('status').filter({ hasText: /pixels labelled Open ground/ }).waitFor({ timeout: 60_000 });
  await demo.park();
  await demo.caption('See the change. Make it a label.');
  await demo.hold(2800);
}

export async function cleanupSeries(demo, context) {
  if (!context.applied) return;
  await demo.page.getByRole('button', { name: 'Undo', exact: true }).click();
  for (let n = 0; n < 40; n++) {
    const counts = await Promise.all(context.state.sceneIds.map(id => countSeriesLabels(demo.page, context.runtime.api, context.state, id)));
    if (counts.every(n => n === 0)) { context.applied = false; return; }
    await demo.hold(250);
  }
  throw new Error('Demo edits could not be fully undone; do not reset the series.');
}

const starterExamples = [
  { name: 'Forest', points: [[.65,.80],[.68,.82],[.71,.82]] },
  { name: 'Forest', points: [[.19,.43],[.20,.46],[.21,.48]] },
  { name: 'Water', points: [[.587,.615],[.596,.619],[.604,.628]] },
];
const builtExample = [[.46,.56],[.48,.57],[.49,.59]];

export async function preparePropagate(page, context) {
  await page.setViewportSize({ width: 1600, height: 972 });
  await tidy(page);
  await page.getByRole('button', { name: 'Fit image', exact: true }).click();
  await waitForCanvas(page);
  const box = await page.locator('.ol-paint-host').first().boundingBox();
  const frame = { clip: { x: 0, y: 69, width: 1600, height: 900 }, viewport: page.viewportSize(),
    focus: [.5,.5], target: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    scale: Math.min(box.width / context.scene.width, box.height / context.scene.height),
    panelAt: [.16,.08], restAt: [.18,.025] };
  await page.getByRole('button', { name: 'Pen', exact: true }).click();
  await placeToolPanel(page, frame);
  const size = page.getByRole('textbox', { name: 'Pen size', exact: true });
  await size.fill('5 px'); await size.press('Enter');
  await page.getByRole('radio', { name: 'Paint', exact: true }).click();
  for (const example of starterExamples) {
    await chooseClass(page, example.name);
    const points = example.points.map(([x,y]) => ({ x: frame.target.x + (x-.5)*context.scene.width*frame.scale,
      y: frame.target.y + (y-.5)*context.scene.height*frame.scale }));
    await page.mouse.move(points[0].x, points[0].y);
    const saved = page.waitForResponse(r => r.request().method() === 'PUT' && r.url().includes('/labeltiles/'));
    await page.mouse.down();
    for (const point of points.slice(1)) await page.mouse.move(point.x, point.y, { steps: 12 });
    await page.mouse.up();
    if (!(await saved).ok()) throw new Error('An example stroke failed.');
  }
  await chooseClass(page, 'Built-up');
  return frame;
}

export async function runPropagate(demo, context) {
  await demo.caption('Start with examples: forest, water, built-up.');
  await demo.hold(1000);
  await demo.stroke(builtExample, 1500);
  await demo.hold(600);
  await demo.click(demo.page.getByRole('button', { name: 'Propagate labels', exact: true }));
  const panel = demo.page.getByRole('region', { name: 'Propagate labels', exact: true });
  await panel.waitFor();
  await demo.caption('Learn from the examples. Preview the rest.');
  // Entering this workspace starts learning automatically when examples are ready.
  await demo.click(demo.page.getByRole('button', { name: 'Pan', exact: true }));
  const apply = panel.getByRole('button', { name: 'Apply', exact: true });
  await apply.waitFor();
  await demo.page.waitForFunction(() => {
    const p = document.querySelector('[role=region][aria-label="Propagate labels"]');
    return [...(p?.querySelectorAll('button') ?? [])].some(b => b.textContent.trim() === 'Apply' && !b.disabled);
  }, null, { timeout: 120_000 });
  await demo.hold(1000);
  await demo.caption('Leave uncertain pixels for review.');
  const confidence = panel.getByRole('slider', { name: 'Minimum confidence', exact: true });
  await demo.click(confidence, { x: .80 });
  await demo.hold(1500);
  const saved = demo.page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/propagate/apply'), { timeout: 120_000 });
  const [response] = await Promise.all([saved, demo.click(apply)]);
  if (!response.ok()) throw new Error('Predictions could not be applied.');
  const result = await response.json();
  if (!(result.pixels_written > 0)) throw new Error('No predictions were saved.');
  await demo.park();
  await demo.caption('Teach it a little. Label a lot. · Experimental');
  await demo.hold(3200);
}

export const definitions = {
  'smart-fill': { dataset: 'tools', title: 'A few clicks. A landscape labelled.', prepare: prepareSmart, run: runSmart },
  'rivers-roads': { dataset: 'tools', title: 'Follow the bend.', prepare: prepareRoads, run: runRoads },
  'change-detection': { dataset: 'time-series', title: 'See the change. Make it a label.', prepare: prepareChange, run: runChange, cleanup: cleanupSeries },
  'time-series': { dataset: 'time-series', title: 'One action. Several dates.', prepare: prepareSync, run: runSync, cleanup: cleanupSeries },
  propagate: { dataset: 'tools', title: 'Teach it a little. Label a lot.', prepare: preparePropagate, run: runPropagate },
};

export async function openManaged(name) {
  const definition = definitions[name];
  if (!definition) throw new Error(`Unknown showcase: ${name}`);
  const config = await configuration({ env: 'dev', dataset: definition.dataset,
    project: `SATIFY website showcase 2026-10-26 ${definition.dataset === 'tools' ? 'tools' : 'time series'}` });
  const state = await readJson(config.stateFile);
  const scene = await readJson(resolve(root, config.scene ?? config.scenes[2]));
  const lockPath = resolve(config.stateDir, 'run.lock');
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('This demo project already has a recording in progress.');
    throw error;
  }
  await lock.writeFile(String(process.pid));
  let runtime;
  try {
    runtime = await launch(config);
    await connect(runtime, config);
    if (definition.dataset === 'tools') {
      validateBinding(state, config, scene, (await runtime.api('GET', '/session/list')).sessions);
      await resetProject({ api: runtime.api, config, scene, state });
    }
    const page = await runtime.context.newPage();
    await page.goto(config.baseUrl + '/data-store');
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    const opened = page.waitForResponse(r => r.url().endsWith('/session/switch') && r.request().method() === 'POST');
    await page.getByRole('button', { name: `Open ${config.projectName} in editor`, exact: true }).click();
    const response = await opened;
    const project = await response.json();
    if (!response.ok() || project.sid !== state.sid) throw new Error('Wrong demonstration project.');
    await page.locator('.ol-paint-host').first().waitFor();
    return { runtime, config, scene, state, page, manifest: project.manifest,
      async release() { try { await runtime.close(); } finally { await lock.close(); await unlink(lockPath); } } };
  } catch (error) {
    try { if (runtime) await runtime.close(); }
    finally { await lock.close(); await unlink(lockPath); }
    throw error;
  }
}

export function encode(directory, name, frame) {
  const bundledFfmpeg = resolve(root, 'node_modules/ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  const ffmpeg = process.env.FFMPEG_PATH || (existsSync(bundledFfmpeg) ? bundledFfmpeg : 'ffmpeg');
  const target = resolve(directory, name + '.mp4');
  const filter = `[0:v]fps=30,setsar=1,format=yuv420p[intro];` +
    `[1:v]crop=${frame.clip.width}:${frame.clip.height}:${frame.clip.x}:${frame.clip.y},fps=30,setsar=1,format=yuv420p[demo];` +
    '[intro][demo]concat=n=2:v=1:a=0[out]';
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y',
    '-loop', '1', '-t', '1', '-i', resolve(directory, 'poster.png'), '-i', resolve(directory, 'capture.webm'),
    '-filter_complex', filter, '-map', '[out]', '-an', '-c:v', 'libx264', '-crf', '19',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', target], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || 'Video encoding failed.');
  return target;
}

export async function recordShowcase(name) {
  const definition = definitions[name];
  const context = await openManaged(name);
  const { page, runtime } = context;
  const directory = resolve(root, 'output', new Date().toISOString().replace(/[:.]/g, '-') + '-v2-' + name);
  await mkdir(directory, { recursive: true });
  const results = [];
  page.on('response', async response => {
    const request = response.request();
    if (request.method() !== 'POST' || !/\/session\/(fill|lines\/apply|change\/convey|propagate\/apply|timeseries\/sync)/.test(response.url())) return;
    try {
      const body = await response.json();
      const requestBody = request.postDataJSON();
      results.push({ route: new URL(response.url()).pathname, status: response.status(),
        label: requestBody?.label_hex ?? requestBody?.label_color,
        pixelsWritten: body.pixels_written, changedTiles: body.changed?.length,
        targets: body.results?.flatMap(op => op.per_target?.map(t => ({ status: t.status, changedTiles: t.changed_tiles?.length })) ?? []) });
    } catch { /* non-JSON diagnostics */ }
  });
  let recording = false;
  let demo;
  try {
    const frame = await definition.prepare(page, context);
    demo = await presentation(page, context.scene, frame);
    await page.locator('#video-caption').evaluate(el => {
      el.style.font = '600 30px/1.3 system-ui, sans-serif';
      el.style.padding = '12px 22px'; el.style.borderRadius = '5px';
      el.style.background = '#142c24f0'; el.style.border = '1px solid #a4d69e';
    });
    await demo.park();
    await waitForCanvas(page);
    await page.screenshot({ path: resolve(directory, 'before.png'), clip: frame.clip });
    await page.screencast.start({ path: resolve(directory, 'capture.webm'), size: frame.viewport, fps: 30 });
    recording = true;
    await definition.run(demo, context);
    await page.screencast.stop(); recording = false;
    await page.screenshot({ path: resolve(directory, 'poster.png'), clip: frame.clip });
    if (results.some(r => r.status >= 400)) throw new Error('An editor operation failed.');
    await definition.cleanup?.(demo, context);
    const mp4 = encode(directory, name, frame);
    await writeFile(resolve(directory, 'recording.json'), JSON.stringify({
      scenario: name, title: definition.title, origin: context.config.baseUrl,
      recordedAt: new Date().toISOString(), frame, sourceSha256: context.scene.sha256, verifiedLabelCounts: context.verifiedCounts,
      editorial: 'One-second result preview followed by real app interaction. Silent; no simulated results.', results,
    }, null, 2));
    console.log(`Recorded ${mp4}`);
    await runtime.saveAuth();
  } catch (error) {
    await page.screenshot({ path: resolve(directory, 'failure.png') }).catch(() => {});
    console.error(`Review diagnostics: ${directory}`);
    throw error;
  } finally {
    if (recording) await page.screencast.stop().catch(() => {});
    try { if (context.applied && demo) await definition.cleanup?.(demo, context); }
    finally { await context.release(); }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  recordShowcase(process.argv[2]).catch(error => { console.error(error.stack); process.exitCode = 1; });
}
