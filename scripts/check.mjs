import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const pages = ['index.html', 'imprint/index.html', 'privacy/index.html', 'test-game.html'];
let links = 0;
for (const page of pages) {
  const html = await readFile(page, 'utf8');
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${page}: exactly one main heading`);
  assert.match(html, /<html lang="en">/, `${page}: document language`);
  assert.match(html, /name="viewport"/, `${page}: responsive viewport`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, `${page}: unique element IDs`);
  for (const [, value] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|tel:)/.test(value)) continue;
    assert(!value.startsWith('/'), `${page}: relative paths must work on GitHub project Pages`);
    const [path, fragment] = value.split('#');
    let target = path ? resolve(dirname(page), path) : resolve(page);
    if ((await stat(target)).isDirectory()) target = resolve(target, 'index.html');
    if (fragment) assert.match(await readFile(target, 'utf8'), new RegExp(`id="${fragment}"`), `${page}: valid fragment ${value}`);
    links++;
  }
}
const css = await readFile('styles.css', 'utf8');
for (const [, asset] of css.matchAll(/url\(['"]?([^'"\)]+)['"]?\)/g)) await stat(asset);
const privacy = await readFile('privacy/index.html', 'utf8');
assert.match(privacy, /Mittlerer Landweg 26, 21033 Hamburg/);
assert.match(privacy, /GitHub Pages/);
assert.match(privacy, /IONOS — email/);
assert(!/Geesthacht|IONOS — main website|WebAnalytics|Website Builder/.test(privacy));
for (const fragment of ['accounts-and-projects', 'usage-insights', 'leaderboard', 'contributions', 'cookies-and-browser-storage', 'consent-and-administrative-records', 'your-rights']) {
  assert(privacy.includes(fragment), `Missing privacy section: ${fragment}`);
}
const prototype = await readFile('test-game.html', 'utf8');
assert.match(prototype, /name="robots" content="noindex, nofollow"/);
for (const page of pages.filter(page => page !== 'test-game.html')) {
  assert(!/test-game\.html/.test(await readFile(page, 'utf8')), `${page}: prototype stays unlinked`);
}
console.log(`Checked all ${pages.length} pages, ${links} local references, CSS assets, legal migration requirements, and unlinked prototype.`);
