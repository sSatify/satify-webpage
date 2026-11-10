import { mkdir, writeFile, open, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { configuration, launch, connect, readJson, root, recordingTheme, recordingExplainerVideos } from './runtime.mjs';
import { resetProject, validateBinding } from './project.mjs';
import { frameScene, placeToolPanel } from './framing.mjs';
import { presentation, waitForCanvas } from './presentation.mjs';
import { countSeriesLabels } from './series-recording.mjs';
import { isMutationResponse, waitForMutation, trackEditorWrites } from './editor-api.mjs';

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
  const hide = page.getByRole('button', { name: /^(Hide workspace|Hide settings and (classes|labels))$/ });
  if (await hide.isVisible()) await hide.click();
  const classes = page.getByTitle(/^Collapse classes(?: \(.*\))?$/);
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
    await page.getByTitle(/^Show classes(?: \(.*\))?$/).filter({ hasText: name }).waitFor();
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
  const frame = await frameScene(page, context.scene, { ...toolsFraming,
    focus: [.5, .5], zoom: 2, subjectAt: [.58, .43], panelAt: [.84, .07] });
  await page.getByRole('button', { name: 'Smart fill', exact: true }).click();
  await placeToolPanel(page, frame);
  await selectMask(page, 5);
  await page.getByRole('radio', { name: /^Local:/ }).click();
  return frame;
}

export async function runSmart(demo, context) {
  const { page, frame } = demo;
  const state = { ...context.state, sceneIds: [context.state.sceneId] };
  const count = () => countSeriesLabels(page, context.runtime.api, state, state.sceneId);
  const anchor = { x: frame.clip.x + frame.clip.width * .5, y: frame.clip.y + frame.clip.height * .5 };
  context.verifiedModes = {};
  async function fill(mode, title, detail) {
    await demo.caption(title, 550, detail);
    await demo.move(await demo.point(.19, .43), 400);
    await demo.hold(350);
    await demo.fill(.19, .43, mode);
    await context.writesFinished();
    context.verifiedModes[mode] = await count();
    await demo.hold(750);
  }
  async function undo() {
    await demo.caption('Same scene. Same starting point.', 350);
    // Activate the actual Undo control without moving the recorded pointer to
    // the toolbar outside this camera crop. User key bindings may differ.
    await page.getByRole('button', { name: 'Undo', exact: true }).press('Enter');
    for (let n = 0; n < 40; n++) {
      if (await count() === 0) return;
      await demo.hold(250);
    }
    throw new Error('The comparison fill could not be undone.');
  }
  await fill('Local', 'LOCAL', 'One connected region.');
  await undo();
  await demo.click(page.getByRole('radio', { name: /^(In viewport|Viewport):/ }));
  await fill('In viewport', 'VIEWPORT', 'Matching regions inside the current view.');
  const previousViewport = await demo.zoomAt(.5, anchor);
  await demo.viewportOutline(previousViewport);
  await demo.caption('VIEWPORT', 1500, 'Outside the previous view stays unlabelled.');
  await undo();
  await demo.viewportOutline(null);
  await demo.zoomAt(2, anchor);
  await demo.click(page.getByRole('radio', { name: /^Global:/ }));
  await fill('Global', 'GLOBAL', 'Matching regions across the whole image.');
  const globalViewport = await demo.zoomAt(.5, anchor);
  await demo.viewportOutline(globalViewport);
  await demo.caption('GLOBAL', 2100, 'Matching regions beyond the previous view are labelled too.');
  const modes = context.verifiedModes;
  if (!(modes.Local > 0 && modes['In viewport'] > modes.Local && modes.Global > modes['In viewport'])) {
    throw new Error('The three scopes did not demonstrate different saved extents.');
  }
}

// Follow only the main road marked in the latest review: from the southwest,
// around its sweeping bend and east along the straight section, without the side road.
export const roadPath = [[.38667,.63604],[.40229,.61365],[.41687,.59281],[.42938,.57823],
  [.44083,.56573],[.45229,.55063],[.46531,.535],[.4799,.52042],[.49604,.5074],
  [.51427,.49542],[.53563,.48552],[.55906,.47615],[.58406,.4699],[.61531,.46521],
  [.645,.46156],[.67833,.45844],[.70958,.45583],[.74083,.45375],
  [.77208,.45219],[.78771,.45167]];

export async function prepareRoads(page, context) {
  await page.setViewportSize({ width: 1360, height: 1000 });
  await tidy(page);
  await chooseClass(page, 'Built-up');
  const frame = await frameScene(page, context.scene, { ...toolsFraming,
    focus: [.55, .46], zoom: 2, subjectAt: [.58, .48] });
  await page.getByRole('button', { name: 'Rivers & roads pen', exact: true }).click();
  await placeToolPanel(page, frame);
  const size = page.locator('.editor-tool-hint input[type=text]');
  await size.fill('16 px'); await size.press('Enter');
  await page.getByRole('radio', { name: /^Trace:/ }).click();
  await page.getByRole('checkbox', { name: 'Fit width', exact: true }).check();
  await page.getByText('Draw along a river or road.', { exact: true }).waitFor({ timeout: 120_000 });
  return frame;
}

export async function runRoads(demo) {
  await demo.caption('Guide a broad stroke along the road.');
  await demo.hold(700);
  await demo.move(await demo.point(...roadPath[0]), 650);
  await demo.page.mouse.down();
  try { for (const point of roadPath.slice(1)) await demo.move(await demo.point(...point), 100); }
  finally { await demo.page.mouse.up(); }
  const apply = demo.page.locator('.editor-tool-hint').getByRole('button', { name: 'Apply', exact: true });
  await demo.page.getByText(/^Adds [\d,.]+ m²/).waitFor({ timeout: 120_000 });
  await demo.park();
  await demo.caption('SATIFY detects the road inside your stroke.');
  await demo.hold(2400);
  const saved = waitForMutation(demo.page, 'lines');
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
  if (mode === 'Time series') {
    const box = await page.locator('.ol-paint-host').first().boundingBox();
    await page.mouse.click(box.x + box.width * .6, box.y + box.height * .7, { button: 'right' });
    const picker = page.getByRole('dialog', { name: /^Select or create (class|label)$/ });
    const seagrass = picker.getByRole('button', { name: 'Seagrass', exact: true });
    if (await seagrass.count()) await seagrass.click();
    else {
      await picker.getByRole('button', { name: 'Add class', exact: true }).click();
      await picker.getByRole('textbox', { name: 'New class name' }).fill('Seagrass');
      await picker.locator('input[aria-label="Class colour"]').fill('#a000b5');
      await picker.getByRole('button', { name: 'Create class', exact: true }).click();
    }
    await picker.waitFor({ state: 'hidden' });
    await chooseClass(page, 'Water');
  }
  await page.getByRole('button', { name: 'Change detection', exact: true }).click();
  await page.getByRole('combobox', { name: 'Index', exact: true }).waitFor({ timeout: 60_000 });
  if (mode === 'Time series') await page.getByRole('radio', { name: mode, exact: true }).click();
  return { clip: { x: 0, y: 69, width: 1600, height: 900 }, viewport: page.viewportSize(), restAt: [.18, .025] };
}

export async function prepareSync(page, context) {
  const frame = await prepareComparison(page, context, 'Time series');
  const areaList = await context.runtime.api('GET', `/session/saved-areas/${encodeURIComponent(context.state.sceneIds[0])}?sid=${encodeURIComponent(context.state.sid)}`);
  if (areaList.areas?.length) throw new Error('The recorder-owned date has saved areas; preserve them before recording.');
  await page.getByRole('combobox', { name: 'Current file', exact: true }).selectOption({ label: '[1] Coastal farmland 2021-09-01' });
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Fit image', exact: true }).click();
  await waitForCanvas(page);
  const sync = page.getByRole('switch', { name: 'Sync labelling', exact: true });
  if (await sync.getAttribute('aria-checked') === 'true') await sync.click();
  await page.getByRole('button', { name: 'Smart fill', exact: true }).click();
  await page.getByRole('slider', { name: 'Source mask', exact: true }).waitFor();
  await selectMask(page, 2);
  if (!/^Adaptive Groups · k=3/.test(await page.getByRole('slider', { name: 'Source mask' }).getAttribute('aria-valuetext') ?? '')) {
    throw new Error('The Water mask is not Adaptive Groups · k=3.');
  }
  await page.getByRole('radio', { name: /^Local:/ }).click();
  await placeToolPanel(page, { ...frame, panelAt: [.147, .123] });
  await page.waitForTimeout(1500);
  return { ...frame, restOnPanel: true };
}

export async function runSync(demo, context) {
  await demo.caption('Three dates. One shared workflow.');
  await demo.hold(1300);
  await demo.click(demo.page.getByRole('switch', { name: 'Sync labelling', exact: true }));
  if (await demo.page.getByRole('checkbox').filter({ visible: true }).count() < 2) throw new Error('Missing sync targets.');
  await demo.hold(700);
  await demo.caption('Label water across the dates.');
  const box = await demo.page.locator('.ol-paint-host').first().boundingBox();
  context.undoStates = [];
  const counts = color => Promise.all(context.state.sceneIds.map(id => countSeriesLabels(demo.page, context.runtime.api, context.state, id, color)));
  async function fill(x, y) {
    const before = await counts();
    await demo.move({ x: box.x + box.width * x, y: box.y + box.height * y }, 700);
    await demo.hold(1500);
    const observed = [];
    const observe = request => {
      if (/\/session\/(?:editor-mutation|editor-save)/.test(new URL(request.url()).pathname)) {
        observed.push(request.postDataJSON()?.action ?? request.postDataJSON()?.kind ?? 'unknown');
      }
    };
    demo.page.on('request', observe);
    const synced = demo.page.waitForResponse(response => isMutationResponse(response, 'sync'), { timeout: 25_000 });
    await demo.page.mouse.down(); await demo.hold(100); await demo.page.mouse.up();
    let response;
    try { response = await synced; }
    catch { throw new Error(`The Smart Fill click produced no Sync labelling operation (${observed.join(', ') || 'no editor write'}).`); }
    finally { demo.page.off('request', observe); }
    context.undoStates.push(before);
    context.applied = true;
    if (!response.ok()) throw new Error('The dates could not be synced.');
    const result = await response.json();
    const targets = result.results?.flatMap(op => op.per_target ?? []);
    if (targets?.length !== 2 || targets.some(t => t.status !== 'ok' || !t.changed_tiles?.length)) throw new Error('Not every selected date was labelled.');
    await demo.hold(650);
  }
  // Middle of the water channel: the lower seed transfers to a different mask on the third date.
  await fill(.65, .61);
  if ((await counts('#3399ff'))[2] < 200_000) {
    throw new Error('The third date did not receive the main Water channel.');
  }
  await demo.caption('Find the Seagrass shoreline.');
  await demo.click(demo.page.getByRole('button', { name: 'Pan', exact: true }));
  await demo.caption('Choose Seagrass.');
  await demo.move({ x: 200, y: 600 }, 500);
  await demo.page.mouse.click(200, 600, { button: 'right' });
  const picker = demo.page.getByRole('dialog', { name: /^Select or create (class|label)$/ });
  await demo.click(picker.getByRole('button', { name: 'Seagrass', exact: true }));
  await demo.caption('Draw one area around both intertidal stretches.');
  await demo.page.evaluate(() => document.activeElement?.blur());
  await demo.page.keyboard.press('a');
  const shore = [[435,321],[563,321],[570,359],[558,399],[528,451],[528,484],[538,535],[530,584],[477,619],[367,619],[374,582],[396,531],[413,481],[430,434]];
  for (const [x, y] of [...shore, shore[0]]) {
    await demo.move({ x, y }, 300);
    await demo.page.mouse.click(x, y);
  }
  const areaSaved = waitForMutation(demo.page, 'area-create');
  await demo.page.keyboard.press('a');
  const areaResponse = await areaSaved;
  if (!areaResponse.ok()) throw new Error('The polygon area could not be saved.');
  const savedArea = (await areaResponse.json()).area;
  context.areaName = savedArea?.name;
  context.areaId = savedArea?.id;
  if (!context.areaName || !context.areaId) throw new Error('The saved polygon has no identity.');
  context.areaCreated = true;
  await demo.caption('Use Smooth Regions for Seagrass.');
  await demo.click(demo.page.getByRole('button', { name: 'Smart fill', exact: true }));
  const sourceMask = demo.page.getByRole('slider', { name: 'Source mask', exact: true });
  await sourceMask.press('Home');
  for (let index = 0; index < 30; index++) {
    if (/^Smooth Regions · k[-=]10\b/.test(await sourceMask.getAttribute('aria-valuetext') ?? '')) break;
    const previous = await sourceMask.inputValue();
    await sourceMask.press('ArrowRight');
    if (await sourceMask.inputValue() === previous) break;
  }
  if (!/^Smooth Regions · k[-=]10\b/.test(await sourceMask.getAttribute('aria-valuetext') ?? '')) {
    throw new Error('The Seagrass mask is not Smooth Regions · k=10.');
  }
  await demo.click(demo.page.getByRole('radio', { name: /^(In viewport|Viewport):/ }));
  const replace = demo.page.getByRole('switch', { name: 'Replace existing', exact: true });
  if (await replace.getAttribute('aria-checked') === 'true') await demo.click(replace);
  if (await replace.getAttribute('aria-checked') !== 'false') throw new Error('Replace existing must be off.');
  await demo.caption('Fill Seagrass inside the polygon.');
  const beforeSeagrass = await counts();
  await demo.move({ x: 420, y: 555 }, 700);
  await demo.hold(700);
  const syncedSeagrass = waitForMutation(demo.page, 'sync');
  await demo.page.mouse.down(); await demo.hold(100); await demo.page.mouse.up();
  const seagrassResponse = await syncedSeagrass;
  if (!seagrassResponse.ok()) throw new Error('The Seagrass Smart Fill did not sync.');
  const seagrassTargets = (await seagrassResponse.json()).results?.flatMap(op => op.per_target ?? []);
  if (seagrassTargets?.length !== 2 || seagrassTargets.some(t => t.status !== 'ok' || !t.changed_tiles?.length)) {
    throw new Error('Not every selected date received Seagrass labels.');
  }
  context.undoStates.push(beforeSeagrass);
  let seagrassCounts = [0, 0, 0];
  for (let attempt = 0; attempt < 60; attempt++) {
    await context.writesFinished();
    seagrassCounts = await counts('#a000b5');
    if (seagrassCounts.every(count => count > 0)) break;
    await demo.page.waitForTimeout(100);
  }
  if (seagrassCounts.some(count => count <= 0)) {
    throw new Error('The Seagrass Smart Fill did not save labels on every date.');
  }
  await demo.hold(650);
  await demo.caption('Cover the darker interior as well.');
  const beforeInterior = await counts();
  await demo.move({ x: 500, y: 360 }, 700);
  await demo.hold(650);
  await demo.page.mouse.down(); await demo.hold(100); await demo.page.mouse.up();
  let interiorCounts = seagrassCounts;
  for (let attempt = 0; attempt < 60; attempt++) {
    await context.writesFinished();
    interiorCounts = await counts('#a000b5');
    if (interiorCounts[0] > seagrassCounts[0] + 20_000) break;
    await demo.page.waitForTimeout(100);
  }
  if (interiorCounts[0] <= seagrassCounts[0] + 20_000 ||
      interiorCounts.slice(1).some((count, index) => count < seagrassCounts[index + 1])) {
    throw new Error('The darker Seagrass interior was not saved.');
  }
  context.undoStates.push(beforeInterior);
  await demo.hold(650);
  await demo.caption('Water and Seagrass across three dates.');
  await demo.hold(2200);
  context.verifiedClasses = { Water: await counts('#3399ff'), Seagrass: await counts('#a000b5') };
  if (Object.values(context.verifiedClasses).some(values => values.some(n => n <= 0))) throw new Error('Both classes must be saved on every date.');
  context.verifiedCounts = await counts();
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
  const saved = waitForMutation(demo.page, 'convey');
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
  context.undoStates ??= [[0, 0, 0]];
  while (context.undoStates.length) {
    const expected = context.undoStates.at(-1);
    if (!context.undoPending) {
      await demo.page.getByRole('button', { name: 'Undo', exact: true }).click();
      context.undoPending = true;
    }
    let restored = false;
    for (let n = 0; n < 40; n++) {
      const counts = await Promise.all(context.state.sceneIds.map(id => countSeriesLabels(demo.page, context.runtime.api, context.state, id)));
      if (counts.every((value, i) => value === expected[i])) { restored = true; break; }
      await demo.hold(250);
    }
    if (!restored) throw new Error('Demo edits could not be fully undone; do not reset the series.');
    context.undoStates.pop();
    context.undoPending = false;
  }
  context.applied = false;
}

export async function cleanupSync(demo, context) {
  await cleanupSeries(demo, context);
  if (!context.areaCreated) return;
  const page = demo.page;
  const workspace = page.getByRole('button', { name: 'Workspace', exact: true });
  if (await workspace.isVisible()) await workspace.click();
  const area = page.getByRole('region', { name: 'Area', exact: true });
  const exit = area.getByRole('button', { name: /^Stop using this area/ });
  if (await exit.isVisible()) await exit.click();
  const list = () => context.runtime.api('GET', `/session/saved-areas/${encodeURIComponent(context.state.sceneIds[0])}?sid=${encodeURIComponent(context.state.sid)}`);
  for (let attempt = 0; attempt < 10; attempt++) {
    const saved = (await list()).areas ?? [];
    if (!saved.length) break;
    const remove = area.getByRole('button', { name: `Delete ${saved[0].name}`, exact: true });
    await remove.first().click();
    await area.getByRole('button', { name: 'Delete', exact: true }).click();
    let removed = false;
    for (let n = 0; n < 40; n++) {
      if (!((await list()).areas ?? []).some(entry => entry.id === saved[0].id)) { removed = true; break; }
      await page.waitForTimeout(100);
    }
    if (!removed) throw new Error('The recorder-owned saved area could not be removed.');
  }
  if (((await list()).areas ?? []).length) throw new Error('Recorder-owned saved areas remain on the server.');
  context.areaCreated = false;
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
  const size = page.locator('.editor-tool-hint').getByRole('textbox', { name: /^(Pen size|Size)$/ });
  await size.fill('5 px'); await size.press('Enter');
  await page.getByRole('radio', { name: 'Paint', exact: true }).click();
  await chooseClass(page, 'Forest');
  return frame;
}

export async function runPropagate(demo, context) {
  await demo.caption('Start with a clean image.');
  await demo.hold(1300);
  let selected = 'Forest';
  for (const example of starterExamples) {
    await demo.caption(`Draw examples of ${example.name.toLowerCase()}.`);
    if (selected !== example.name) await chooseClass(demo.page, example.name, demo);
    selected = example.name;
    await demo.stroke(example.points, 1100);
    await demo.hold(600);
  }
  await demo.caption('Add built-up examples.');
  await chooseClass(demo.page, 'Built-up', demo);
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
  const saved = waitForMutation(demo.page, 'propagate');
  const [response] = await Promise.all([saved, demo.click(apply)]);
  if (!response.ok()) throw new Error('Predictions could not be applied.');
  const result = await response.json();
  if (!(result.pixels_written > 0)) throw new Error('No predictions were saved.');
  await demo.park();
  await demo.caption('Teach it a little. Label a lot. · Experimental');
  await demo.hold(3200);
}

export const definitions = {
  'smart-fill': { dataset: 'tools', title: 'Local. Viewport. Global.', prepare: prepareSmart, run: runSmart, resultPreview: false },
  'rivers-roads': { dataset: 'tools', title: 'Follow the bend.', prepare: prepareRoads, run: runRoads },
  'change-detection': { dataset: 'time-series', title: 'See the change. Make it a label.', prepare: prepareChange, run: runChange, cleanup: cleanupSeries },
  'time-series': { dataset: 'time-series', title: 'One action. Several dates.', prepare: prepareSync, run: runSync, cleanup: cleanupSync },
  propagate: { dataset: 'tools', title: 'Teach it a little. Label a lot.', prepare: preparePropagate, run: runPropagate, resultPreview: false },
};

export async function showcaseConfiguration(name, options = {}) {
  const definition = definitions[name];
  if (!definition) throw new Error(`Unknown showcase: ${name}`);
  return configuration({ env: options.env, url: options.url, dataset: definition.dataset,
    project: options.project ?? `SATIFY website showcase 2026-11-09 ${definition.dataset === 'tools' ? 'tools' : 'time series'}` });
}

export async function openManaged(name, options = {}) {
  const definition = definitions[name];
  const config = await showcaseConfiguration(name, options);
  console.log(`Target: ${config.baseUrl} · Project: ${config.projectName} · Theme: ${recordingTheme}`);
  const state = await readJson(config.stateFile, null);
  if (!state) throw new Error('Prepare a recorder-owned project for this origin and project name before recording. See tools/videos/README.md.');
  if (state.origin !== config.baseUrl || state.stage !== 'ready') throw new Error('The managed project is not ready for this recording origin.');
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
    await page.goto(config.baseUrl + '/');
    if (await page.evaluate(() => localStorage.getItem('explainerVideos')) !== recordingExplainerVideos) {
      throw new Error('Tool videos must be disabled before recording.');
    }
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    const opened = page.waitForResponse(r => r.url().endsWith('/session/switch') && r.request().method() === 'POST');
    await page.getByRole('button', { name: `Open ${config.projectName} in editor`, exact: true }).click();
    const response = await opened;
    const project = await response.json();
    if (!response.ok() || project.sid !== state.sid) throw new Error('Wrong demonstration project.');
    await page.locator('.ol-paint-host').first().waitFor();
    const appVersion = (await page.locator('body').innerText()).match(/\bv\d+\.\d+\.\d+[^\s]*/)?.[0] ?? 'unknown';
    return { runtime, config, scene, state, page, appVersion, manifest: project.manifest,
      async release() { try { await runtime.close(); } finally { await lock.close(); await unlink(lockPath); } } };
  } catch (error) {
    try { if (runtime) await runtime.close(); }
    finally { await lock.close(); await unlink(lockPath); }
    throw error;
  }
}

export function encode(directory, name, frame, { resultPreview = true } = {}) {
  const bundledFfmpeg = resolve(root, 'node_modules/ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  const ffmpeg = process.env.FFMPEG_PATH || (existsSync(bundledFfmpeg) ? bundledFfmpeg : 'ffmpeg');
  const target = resolve(directory, name + '.mp4');
  const crop = `crop=${frame.clip.width}:${frame.clip.height}:${frame.clip.x}:${frame.clip.y},fps=30,setsar=1,format=yuv420p`;
  const filter = resultPreview ? `[0:v]fps=30,setsar=1,format=yuv420p[intro];` +
    `[1:v]crop=${frame.clip.width}:${frame.clip.height}:${frame.clip.x}:${frame.clip.y},fps=30,setsar=1,format=yuv420p[demo];` +
    '[intro][demo]concat=n=2:v=1:a=0[out]' : `[0:v]${crop}[out]`;
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y',
    ...(resultPreview ? ['-loop', '1', '-t', '1', '-i', resolve(directory, 'poster.png')] : []),
    '-i', resolve(directory, 'capture.webm'),
    '-filter_complex', filter, '-map', '[out]', '-an', '-c:v', 'libx264', '-crf', '19',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', target], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || 'Video encoding failed.');
  return target;
}

export async function recordShowcase(name, options = {}) {
  const definition = definitions[name];
  const context = await openManaged(name, options);
  const { page, runtime } = context;
  const directory = resolve(root, 'output', new Date().toISOString().replace(/[:.]/g, '-') + '-v2-' + name);
  await mkdir(directory, { recursive: true });
  context.directory = directory;
  const results = [];
  const writesFinished = trackEditorWrites(page);
  context.writesFinished = writesFinished;
  const pendingResults = [];
  page.on('response', response => {
    const request = response.request();
    const operation = request.method() === 'POST' && /\/session\/editor-mutation(?:\/v[23])?$/.test(new URL(response.url()).pathname)
      ? request.postDataJSON()?.action : null;
    if (!['fill', 'lines', 'convey', 'propagate', 'sync'].includes(operation) || !isMutationResponse(response, operation)) return;
    pendingResults.push((async () => {
      const body = await response.json();
      const requestBody = request.postDataJSON().body;
      results.push({ route: new URL(response.url()).pathname, action: operation, status: response.status(),
        label: requestBody?.label_hex ?? requestBody?.label_color,
        pixelsWritten: body.pixels_written, changedTiles: body.changed?.length,
        targets: body.results?.flatMap(op => op.per_target?.map(t => ({ status: t.status, changedTiles: t.changed_tiles?.length })) ?? []) });
    })().catch(error => { results.push({ action: operation, status: 0, error: error.message }); }));
  });
  let recording = false;
  let demo;
  try {
    const frame = await definition.prepare(page, context);
    await page.locator(`html[data-theme="${recordingTheme}"].dark`).waitFor();
    demo = await presentation(page, context.scene, frame);
    await page.locator('#video-caption').evaluate((el, clip) => {
      el.style.font = '700 40px/1.2 system-ui, sans-serif';
      el.style.padding = '16px 26px'; el.style.borderRadius = '6px';
      el.style.bottom = `${innerHeight - clip.y - clip.height + Math.round(clip.height * .14)}px`;
      el.style.maxWidth = `${Math.round(clip.width * .84)}px`;
      el.style.background = '#0b201af5'; el.style.border = '2px solid #b9e4b0';
      el.style.boxShadow = '0 3px 18px #0008';
    }, frame.clip);
    await demo.park();
    await waitForCanvas(page);
    await page.screenshot({ path: resolve(directory, 'before.png'), clip: frame.clip });
    await page.screencast.start({ path: resolve(directory, 'capture.webm'), size: frame.viewport, fps: 30 });
    recording = true;
    await definition.run(demo, context);
    await writesFinished();
    await page.screencast.stop(); recording = false;
    await page.screenshot({ path: resolve(directory, 'poster.png'), clip: frame.clip });
    await Promise.all(pendingResults);
    if (results.some(r => r.status === 0 || r.status >= 400)) throw new Error('An editor operation failed.');
    await definition.cleanup?.(demo, context);
    await writesFinished();
    if (definition.dataset === 'tools') {
      context.verifiedCounts = [await countSeriesLabels(page, runtime.api,
        { ...context.state, sceneIds: [context.state.sceneId] }, context.state.sceneId)];
      if (context.verifiedCounts[0] <= 0) throw new Error('The tool demonstration did not save any labels.');
    }
    const mp4 = encode(directory, name, frame, definition);
    await writeFile(resolve(directory, 'recording.json'), JSON.stringify({
      scenario: name, title: definition.title, origin: context.config.baseUrl, theme: recordingTheme,
      explainerVideos: recordingExplainerVideos, appVersion: context.appVersion,
      recordedAt: new Date().toISOString(), frame, sourceSha256: context.scene.sha256, verifiedLabelCounts: context.verifiedCounts,
      verifiedClasses: context.verifiedClasses,
      verifiedModes: context.verifiedModes,
      editorial: name === 'smart-fill'
        ? 'Local, Viewport and Global from clean starts; real zoom gestures reveal the previous viewport boundary. Silent; no simulated results.'
        : definition.resultPreview === false
        ? 'Clean image followed by all example strokes and predictions in chronological order. Silent; no simulated results.'
        : 'One-second result preview followed by real app interaction. Silent; no simulated results.', results,
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
  const { values, positionals } = parseArgs({ allowPositionals: true,
    options: { env: { type: 'string' }, url: { type: 'string' }, project: { type: 'string' } } });
  recordShowcase(positionals[0], values).catch(error => { console.error(error.stack); process.exitCode = 1; });
}
