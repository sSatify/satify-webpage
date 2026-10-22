import { DRAWING_LAYER } from './project.mjs';

// Read the real saved PNGs, including transparent tiles left by Undo. A tile
// listing alone cannot tell whether a managed demo scene already contains edits.
export async function countSeriesLabels(page, api, state, folder) {
  if (!state.sceneIds.includes(folder)) throw new Error('The recording scene is outside the managed series.');
  const path = `/session/labeltiles/${encodeURIComponent(folder)}/${encodeURIComponent(DRAWING_LAYER)}`;
  const query = `sid=${encodeURIComponent(state.sid)}`;
  const { tiles } = await api('GET', `${path}?${query}`);
  let count = 0;
  for (const { x, y } of tiles) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) throw new Error('Invalid label tile coordinates.');
    const png = await api('GET', `${path}/${x}/${y}.png?${query}`, { responseType: 'buffer', allowNotFound: true });
    // Undo may delete an empty PNG before its old listing revision disappears.
    if (png === null) continue;
    count += await page.evaluate(async base64 => {
      const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0); bitmap.close();
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let painted = 0;
      for (let offset = 3; offset < data.length; offset += 4) if (data[offset]) painted++;
      return painted;
    }, png.toString('base64'));
  }
  return count;
}

export async function tidySeriesView(page) {
  const hide = page.getByRole('button', { name: 'Hide settings and labels', exact: true });
  if (await hide.count()) await hide.click();
  const help = page.locator('#editorInteractionHost').getByRole('button', { name: 'Controls reference', exact: true });
  if (await help.getAttribute('aria-expanded') === 'true') await help.click();
}
