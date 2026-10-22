// Browser/media smoke test, separate from SATIFY's authenticated end-to-end check.
import assert from 'node:assert/strict';
import { chromium } from '../scripts/browser.mjs';
import { mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { presentation } from '../scripts/presentation.mjs';
import { cropWebm, exportMp4 } from '../scripts/record.mjs';

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
  const raw = resolve(directory, 'smoke.webm');
  await page.screencast.start({ path: raw, size: { width: 1000, height: 900 }, fps: 30 });
  await demo.caption('Recording infrastructure check', 350);
  await demo.choose('Pen');
  await demo.move(await demo.point(0.5, 0.5));
  await demo.hold(400);
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
  exportMp4(cropped, resolve(directory, 'cropped.mp4'));
  console.log('Browser cursor, click, caption, WebM capture and 500 x 450 H.264 export passed. This is a synthetic page, not a SATIFY tool recording.');
} finally { await browser.close(); }
