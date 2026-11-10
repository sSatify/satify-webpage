import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('../../web/', import.meta.url));
const webFile = path => resolve(web, path);
const pages = ['index.html', 'app/index.html', 'imprint/index.html', 'privacy/index.html'];
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
    if (page !== 'app/index.html') assert.notEqual(target, webFile('app/index.html'), `${page}: the test showcase must stay unlisted`);
    if (fragment) assert.match(await readFile(target, 'utf8'), new RegExp(`id="${fragment}"`), `${page}: valid fragment ${value}`);
    links++;
  }
}
const css = await readFile(webFile('styles.css'), 'utf8');
const recordings = JSON.parse(await readFile(webFile('assets/videos/recordings.json'), 'utf8'));
assert.deepEqual(recordings.map(recording => recording.scenario).sort(), ['change-detection', 'propagate', 'rivers-roads', 'smart-fill', 'time-series']);
for (const recording of recordings) {
  if (recording.scenario === 'smart-fill') {
    assert.equal(recording.origin, 'http://127.0.0.1:3030', 'Smart Fill: local app recording');
    assert.equal(recording.appVersion, 'v3.0.1-local', 'Smart Fill: updated local app');
    assert.equal(recording.explainerVideos, 'off', 'Smart Fill: Tool videos disabled');
    assert(recording.duration <= 25, 'Smart Fill: at most 25 seconds');
  } else {
    assert.equal(recording.origin, 'https://app.satify.tech', `${recording.scenario}: production recording`);
  }
  assert.equal(recording.theme, 'dark', `${recording.scenario}: dark recording`);
  const bytes = await readFile(webFile(`assets/videos/${recording.scenario}.mp4`));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), recording.sha256, `${recording.scenario}: selected video matches its provenance`);
}
const modes = recordings.find(recording => recording.scenario === 'smart-fill').verifiedModes;
assert(modes && modes.Local > 0 && modes['In viewport'] > modes.Local && modes.Global > modes['In viewport'],
  'Smart Fill must demonstrate three distinct saved scopes');
assert.match(await readFile(webFile('app/index.html'), 'utf8'), /<meta name="robots" content="noindex">/, 'The test showcase must opt out of search indexing');
for (const [, asset] of css.matchAll(/url\(['"]?([^'"\)]+)['"]?\)/g)) {
  if (asset.startsWith('#')) {
    assert((await readFile(webFile('index.html'), 'utf8')).includes(`id="${asset.slice(1)}"`), `Valid SVG paint reference: ${asset}`);
  } else await stat(webFile(asset));
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
