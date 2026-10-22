import { spawnSync } from 'node:child_process';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { resetProject } from './project.mjs';
import { root, writeJson } from './runtime.mjs';
import { presentation, waitForCanvas } from './presentation.mjs';
import { frameScene, placeToolPanel } from './framing.mjs';
import pen, { framing as penFraming, prepare as preparePen, showcase as penShowcase } from '../scenarios/pen.mjs';
import smartFill, { framing as smartFillFraming, prepare as prepareSmartFill, showcase as smartFillShowcase } from '../scenarios/smart-fill.mjs';
import changeDetection, * as change from '../scenarios/change-detection.mjs';

export const scenarios = { pen: { dataset: 'tools', run: pen, prepare: preparePen, framing: penFraming, showcase: penShowcase },
  'smart-fill': { dataset: 'tools', run: smartFill, prepare: prepareSmartFill, framing: smartFillFraming, showcase: smartFillShowcase },
  'change-detection': { ...change, run: changeDetection } };

export function showcasePreview(name, showcase, output = { width: 500, height: 450 }, { keepOnlyOutput = false } = {}) {
  const escape = value => String(value).replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(showcase.title)} — SATIFY showcase review</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f4f5ef;color:#18362b;font:16px/1.6 system-ui,sans-serif;padding:clamp(16px,4vw,48px)}main{max-width:${output.width >= 1000 ? output.width + 500 : output.width > 500 ? 1280 : 1000}px;margin:auto;display:grid;grid-template-columns:minmax(0,${output.width}px) minmax(0,1fr);gap:clamp(24px,5vw,64px);align-items:center}video{display:block;width:100%;height:auto;aspect-ratio:${output.width}/${output.height};background:#18231e;border-radius:12px}h1{font-size:clamp(26px,4vw,38px);line-height:1.15;margin:0 0 16px}p{margin:0 0 16px}.eyebrow{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#437c5a}.review{font-size:13px;color:#647268}@media(max-width:${output.width >= 1000 ? output.width + 400 : output.width > 500 ? 1100 : 720}px){main{grid-template-columns:minmax(0,${output.width}px);justify-content:center}}</style>
<main><video controls playsinline muted loop preload="metadata" poster="poster.png" aria-label="${escape(showcase.title)}"><source src="${escape(name)}.mp4" type="video/mp4"></video>
<section><p class="eyebrow">SATIFY · ${escape(showcase.category ?? (name === 'pen' ? 'Manual annotation' : 'Smart Fill'))}</p><h1>${escape(showcase.title)}</h1><p>${escape(showcase.description)}</p><p class="review">Review preview · ${output.width} × ${output.height} video · silent playback. Text sits beside the video when space permits and below it on narrower screens.${keepOnlyOutput ? '' : ` <a href="${escape(name)}-unscaled.mp4">Unscaled MP4</a>`}</p></section></main></html>`;
}
export function requireFfmpeg() {
  const check = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8', windowsHide: true });
  if (check.error || check.status !== 0) throw new Error('Install FFmpeg and add it to PATH before recording.');
}

export function exportMp4(input, output, { unscaled = false, width = 500, height = 450 } = {}) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input,
    ...(!unscaled ? ['-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`] : []),
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

export async function exportRecordingVideos(directory, name, frame, output, { keepOnlyOutput = false } = {}) {
  const capture = resolve(directory, 'capture.webm');
  const raw = resolve(directory, `${name}.webm`);
  const mp4 = resolve(directory, `${name}.mp4`);
  cropWebm(capture, raw, frame.clip);
  if (keepOnlyOutput) {
    exportMp4(raw, mp4, output);
    // Remove intermediate videos only after the final MP4 was exported successfully.
    await unlink(raw);
    await unlink(capture);
    return { mp4 };
  }
  exportMp4(raw, resolve(directory, `${name}-unscaled.mp4`), { unscaled: true });
  exportMp4(raw, mp4, output);
  return {
    mp4,
    unscaledOutput: { file: `${name}-unscaled.mp4`, width: frame.clip.width, height: frame.clip.height },
    sourceCapture: { file: 'capture.webm', width: frame.viewport.width, height: frame.viewport.height },
  };
}

export async function record(runtime, config, scene, state, name, { assets = [{ scene }] } = {}) {
  const scenario = scenarios[name];
  if (!scenario) throw new Error(`Unknown scenario: ${name}`);
  if (scenario.dataset !== config.dataset) throw new Error('The recording scenario does not match the selected dataset.');
  const output = scenario.output ?? { width: 500, height: 450 };
  const context = { runtime, config, scene, state, assets };
  // The caller has no open app pages while resetting, so no autosave races us.
  if (config.dataset === 'tools') await resetProject({ api: runtime.api, config, scene, state });
  const directory = resolve(root, 'output', new Date().toISOString().replace(/[:.]/g, '-') + '-' + name);
  await mkdir(directory, { recursive: true });
  const page = await runtime.context.newPage();
  let recording = false;
  let demo;
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
      && (state.sceneIds ?? [state.sceneId]).some(id => response.url().includes(encodeURIComponent(id)))
      && (/\/tiles\//.test(response.url()) || /\/preview(?:\/|\?)/.test(response.url())), { timeout: 60_000 });
    const [response] = await Promise.all([opened, imageLoaded,
      page.getByRole('button', { name: `Open ${config.projectName} in editor`, exact: true }).click(),
    ]);
    const openedProject = await response.json();
    if (!response.ok() || openedProject.sid !== state.sid) throw new Error('The editor did not open the managed project.');
    context.manifest = openedProject.manifest;
    if (!scenario.createFrame) {
      await page.getByRole('button', { name: 'Fit image', exact: true }).click();
      await waitForCanvas(page);
    }
    if (name === 'smart-fill') {
      await page.waitForFunction(() => {
        const button = document.querySelector('button[aria-label="Smart fill"]');
        return button && !button.disabled;
      }, null, { timeout: 60_000 });
    }
    const frame = scenario.createFrame ? await scenario.createFrame(page, context)
      : await frameScene(page, scene, scenario.framing);
    if (!scenario.createFrame) {
      await page.getByRole('button', { name: scenario.framing.tool, exact: true }).click();
      await placeToolPanel(page, frame);
      await scenario.prepare(page);
    }
    demo = await presentation(page, scene, frame);
    await demo.park();
    await demo.settle();
    await page.screenshot({ path: resolve(directory, 'before.png'), clip: frame.clip });
    const capture = resolve(directory, 'capture.webm');
    await page.screencast.start({ path: capture, size: frame.viewport, fps: 30 });
    recording = true;
    await scenario.run(demo, context);
    // A successful first tile response is insufficient for a multi-tile stroke.
    for (let attempt = 0; pendingWrites.size && attempt < 120; attempt++) await page.waitForTimeout(250);
    if (pendingWrites.size || failedWrites.length) throw new Error(failedWrites[0] || 'Editor writes did not finish.');
    await page.screencast.stop();
    recording = false;
    await page.screenshot({ path: resolve(directory, 'poster.png'), clip: frame.clip });
    await scenario.cleanup?.(demo, context);
    const { mp4, unscaledOutput, sourceCapture } = await exportRecordingVideos(directory, name, frame, output, scenario);
    await writeJson(resolve(directory, 'recording.json'), {
      scenario: name, style: 'website-showcase', showcase: scenario.showcase,
      baseUrl: config.baseUrl, projectId: state.sid,
      sceneSha256: scene.sha256, setupKey: state.setupKey, viewport: frame.viewport,
      scenes: assets.map(({ scene }, index) => ({ file: scene.file, sha256: scene.sha256,
        date: scene.acquisition_date, sceneId: state.sceneIds?.[index] ?? state.sceneId })),
      framing: scenario.framing, crop: frame.clip,
      recordedAt: new Date().toISOString(), output, result: demo.result,
      unscaledOutput, sourceCapture,
      review: `Review the before/result contrast and honest tool behaviour at ${output.width} x ${output.height}, plus the mobile layout, before publication.`,
    });
    await writeFile(resolve(directory, 'preview.html'), showcasePreview(name, scenario.showcase, output, scenario));
    console.log(`Recorded ${mp4}`);
  } catch (error) {
    await page.screenshot({ path: resolve(directory, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    if (recording) await page.screencast.stop().catch(() => {});
    try { if (demo?.applied) await scenario.cleanup?.(demo, context); }
    finally { await page.close(); }
  }
}
