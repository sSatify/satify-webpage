import { createHash } from 'node:crypto';

export async function waitForCanvas(page) {
  const canvas = page.locator('.ol-paint-host').first();
  await canvas.waitFor({ state: 'visible' });
  let previous;
  for (let attempt = 0; attempt < 60; attempt++) {
    const busy = await page.locator('[aria-busy="true"]:visible').count();
    // Clipped screenshots can change Chromium's screencast surface mid-recording.
    // Keep the full viewport size while checking that rendering has settled.
    const digest = createHash('sha256').update(await page.screenshot()).digest('hex');
    if (!busy && digest === previous) return canvas;
    previous = busy ? undefined : digest;
    await page.waitForTimeout(250);
  }
  throw new Error('The image did not finish rendering. The recording cannot be accepted.');
}

export async function presentation(page, image = { width: 510, height: 510 }, frame = null) {
  await page.evaluate(frame => {
    const cursor = document.createElement('div');
    cursor.id = 'video-cursor';
    cursor.style.cssText = 'position:fixed;left:-100px;top:-100px;width:22px;height:22px;border:3px solid white;border-radius:50%;box-shadow:0 0 0 2px #111;transform:translate(-50%,-50%);pointer-events:none;z-index:2147483647';
    document.body.append(cursor);
    document.addEventListener('pointermove', event => {
      cursor.style.left = `${event.clientX}px`; cursor.style.top = `${event.clientY}px`;
    });
    document.addEventListener('pointerdown', () => { cursor.style.background = '#ffcc33aa'; });
    document.addEventListener('pointerup', () => { cursor.style.background = 'transparent'; });
    const caption = document.createElement('div');
    caption.id = 'video-caption';
    caption.hidden = true;
    caption.style.cssText = 'position:fixed;bottom:32px;left:50%;transform:translateX(-50%);max-width:85%;padding:12px 20px;border-radius:10px;background:#111e;color:white;font:28px/1.3 sans-serif;text-align:center;pointer-events:none;z-index:2147483646';
    if (frame) {
      caption.style.left = `${frame.clip.x + frame.clip.width / 2}px`;
      caption.style.bottom = `${innerHeight - frame.clip.y - frame.clip.height + 16}px`;
      caption.style.maxWidth = `${frame.clip.width - 110}px`;
      caption.style.fontSize = '21px';
      caption.style.padding = '8px 12px';
      cursor.style.width = '16px'; cursor.style.height = '16px';
    }
    document.body.append(caption);
  }, frame);
  let position = frame ? { x: frame.clip.x + frame.clip.width / 2, y: frame.clip.y + frame.clip.height / 2 }
    : { x: 40, y: 120 };
  async function move(target, duration = 300) {
    if (frame && (target.x < frame.clip.x + 10 || target.y < frame.clip.y + 10
      || target.x > frame.clip.x + frame.clip.width - 10 || target.y > frame.clip.y + frame.clip.height - 10)) {
      throw new Error('The demonstration pointer would leave the recorded frame.');
    }
    const start = { ...position };
    const steps = Math.max(1, Math.ceil(duration / 25));
    const began = performance.now();
    for (let step = 1; step <= steps; step++) {
      const fraction = step / steps;
      const eased = fraction * fraction * (3 - 2 * fraction);
      position = { x: start.x + (target.x - start.x) * eased, y: start.y + (target.y - start.y) * eased };
      await page.mouse.move(position.x, position.y);
      const delay = began + fraction * duration - performance.now();
      if (delay > 0) await page.waitForTimeout(delay);
    }
  }
  async function click(locator, { x = 0.5, y = 0.5 } = {}) {
    await locator.waitFor({ state: 'visible' });
    if (!await locator.isEnabled()) throw new Error('The demonstration control is not ready.');
    const box = await locator.boundingBox();
    if (frame && (box.x < frame.clip.x || box.y < frame.clip.y
      || box.x + box.width > frame.clip.x + frame.clip.width
      || box.y + box.height > frame.clip.y + frame.clip.height)) {
      throw new Error('A demonstration control is outside the recorded frame.');
    }
    await move({ x: box.x + box.width * x, y: box.y + box.height * y });
    await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
    await page.waitForTimeout(120);
  }
  return {
    page, image, move, click,
    async settle() { await waitForCanvas(page); },
    async stroke(points, duration) {
      await move(await this.point(...points[0]), 600);
      const saved = page.waitForResponse(response => response.request().method() === 'PUT'
        && response.url().includes('/labeltiles/'), { timeout: 30_000 });
      const drawing = (async () => {
        await page.mouse.down();
        try {
          for (const point of points.slice(1)) await move(await this.point(...point), duration / (points.length - 1));
        } finally { await page.mouse.up(); }
      })();
      const [response] = await Promise.all([saved, drawing]);
      if (!response.ok()) throw new Error('The Pen stroke could not be saved.');
    },
    async fill(x, y, scope = 'Local') {
      const saved = page.waitForResponse(response => response.request().method() === 'POST'
        && response.url().includes('/session/fill/'), { timeout: 30_000 });
      const [response] = await Promise.all([saved, (async () => {
        await page.mouse.down(); await page.waitForTimeout(100); await page.mouse.up();
      })()]);
      if (!response.ok()) throw new Error('The Smart Fill region could not be saved.');
      const body = response.request().postDataJSON();
      if (Math.abs(body.x - x * image.width) > 2 || Math.abs(body.y - y * image.height) > 2
        || body.by_label !== (scope !== 'Local') || ('viewport' in body) !== (scope !== 'Global')) {
        throw new Error(`Smart Fill did not target the expected ${scope} region.`);
      }
    },
    async park() {
      if (frame?.restOnPanel) {
        // The card's bottom padding clears the map preview and keeps the cursor visible.
        // Its title has an animated tooltip, so do not rest there.
        const box = await page.locator('.editor-tool-hint').boundingBox();
        await move({ x: box.x + 14, y: box.y + box.height - 12 }, 450);
      } else if (frame) {
        const [x, y] = frame.restAt ?? [0.85, 0.8];
        await move({ x: frame.clip.x + frame.clip.width * x, y: frame.clip.y + frame.clip.height * y }, 450);
      } else await move({ x: 40, y: 120 });
    },
    async zoomAt(factor, anchor) {
      if (!frame || !Number.isFinite(factor) || factor <= 0) throw new Error('Zoom needs a framed scene and a positive factor.');
      const before = await page.locator('.ol-paint-host').first().boundingBox();
      await move(anchor);
      let levels = Math.log2(factor);
      while (Math.abs(levels) > 0.001) {
        const step = Math.sign(levels) * Math.min(1, Math.abs(levels));
        await page.mouse.wheel(0, -300 * step);
        await page.waitForTimeout(400);
        levels -= step;
      }
      frame.target = { x: anchor.x + (frame.target.x - anchor.x) * factor,
        y: anchor.y + (frame.target.y - anchor.y) * factor };
      frame.scale *= factor;
      return { x: anchor.x + (before.x - anchor.x) * factor,
        y: anchor.y + (before.y - anchor.y) * factor,
        width: before.width * factor, height: before.height * factor };
    },
    async viewportOutline(box) {
      await page.evaluate(box => {
        document.getElementById('video-viewport-outline')?.remove();
        if (!box) return;
        const outline = document.createElement('div');
        outline.id = 'video-viewport-outline';
        outline.style.cssText = `position:fixed;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;box-sizing:border-box;border:2px dashed #ffdd55;pointer-events:none;z-index:2147483645`;
        const label = document.createElement('span');
        label.textContent = 'Original viewport';
        label.style.cssText = 'position:absolute;left:0;bottom:-24px;white-space:nowrap;background:#111e;color:#ffdd55;font:16px/20px sans-serif;padding:1px 5px;border-radius:3px';
        outline.append(label);
        document.body.append(outline);
      }, box);
    },
    // Captions accompany the action; only explicit result holds add screen time.
    async caption(text, hold = 0) {
      await page.locator('#video-caption').evaluate((element, text) => {
        element.textContent = text; element.hidden = !text;
      }, text);
      if (hold > 0) await page.waitForTimeout(hold);
    },
    async choose(name) {
      const button = page.getByRole('button', { name, exact: true });
      await click(button);
    },
    async point(x, y) {
      if (frame) return { x: frame.target.x + (x - frame.focus[0]) * image.width * frame.scale,
        y: frame.target.y + (y - frame.focus[1]) * image.height * frame.scale };
      const box = await page.locator('.ol-paint-host').first().boundingBox();
      // SATIFY fits [0, 0, nativeWidth, nativeHeight] without padding. Use image
      // coordinates so letterboxing and panel widths do not shift the subject.
      const scale = Math.min(box.width / image.width, box.height / image.height);
      return { x: box.x + box.width / 2 + (x - 0.5) * image.width * scale,
        y: box.y + box.height / 2 + (y - 0.5) * image.height * scale };
    },
    async hold(ms) { await page.waitForTimeout(ms); },
  };
}
