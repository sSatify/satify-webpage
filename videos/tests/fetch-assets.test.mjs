import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ensureAssets } from '../scripts/fetch-assets.mjs';

const bytes = Buffer.from('verified scene bytes');
const digest = createHash('sha256').update(bytes).digest('hex');
const metadata = Buffer.from(JSON.stringify({ file: 'scene.tif', bytes: bytes.length, sha256: digest }));
const pin = (path, data) => ({ path, file: path.split('/').at(-1), bytes: data.length,
  sha256: createHash('sha256').update(data).digest('hex') });
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'satify-fetch-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'assets/release.json'), JSON.stringify({ schemaVersion: 2,
    repository: 'test/repo', tag: 'demo-data-v2', manifests: ['assets/scene.json'],
    files: [pin('assets/scene.json', metadata), pin('assets/scene.tif', bytes)] }));
  await writeFile(join(root, 'assets/scene.json'), metadata);
  return { root, log: () => {}, getToken: async () => null };
}
const cached = options => join(options.root, 'assets/scene.tif');
const assertClean = async options => assert.ok(!(await readdir(join(options.root, 'assets'))).some(name => name.includes('.download-')));

test('downloads pinned bytes, verifies them, and reuses the cache without network or credentials', async t => {
  const options = await fixture(t);
  await rm(join(options.root, 'assets/scene.json'));
  const urls = [];
  await ensureAssets(undefined, { ...options, fetchImpl: async url => {
    urls.push(url); return new Response(url.endsWith('.json') ? metadata : bytes);
  } });
  assert.deepEqual(urls, ['scene.json', 'scene.tif'].map(name => `https://github.com/test/repo/releases/download/demo-data-v2/${name}`));
  assert.deepEqual(await readFile(join(options.root, 'assets/scene.json')), metadata);
  assert.deepEqual(await readFile(cached(options)), bytes);
  await ensureAssets(['assets/scene.json'], { ...options,
    fetchImpl: () => { throw new Error('Unexpected network access'); },
    getToken: () => { throw new Error('Unexpected credential access'); } });
  await assertClean(options);
});

test('rejects corrupt, short, oversized and interrupted downloads without publishing partial files', async t => {
  const options = await fixture(t);
  const responses = [
    () => new Response(Buffer.alloc(bytes.length)),
    () => new Response(bytes.subarray(0, 3)),
    () => new Response(Buffer.alloc(bytes.length + 1)),
    () => new Response(new ReadableStream({ start(controller) {
      controller.enqueue(bytes.subarray(0, 3)); controller.error(new Error('Connection interrupted'));
    } })),
  ];
  for (const response of responses) {
    await assert.rejects(ensureAssets(undefined, { ...options, fetchImpl: async () => response() }));
    await assert.rejects(readFile(cached(options)), { code: 'ENOENT' });
    await assertClean(options);
  }
});

test('keeps modified local data unless forced, and preserves it if forced download fails', async t => {
  const options = await fixture(t), custom = Buffer.from('local modified data');
  await writeFile(cached(options), custom);
  await assert.rejects(ensureAssets(undefined, { ...options,
    fetchImpl: () => { throw new Error('Should not fetch'); } }), /--force/);
  await assert.rejects(ensureAssets(undefined, { ...options, force: true,
    fetchImpl: async () => new Response('wrong') }), /mismatch/);
  assert.deepEqual(await readFile(cached(options)), custom);
  await ensureAssets(undefined, { ...options, force: true,
    fetchImpl: async url => new Response(url.endsWith('.json') ? metadata : bytes) });
  assert.deepEqual(await readFile(cached(options)), bytes);
  await assertClean(options);
});

test('private release fallback uses the API, passes credentials only to API calls, and verifies bytes', async t => {
  const options = await fixture(t), calls = [];
  await ensureAssets(undefined, { ...options, getToken: async () => 'fixture-token', fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.startsWith('https://github.com/')) return new Response('', { status: 404 });
    if (url.endsWith('/releases/tags/demo-data-v2')) return Response.json({ assets: [{ name: 'scene.tif', id: 123 }] });
    assert.equal(url, 'https://api.github.com/repos/test/repo/releases/assets/123');
    assert.equal(init.headers.Accept, 'application/octet-stream');
    return new Response(bytes);
  } });
  assert.equal(calls[0].init.headers, undefined);
  assert.ok(calls.slice(1).every(call => call.init.headers.Authorization === 'Bearer fixture-token'));
  assert.deepEqual(await readFile(cached(options)), bytes);
});

test('inaccessible releases give actionable errors and leave no partial data', async t => {
  const options = await fixture(t);
  await assert.rejects(ensureAssets(undefined, { ...options,
    fetchImpl: async () => new Response('', { status: 404 }) }), /gh auth login or GH_TOKEN/);
  await assertClean(options);
  await assert.rejects(ensureAssets(undefined, { ...options,
    fetchImpl: async () => new Response('', { status: 503 }) }), /503/);
  await assertClean(options);
});

test('rejects unlisted manifests and file traversal before fetching', async t => {
  const options = await fixture(t);
  const fetchImpl = () => { throw new Error('Unexpected network access'); };
  await assert.rejects(ensureAssets(['../outside.json'], { ...options, fetchImpl }), /not listed/);
  const path = join(options.root, 'assets/release.json');
  const release = JSON.parse(await readFile(path, 'utf8'));
  release.files[0].path = 'assets/../../scene.json';
  await writeFile(path, JSON.stringify(release));
  await assert.rejects(ensureAssets(undefined, { ...options, fetchImpl }), /inside videos/);
});

test('fetches only the requested dataset files', async t => {
  const options = await fixture(t);
  const path = join(options.root, 'assets/release.json');
  const release = JSON.parse(await readFile(path, 'utf8'));
  release.manifests.push('assets/other.json');
  release.files.push(pin('assets/other.json', metadata));
  await writeFile(path, JSON.stringify(release));
  // The unselected manifest intentionally does not exist.
  let requests = 0;
  await ensureAssets(['assets/scene.json'], { ...options, fetchImpl: async () => { requests++; return new Response(bytes); } });
  assert.equal(requests, 1);
});

test('rejects corrupt downloaded or modified cached metadata before requesting imagery', async t => {
  const options = await fixture(t), path = join(options.root, 'assets/scene.json');
  await rm(path);
  const urls = [];
  await assert.rejects(ensureAssets(undefined, { ...options, fetchImpl: async url => {
    urls.push(url); return new Response(Buffer.alloc(metadata.length));
  } }), /mismatch/);
  assert.equal(urls.length, 1);
  assert.ok(urls[0].endsWith('scene.json'));
  await assert.rejects(readFile(path), { code: 'ENOENT' });
  await writeFile(path, 'modified metadata');
  await assert.rejects(ensureAssets(undefined, { ...options,
    fetchImpl: () => { throw new Error('Unexpected request'); } }), /--force/);
  assert.equal(await readFile(path, 'utf8'), 'modified metadata');
  await assertClean(options);
});

test('rejects correctly hashed metadata that points outside the scene or disagrees with locked imagery', async t => {
  const options = await fixture(t), path = join(options.root, 'assets/release.json');
  const release = JSON.parse(await readFile(path, 'utf8'));
  for (const scene of [
    { file: '../scene.tif', bytes: bytes.length, sha256: digest },
    { file: 'scene.tif', bytes: bytes.length + 1, sha256: digest },
    { file: 'unlisted.tif', bytes: bytes.length, sha256: digest },
  ]) {
    const data = Buffer.from(JSON.stringify(scene));
    release.files[0] = pin('assets/scene.json', data);
    await writeFile(path, JSON.stringify(release));
    await writeFile(join(options.root, 'assets/scene.json'), data);
    await assert.rejects(ensureAssets(undefined, { ...options,
      fetchImpl: () => { throw new Error('Unexpected request'); } }), /Invalid scene filename|disagrees/);
  }
});
