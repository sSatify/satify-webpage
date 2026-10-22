import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { resetProject } from './project.mjs';
import { root, writeJson } from './runtime.mjs';
import { presentation, waitForCanvas } from './presentation.mjs';
import { frameScene, placeToolPanel } from './framing.mjs';
import pen, { framing as penFraming } from '../scenarios/pen.mjs';
import smartFill, { framing as smartFillFraming } from '../scenarios/smart-fill.mjs';

export const scenarios = { pen: { run: pen, framing: penFraming },
  'smart-fill': { run: smartFill, framing: smartFillFraming } };
export function requireFfmpeg() {
  const check = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8', windowsHide: true });
  if (check.error || check.status !== 0) throw new Error('Install FFmpeg and add it to PATH before recording.');
}

export function exportMp4(input, output) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input,
    '-vf', 'scale=500:450:force_original_aspect_ratio=decrease,pad=500:450:(ow-iw)/2:(oh-ih)/2',
    '-an', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output],
  { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`Video export failed: ${result.stderr || result.error?.message}`);
}

export function cropWebm(input, output, clip) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input,
    '-vf', `crop=${clip.width}:${clip.height}:${clip.x}:${clip.y}`,
    '-an', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '6', '-crf', '24', '-b:v', '0', output],
  { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`Video crop failed: ${result.stderr || result.error?.message}`);
}

export async function record(runtime, config, scene, state, name) {
  const scenario = scenarios[name];
  if (!scenario) throw new Error(`Unknown scenario: ${name}`);
  // The caller has no open app pages while resetting, so no autosave races us.
  await resetProject({ api: runtime.api, config, scene, state });
  const directory = resolve(root, 'output', new Date().toISOString().replace(/[:.]/g, '-') + '-' + name);
  await mkdir(directory, { recursive: true });
  const page = await runtime.context.newPage();
  let recording = false;
  const failedWrites = [];
  const pendingWrites = new Set();
  const isWrite = request => request.url().startsWith(config.baseUrl + config.apiPath + '/')
    && ['POST', 'PUT', 'DELETE'].includes(request.method());
  page.on('request', request => { if (isWrite(request)) pendingWrites.add(request); });
  page.on('requestfinished', request => pendingWrites.delete(request));
  page.on('requestfailed', request => {
    pendingWrites.delete(request);
    if (isWrite(request)) failedWrites.push('A server write failed during the demonstration.');
  });
  page.on('response', response => {
    if (isWrite(response.request()) && !response.ok()) failedWrites.push(`A server write returned ${response.status()}.`);
  });
  try {
    await page.goto(config.baseUrl + '/data-store', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    const opened = page.waitForResponse(response =>
      response.url().endsWith('/session/switch') && response.request().method() === 'POST');
    const imageLoaded = page.waitForResponse(response => response.ok()
      && response.url().startsWith(config.baseUrl + config.apiPath + '/')
      && response.url().includes(encodeURIComponent(state.sceneId))
      && (/\/tiles\//.test(response.url()) || /\/preview(?:\/|\?)/.test(response.url())), { timeout: 60_000 });
    const [response] = await Promise.all([opened, imageLoaded,
      page.getByRole('button', { name: `Open ${config.projectName} in editor`, exact: true }).click(),
    ]);
    if (!response.ok() || (await response.json()).sid !== state.sid) throw new Error('The editor did not open the managed project.');
    await page.getByRole('button', { name: 'Fit image', exact: true }).click();
    await waitForCanvas(page);
    if (name === 'smart-fill') {
      await page.waitForFunction(() => {
        const button = document.querySelector('button[aria-label="Smart fill"]');
        return button && !button.disabled;
      }, null, { timeout: 60_000 });
    }
    const frame = await frameScene(page, scene, scenario.framing);
    await page.getByRole('button', { name: scenario.framing.tool, exact: true }).click();
    await placeToolPanel(page, frame);
    if (name === 'smart-fill') {
      // Mask source is viewer state. Always start at the first eligible mask.
      await page.getByRole('slider', { name: 'Source mask', exact: true }).press('Home');
      await page.getByRole('radio', { name: /^Local:/ }).click();
    }
    const demo = await presentation(page, scene, frame);
    const capture = resolve(directory, 'capture.webm');
    const raw = resolve(directory, `${name}.webm`);
    await page.screencast.start({ path: capture, size: frame.viewport, fps: 30 });
    recording = true;
    await scenario.run(demo);
    // A successful first tile response is insufficient for a multi-tile stroke.
    for (let attempt = 0; pendingWrites.size && attempt < 120; attempt++) await page.waitForTimeout(250);
    if (pendingWrites.size || failedWrites.length) throw new Error(failedWrites[0] || 'Editor writes did not finish.');
    await page.screenshot({ path: resolve(directory, 'poster.png'), clip: frame.clip });
    await page.screencast.stop();
    recording = false;
    const mp4 = resolve(directory, `${name}.mp4`);
    cropWebm(capture, raw, frame.clip);
    exportMp4(raw, mp4);
    await unlink(capture);
    await writeJson(resolve(directory, 'recording.json'), {
      scenario: name, baseUrl: config.baseUrl, projectId: state.sid,
      sceneSha256: scene.sha256, setupKey: state.setupKey, viewport: frame.viewport,
      framing: scenario.framing, crop: frame.clip,
      recordedAt: new Date().toISOString(), output: { width: 500, height: 450 },
      review: 'Review framing, captions and tool behaviour at 500 x 450 before publication.',
    });
    await writeFile(resolve(directory, 'preview.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>${name} demonstration</title><style>body{font:16px sans-serif;background:#eee;padding:24px}video{display:block;background:#111;width:500px;height:450px;max-width:100%}</style><h1>${name}</h1><video controls playsinline muted loop preload="metadata" poster="poster.png"><source src="${name}.mp4" type="video/mp4"></video><p>Review at the intended 500 × 450 playback size.</p></html>`);
    console.log(`Recorded ${mp4}`);
  } catch (error) {
    await page.screenshot({ path: resolve(directory, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    if (recording) await page.screencast.stop().catch(() => {});
    await page.close();
  }
}
