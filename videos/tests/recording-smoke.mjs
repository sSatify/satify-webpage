// Browser/media smoke test, separate from SATIFY's authenticated end-to-end check.
import assert from 'node:assert/strict';
import { chromium } from '../scripts/browser.mjs';
import { mkdir, mkdtemp, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { presentation } from '../scripts/presentation.mjs';
import { cropWebm, exportMp4, exportRecordingVideos, showcasePreview, scenarios } from '../scripts/record.mjs';
import { countSeriesLabels } from '../scripts/series-recording.mjs';

const directory = resolve('output', 'recording-smoke');
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  await page.setContent(`<style>body{margin:0;background:#cde}button{font:24px sans-serif;margin:30px;padding:12px}.ol-paint-host{position:absolute;left:140px;top:140px;width:700px;height:650px;background:#497d45}</style><button aria-label="Pen">Pen</button><div class="ol-paint-host"></div>`);
  await page.evaluate(() => {
    window.clicks = 0;
    document.querySelector('button').addEventListener('click', () => window.clicks++);
  });
  const demo = await presentation(page);
  assert.ok(await page.locator('#video-caption').isHidden(), 'Showcases must not start with an empty caption box');
  const raw = resolve(directory, 'smoke.webm');
  await page.screencast.start({ path: raw, size: { width: 1000, height: 900 }, fps: 30 });
  await demo.caption('Recording infrastructure check', 350);
  await demo.choose('Pen');
  await demo.move(await demo.point(0.5, 0.5));
  await demo.hold(400);
  await demo.settle();
  assert.equal(await page.evaluate(() => window.clicks), 1, 'The visible pointer must operate the real button');
  await page.screenshot({ path: resolve(directory, 'smoke.png') });
  await page.screencast.stop();
  assert.ok((await stat(raw)).size > 1000);
  const mp4 = resolve(directory, 'smoke.mp4');
  exportMp4(raw, mp4);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height,codec_name:format=duration', '-of', 'json', mp4], { encoding: 'utf8', windowsHide: true });
  assert.equal(probe.status, 0, probe.stderr);
  const info = JSON.parse(probe.stdout);
  assert.equal(info.streams[0].width, 500);
  assert.equal(info.streams[0].height, 450);
  assert.equal(info.streams[0].codec_name, 'h264');
  assert.ok(Number(info.format.duration) > 1);
  const cropped = resolve(directory, 'cropped.webm');
  cropWebm(raw, cropped, { x: 0, y: 100, width: 600, height: 540 });
  const cropProbe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', cropped], { encoding: 'utf8', windowsHide: true });
  assert.equal(cropProbe.status, 0, cropProbe.stderr);
  const cropInfo = JSON.parse(cropProbe.stdout);
  assert.equal(cropInfo.streams[0].width, 600);
  assert.equal(cropInfo.streams[0].height, 540);
  const unscaled = resolve(directory, 'cropped-unscaled.mp4');
  exportMp4(cropped, unscaled, { unscaled: true });
  const nativeProbe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height,codec_name', '-of', 'json', unscaled], { encoding: 'utf8', windowsHide: true });
  assert.equal(nativeProbe.status, 0, nativeProbe.stderr);
  const nativeInfo = JSON.parse(nativeProbe.stdout);
  assert.equal(nativeInfo.streams[0].width, 600);
  assert.equal(nativeInfo.streams[0].height, 540);
  assert.equal(nativeInfo.streams[0].codec_name, 'h264');
  assert.ok((await stat(raw)).size > 1000, 'Exports must retain the original capture');
  exportMp4(cropped, resolve(directory, 'cropped.mp4'));
  const series = scenarios['change-detection'];
  const largeDirectory = await mkdtemp(resolve(directory, 'large-only-'));
  await page.setViewportSize(series.framing.viewport);
  await page.screencast.start({ path: resolve(largeDirectory, 'capture.webm'), size: series.framing.viewport, fps: 30 });
  await page.waitForTimeout(500);
  await page.screencast.stop();
  const largeExports = await exportRecordingVideos(largeDirectory, 'change-detection', {
    clip: { x: 0, y: 0, width: series.framing.width, height: series.framing.height },
    viewport: series.framing.viewport,
  }, series.output, series);
  assert.deepEqual(await readdir(largeDirectory), ['change-detection.mp4'], 'Only the large MP4 should remain');
  assert.equal(largeExports.unscaledOutput, undefined);
  assert.equal(largeExports.sourceCapture, undefined);
  const larger = largeExports.mp4;
  const largerProbe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', larger], { encoding: 'utf8', windowsHide: true });
  assert.equal(largerProbe.status, 0, largerProbe.stderr);
  assert.deepEqual(JSON.parse(largerProbe.stdout).streams[0], { width: 1200, height: 1080 });
  const fixture = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 4;
    canvas.getContext('2d').fillRect(1, 1, 1, 1);
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
  const api = async (_method, path) => path.includes('.png')
    ? (path.includes('/0/0.png') ? fixture : null) : { tiles: [{ x: 0, y: 0 }, { x: 0, y: 1 }] };
  const binding = { sid: 'managed', sceneIds: ['series.tif'] };
  assert.equal(await countSeriesLabels(page, api, binding, 'series.tif'), 1);
  await assert.rejects(countSeriesLabels(page, api, binding, 'foreign.tif'), /outside the managed series/);
  await demo.park();
  // Check the same preview markup the recorder emits, including proportional mobile sizing.
  await page.setContent(showcasePreview('smart-fill', scenarios['smart-fill'].showcase));
  await page.setViewportSize({ width: 1200, height: 900 });
  const desktopVideo = await page.locator('video').boundingBox();
  const desktopCopy = await page.locator('section').boundingBox();
  assert.equal(desktopVideo.width, 500);
  assert.equal(desktopVideo.height, 450);
  assert.ok(desktopCopy.x >= desktopVideo.x + desktopVideo.width);
  await page.setViewportSize({ width: 375, height: 812 });
  const mobileVideo = await page.locator('video').boundingBox();
  const mobileCopy = await page.locator('section').boundingBox();
  assert.ok(mobileVideo.width <= 343);
  assert.ok(Math.abs(mobileVideo.width / mobileVideo.height - 10 / 9) < 0.01);
  assert.ok(mobileCopy.y >= mobileVideo.y + mobileVideo.height);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setContent(showcasePreview('change-detection', scenarios['change-detection'].showcase,
    series.output, series));
  await page.setViewportSize({ width: 1600, height: 1000 });
  assert.equal((await page.locator('video').boundingBox()).width, 1200);
  assert.equal((await page.locator('video').boundingBox()).height, 1080);
  assert.equal(await page.getByRole('link', { name: 'Unscaled MP4' }).count(), 0);
  assert.equal(await page.locator('video source').getAttribute('src'), 'change-detection.mp4');
  await page.setViewportSize({ width: 1000, height: 1000 });
  const seriesVideo = await page.locator('video').boundingBox();
  assert.ok((await page.locator('section').boundingBox()).y >= seriesVideo.y + seriesVideo.height);
  await page.setViewportSize({ width: 375, height: 812 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  // Every interpolated pointer position, including rest moves, must remain visible.
  const framedPage = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const clip = { x: 100, y: 100, width: 600, height: 540 };
  for (const restOnPanel of [false, true]) {
    await framedPage.setContent('<div class="editor-tool-hint" style="position:absolute;left:130px;top:130px;width:280px;height:220px"><input aria-label="Source mask" type="range" min="0" max="15" value="0" style="width:180px;margin:20px"></div>');
    await framedPage.evaluate(() => {
      window.pointerPositions = [];
      document.addEventListener('pointermove', event => window.pointerPositions.push([event.clientX, event.clientY]));
    });
    const framedDemo = await presentation(framedPage, { width: 510, height: 510 },
      { clip, restOnPanel, restAt: [0.82, 0.78] });
    await framedDemo.park();
    await framedDemo.move({ x: 550, y: 500 });
    await framedDemo.click(framedPage.getByRole('slider'), { x: 0.98 });
    assert.equal(await framedPage.getByRole('slider').inputValue(), '15');
    await framedDemo.park();
    const positions = await framedPage.evaluate(() => window.pointerPositions);
    assert.ok(positions.length > 2);
    assert.ok(positions.every(([x, y]) => x >= clip.x + 10 && y >= clip.y + 10
      && x <= clip.x + clip.width - 10 && y <= clip.y + clip.height - 10));
    await assert.rejects(framedDemo.move({ x: 10, y: 10 }), /leave the recorded frame/);
    const cursor = await framedPage.locator('#video-cursor').boundingBox();
    assert.ok(cursor.x >= clip.x && cursor.x + cursor.width <= clip.x + clip.width);
    assert.ok(cursor.y >= clip.y && cursor.y + cursor.height <= clip.y + clip.height);
  }
  await framedPage.close();
  console.log('Browser cursor visibility, click, caption, retained WebM capture, unscaled and 500 x 450 H.264 exports, and responsive showcase preview passed. This is a synthetic page, not a SATIFY tool recording.');
} finally { await browser.close(); }
