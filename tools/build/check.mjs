import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('../../web/', import.meta.url));
const webFile = path => resolve(web, path);
const pages = ['index.html', 'tools/index.html', 'imprint/index.html', 'privacy/index.html'];
const unlistedPages = ['tools/index.html'];
let links = 0;
for (const page of pages) {
  const html = await readFile(webFile(page), 'utf8');
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${page}: exactly one main heading`);
  assert.match(html, /<html lang="en">/, `${page}: document language`);
  assert.match(html, /name="viewport"/, `${page}: responsive viewport`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, `${page}: unique element IDs`);
  for (const [, value] of html.matchAll(/(?:href|src|poster)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|tel:)/.test(value)) continue;
    assert(!value.startsWith('/'), `${page}: relative paths must work on GitHub project Pages`);
    const [path, fragment] = value.split('#');
    let target = path ? resolve(dirname(webFile(page)), path) : webFile(page);
    if ((await stat(target)).isDirectory()) target = resolve(target, 'index.html');
    if (!unlistedPages.includes(page)) {
      for (const unlisted of unlistedPages) assert.notEqual(target, webFile(unlisted), `${page}: the tool gallery stays unlisted until the homepage update`);
    }
    if (fragment) assert.match(await readFile(target, 'utf8'), new RegExp(`id="${fragment}"`), `${page}: valid fragment ${value}`);
    links++;
  }
}
const css = await readFile(webFile('styles.css'), 'utf8');
const sourceFile = path => resolve(web, '../tools/videos/assets/sources', path);
const recordings = JSON.parse(await readFile(sourceFile('recordings.json'), 'utf8'));
assert.deepEqual(recordings.map(recording => recording.scenario).sort(), ['propagate', 'smart-fill', 'time-series']);
for (const recording of recordings) {
  if (['smart-fill', 'time-series'].includes(recording.scenario)) {
    assert.equal(recording.origin, 'http://127.0.0.1:3030', `${recording.scenario}: local app recording`);
    assert.equal(recording.appVersion, 'v3.0.1-local', `${recording.scenario}: updated local app`);
    assert.equal(recording.explainerVideos, 'off', `${recording.scenario}: Tool videos disabled`);
    if (recording.scenario === 'smart-fill') assert(recording.duration <= 25, 'Smart Fill: at most 25 seconds');
  } else {
    assert.equal(recording.origin, 'https://app.satify.tech', `${recording.scenario}: production recording`);
  }
  assert.equal(recording.theme, 'dark', `${recording.scenario}: dark recording`);
  const bytes = await readFile(sourceFile(`${recording.scenario}.mp4`));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), recording.sha256, `${recording.scenario}: selected video matches its provenance`);
}
const modes = recordings.find(recording => recording.scenario === 'smart-fill').verifiedModes;
assert(modes && modes.Local > 0 && modes['In viewport'] > modes.Local && modes.Global > modes['In viewport'],
  'Smart Fill must demonstrate three distinct saved scopes');
const classes = recordings.find(recording => recording.scenario === 'time-series').verifiedClasses;
assert(classes && ['Water', 'Seagrass'].every(name => classes[name]?.length === 3 && classes[name].every(count => count > 0)),
  'Sync labelling must save both classes across all three dates');
for (const page of unlistedPages) assert.match(await readFile(webFile(page), 'utf8'), /<meta name="robots" content="noindex">/, `${page}: opt out of search indexing`);
const gallery = await readFile(webFile('tools/index.html'), 'utf8');
for (const retired of ['app', 'app2']) {
  assert(!(await readdir(web)).includes(retired), `${retired}: retired page removed`);
}
assert.deepEqual(await readdir(webFile('assets/videos')), ['gallery'], 'Only selected gallery assets are published');
for (const name of ['rivers-roads', 'change-detection']) {
  const capture = JSON.parse(await readFile(sourceFile(`${name}.json`), 'utf8'));
  assert.equal(capture.rawVideo, `${name}.webm`, `${name}: portable capture path`);
  const bytes = await readFile(sourceFile(capture.rawVideo));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), capture.rawSha256, `${name}: retained raw source matches its manifest`);
}
const clips = JSON.parse(await readFile(webFile('assets/videos/gallery/clips.json'), 'utf8'));
assert.deepEqual(clips.map(clip => clip.id), ['smart-fill', 'rivers-roads', 'time-series', 'change-detection', 'propagate']);
for (const clip of clips) {
  assert.equal(clip.durationSeconds, clip.id === 'change-detection' ? 8 : 5, `${clip.id}: approved short duration`);
  assert.equal(clip.width, 1280);
  assert.equal(clip.height, 720);
  assert.equal(clip.fps, 30);
  assert.equal(clip.audio, 'none', `${clip.id}: silent gallery clip`);
  assert(['annotation', 'temporal'].includes(clip.category));
  for (const [file, digest] of [[clip.file, clip.sha256], [clip.poster, clip.posterSha256]]) {
    assert.match(file, /^[a-z-]+\.(mp4|jpg)$/);
    const bytes = await readFile(webFile(`assets/videos/gallery/${file}`));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), digest, `${clip.id}: selected gallery asset matches its manifest`);
    assert(gallery.includes(`../assets/videos/gallery/${file}`), `${clip.id}: gallery references its selected asset`);
  }
}
for (const [path, contents] of [['styles.css', css], ['tools/gallery.css', await readFile(webFile('tools/gallery.css'), 'utf8')]]) {
  for (const [, asset] of contents.matchAll(/url\(['"]?([^'"\)]+)['"]?\)/g)) {
    if (asset.startsWith('#')) {
      assert((await readFile(webFile('index.html'), 'utf8')).includes(`id="${asset.slice(1)}"`), `Valid SVG paint reference: ${asset}`);
    } else await stat(resolve(dirname(webFile(path)), asset));
  }
}
const privacy = await readFile(webFile('privacy/index.html'), 'utf8');
assert.match(privacy, /Mittlerer Landweg 26, 21033 Hamburg/);
assert.match(privacy, /GitHub Pages/);
assert.match(privacy, /IONOS — email/);
assert(!/Geesthacht|IONOS — main website|WebAnalytics|Website Builder/.test(privacy));
for (const fragment of ['accounts-and-projects', 'usage-insights', 'leaderboard', 'contributions', 'cookies-and-browser-storage', 'consent-and-administrative-records', 'your-rights']) {
  assert(privacy.includes(fragment), `Missing privacy section: ${fragment}`);
}
console.log(`Checked all ${pages.length} pages, ${links} local references, CSS assets, and legal migration requirements.`);
