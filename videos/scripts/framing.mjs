import { waitForCanvas } from './presentation.mjs';

// Per-scenario camera settings live beside the scenario, in native-image fractions.
// Navigation uses the real Pan tool and wheel, never application-store mutations.
export async function frameScene(page, image, framing) {
  const { width, height } = framing;
  const viewportWidth = framing.viewportWidth ?? width;
  await page.setViewportSize({ width: viewportWidth, height: height + 100 });
  const canvas = page.locator('.ol-paint-host').first();
  await canvas.waitFor({ state: 'visible' });
  let box = await canvas.boundingBox();
  const bottomBorder = height + 100 - box.y - box.height;
  await page.setViewportSize({ width: viewportWidth, height: Math.ceil(box.y + height + bottomBorder) });
  await page.getByRole('button', { name: 'Pan', exact: true }).click();
  await page.getByRole('button', { name: 'Fit image', exact: true }).click();
  await waitForCanvas(page);
  box = await canvas.boundingBox();
  const clip = { x: 0, y: Math.ceil(box.y), width, height };
  const scale = Math.min(box.width / image.width, box.height / image.height);
  const [fx, fy] = framing.focus;
  const anchor = { x: box.x + box.width / 2 + (fx - 0.5) * image.width * scale,
    y: box.y + box.height / 2 + (fy - 0.5) * image.height * scale };
  await page.mouse.move(anchor.x, anchor.y);
  // OL's wheel uses 300 delta units per zoom level (a 2x magnification).
  // Send separate <= 1-level steps to avoid its per-event zoom clamp.
  let levels = Math.log2(framing.zoom);
  while (levels > 0.001) {
    const step = Math.min(1, levels);
    await page.mouse.wheel(0, -300 * step);
    await page.waitForTimeout(400);
    levels -= step;
  }
  const target = { x: clip.x + width * framing.subjectAt[0], y: clip.y + height * framing.subjectAt[1] };
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 30 });
  // Pause before releasing so kinetic panning cannot move the scripted target.
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.mouse.move(10, 10);
  await waitForCanvas(page);
  return { clip, focus: framing.focus, target, scale: scale * framing.zoom,
    panelAt: framing.panelAt, viewport: page.viewportSize() };
}

export async function placeToolPanel(page, frame) {
  const grip = page.getByTestId('tool-hint-drag-handle');
  await grip.waitFor({ state: 'visible' });
  // Clear a remembered drag from a previous scenario before placing this card.
  await grip.dblclick();
  const card = await page.locator('.editor-tool-hint').boundingBox();
  const handle = await grip.boundingBox();
  const x = handle.x + handle.width / 2, y = handle.y + handle.height / 2;
  const desiredLeft = frame.clip.x + frame.clip.width * frame.panelAt[0] - card.width / 2;
  const desiredTop = frame.clip.y + frame.clip.height * frame.panelAt[1];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + desiredLeft - card.x, y + desiredTop - card.y, { steps: 20 });
  await page.mouse.up();
  await page.mouse.move(10, 10);
}
