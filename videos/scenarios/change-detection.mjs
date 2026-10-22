import { countSeriesLabels, tidySeriesView } from '../scripts/series-recording.mjs';
import { waitForCanvas } from '../scripts/presentation.mjs';
import { DRAWING_LAYER } from '../scripts/project.mjs';

export const dataset = 'time-series';
export const output = { width: 1200, height: 1080 };
export const keepOnlyOutput = true;
export const showcase = {
  category: 'Time series & change detection',
  title: 'Turn change into a mask',
  description: 'Compare dates of the same place, isolate a range of index change, and turn it into labels on your imagery.',
  targetSeconds: [20, 30],
  beats: ['Compare three dates with a shared view', 'Open change detection',
    'Narrow the NDVI decrease range', 'Choose a label and apply the mask', 'Hold the labelled result'],
};
export const framing = { width: 1200, height: 1080, viewport: { width: 1280, height: 1152 },
  restAt: [0.31, 0.025] };

async function chooseLabel(page, label, demo) {
  const selector = page.getByRole('combobox', { name: 'Label to apply', exact: true });
  if (demo) await demo.click(selector); else await selector.click();
  const option = page.getByRole('option', { name: label, exact: true });
  if (demo) await demo.click(option); else await option.click();
}

export async function createFrame(page, { runtime, state, manifest }) {
  if (state.kind !== 'time-series' || state.stage !== 'ready' || state.sceneIds?.length !== 3) {
    throw new Error('This recording needs the prepared three-date time-series project.');
  }
  if (manifest?.editor?.selectedDrawingLayer !== DRAWING_LAYER) {
    throw new Error('Select the managed demo drawing layer before recording. No labels were changed.');
  }
  const current = state.sceneIds[2];
  // No blanket reset: refuse existing label pixels and undo only our own Apply.
  if (await countSeriesLabels(page, runtime.api, state, current)) {
    throw new Error('The current time-series scene contains labels. Preserve them and use a clean managed demo project.');
  }
  await page.setViewportSize(framing.viewport);
  const file = page.getByRole('combobox', { name: 'Current file', exact: true });
  await file.selectOption({ label: '[3] Coastal farmland 2022-09-04' });
  await page.waitForTimeout(1500);
  await tidySeriesView(page);
  await page.getByRole('button', { name: 'Fit image', exact: true }).click();
  await page.getByRole('button', { name: 'Change detection', exact: true }).click();
  const index = page.getByRole('combobox', { name: 'Index', exact: true });
  await index.waitFor({ timeout: 60_000 });
  await page.getByRole('combobox', { name: 'Reference image', exact: true }).selectOption(state.sceneIds[1]);
  await index.selectOption('NDVI');
  await page.getByRole('button', { name: 'Viewport', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Show all', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Show Range 1', exact: true }).check();
  const clear = page.getByRole('button', { name: 'Clear selection', exact: true });
  if (await clear.count()) await clear.click();
  await chooseLabel(page, 'Vegetation');
  const bar = page.getByRole('slider', { name: /^Boundary 1/ });
  await bar.focus();
  for (let attempt = 0; attempt < 80; attempt++) {
    const value = Number(await bar.getAttribute('aria-valuenow'));
    if (Math.abs(value) < 0.015) break;
    await bar.press(value > 0 ? 'ArrowLeft' : 'ArrowRight');
  }
  await page.getByRole('radio', { name: 'Time series', exact: true }).click();
  await tidySeriesView(page);
  const stage = await page.getByTestId('time-series-grid').boundingBox();
  const clip = { x: stage.x, y: stage.y - 96, width: framing.width, height: framing.height };
  if (clip.x + clip.width > framing.viewport.width || clip.y + clip.height > framing.viewport.height) {
    throw new Error('The time-series crop exceeds the viewport.');
  }
  await page.mouse.move(clip.x + 372, clip.y + 27);
  await waitForCanvas(page);
  return { clip, viewport: framing.viewport, restAt: framing.restAt };
}

export default async function changeDetection(demo, { state }) {
  await demo.hold(1800);
  const active = await demo.page.locator('.ol-paint-host').first().boundingBox();
  await demo.move({ x: active.x + active.width * 0.42, y: active.y + active.height * 0.4 }, 550);
  await demo.page.mouse.wheel(0, -90);
  await demo.hold(1100);
  await demo.click(demo.page.getByRole('radio', { name: 'Change detection', exact: true }));
  await demo.page.getByRole('slider', { name: /^Boundary 1/ }).waitFor();
  await demo.hold(1500);
  await demo.click(demo.page.getByRole('list', { name: 'Ranges', exact: true })
    .getByRole('button', { name: /^Range 1 / }));
  const bar = demo.page.getByRole('slider', { name: /^Boundary 1/ });
  const handle = await bar.locator('rect').first().boundingBox();
  const plot = demo.page.getByRole('group', { name: /^Histogram of the difference/ });
  const box = await plot.boundingBox();
  const lo = Number(await bar.getAttribute('aria-valuemin'));
  const hi = Number(await bar.getAttribute('aria-valuemax'));
  const value = Number(await bar.getAttribute('aria-valuenow'));
  const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  const end = { x: start.x + (-0.2 - value) / (hi - lo) * (box.width - 20), y: start.y };
  await demo.move(start, 550);
  await demo.page.mouse.down();
  try { await demo.move(end, 1800); } finally { await demo.page.mouse.up(); }
  const threshold = Number(await bar.getAttribute('aria-valuenow'));
  if (Math.abs(threshold + 0.2) > 0.025) throw new Error('The difference boundary did not reach the intended range.');
  await demo.hold(1200);
  await chooseLabel(demo.page, 'Open ground', demo);
  await demo.hold(600);
  const saved = demo.page.waitForResponse(response => response.request().method() === 'POST'
    && response.url().includes('/session/change/convey'), { timeout: 60_000 });
  const [response] = await Promise.all([saved,
    demo.click(demo.page.getByRole('button', { name: 'Apply to image', exact: true })),
  ]);
  if (!response.ok()) throw new Error('The difference range could not be applied.');
  const result = await response.json();
  demo.applied = true;
  const request = response.request().postDataJSON();
  if (request.current !== state.sceneIds[2] || request.reference !== state.sceneIds[1]
    || request.index !== 'NDVI' || request.class_index !== 0 || request.label_color !== '#ffe000' || request.layer !== DRAWING_LAYER
    || request.scope.kind !== 'viewport' || result.pixels_written <= 0 || !result.changed.length) {
    throw new Error('The applied mask did not match the expected dates, index, range and label.');
  }
  demo.result = { current: request.current, reference: request.reference, index: request.index,
    threshold, pixelsWritten: result.pixels_written, tilesChanged: result.changed.length };
  await demo.park();
  await demo.page.getByRole('status').filter({ hasText: /pixels labelled Open ground/ }).waitFor({ timeout: 60_000 });
  await demo.settle();
  await demo.hold(3500);
}

export async function cleanup(demo, { runtime, state }) {
  if (!demo.applied) return;
  await demo.page.getByRole('button', { name: 'Undo', exact: true }).click();
  demo.applied = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    if (await countSeriesLabels(demo.page, runtime.api, state, state.sceneIds[2]) === 0) return;
    await demo.hold(250);
  }
  throw new Error('The recorded mask could not be fully undone. Inspect the demo project before rerunning.');
}
