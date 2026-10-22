import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, mkdir, rename, unlink } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';

const toolRoot = fileURLToPath(new URL('../', import.meta.url));
const exec = promisify(execFile);
const json = async path => JSON.parse(await readFile(path, 'utf8'));

async function githubToken() {
  const supplied = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (supplied) return supplied.trim();
  try {
    const { stdout } = await exec('gh', ['auth', 'token', '--hostname', 'github.com'],
      { windowsHide: true, timeout: 10_000 });
    return stdout.trim();
  } catch { return null; }
}

function within(root, path) {
  const full = resolve(root, path), rel = relative(root, full);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Asset path must stay inside videos/.');
  return full;
}

async function matches(path, manifest) {
  const hash = createHash('sha256');
  let bytes = 0;
  try {
    for await (const chunk of createReadStream(path)) { bytes += chunk.length; hash.update(chunk); }
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  return bytes === manifest.bytes && hash.digest('hex') === manifest.sha256;
}

/** Fetch pinned metadata first, then imagery. Git's release lock verifies every file. */
export async function ensureAssets(manifestPaths, { root = toolRoot, force = false,
  fetchImpl = fetch, getToken = githubToken, log = console.log } = {}) {
  const release = await json(resolve(root, 'assets/release.json'));
  if (release.schemaVersion !== 2 || !/^[\w.-]+\/[\w.-]+$/.test(release.repository)
    || !/^[\w.-]+$/.test(release.tag) || !Array.isArray(release.manifests)
    || new Set(release.manifests).size !== release.manifests.length || !Array.isArray(release.files)) {
    throw new Error('Invalid asset release definition.');
  }
  const locked = new Map();
  const names = new Set();
  for (const item of release.files) {
    if (!item || typeof item.path !== 'string' || !/^assets\/(?:[\w.-]+\/)*[\w.-]+\.(?:json|tif)$/.test(item.path)
      || typeof item.file !== 'string' || !/^[\w.-]+\.(?:json|tif)$/.test(item.file)
      || item.path.split('/').at(-1) !== item.file || !/^[a-f0-9]{64}$/.test(item.sha256)
      || !Number.isSafeInteger(item.bytes) || item.bytes <= 0 || locked.has(item.path) || names.has(item.file)
      || item.path === 'assets/release.json') throw new Error('Invalid or duplicate release file entry.');
    const destination = within(root, item.path);
    locked.set(item.path, { manifest: item, destination });
    names.add(item.file);
  }
  if (release.manifests.some(path => typeof path !== 'string' || !path.endsWith('.json') || !locked.has(path))) {
    throw new Error('Scene metadata must be pinned in assets/release.json.');
  }
  const selected = manifestPaths ?? release.manifests;
  if (!Array.isArray(selected) || selected.some(path => !release.manifests.includes(path))) {
    throw new Error('Requested scene is not listed in assets/release.json.');
  }
  const metadata = [...new Set(selected)].map(path => locked.get(path));

  let authenticatedRelease;
  async function responseFor(name) {
    const publicUrl = `https://github.com/${release.repository}/releases/download/${release.tag}/${encodeURIComponent(name)}`;
    let response = await fetchImpl(publicUrl, { signal: AbortSignal.timeout(120_000) });
    if ([401, 403, 404].includes(response.status)) {
      await response.body?.cancel();
      if (!authenticatedRelease) {
        const token = await getToken();
        if (!token) throw new Error(`Cannot access ${release.repository} release ${release.tag}. Check that it exists; for a private repository, use gh auth login or GH_TOKEN/GITHUB_TOKEN with read access.`);
        const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
        const info = await fetchImpl(`https://api.github.com/repos/${release.repository}/releases/tags/${release.tag}`,
          { headers, signal: AbortSignal.timeout(30_000) });
        if (!info.ok) { await info.body?.cancel(); throw new Error(`GitHub release lookup failed (${info.status}). Check repository access and the pinned tag.`); }
        authenticatedRelease = { headers, info: await info.json() };
      }
      const asset = authenticatedRelease.info.assets?.find(asset => asset.name === name);
      if (!asset || !Number.isSafeInteger(asset.id)) throw new Error(`Release ${release.tag} has no asset named ${name}.`);
      response = await fetchImpl(`https://api.github.com/repos/${release.repository}/releases/assets/${asset.id}`, {
        headers: { ...authenticatedRelease.headers, Accept: 'application/octet-stream' },
        signal: AbortSignal.timeout(120_000),
      });
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error(`Downloading ${name} failed (${response.status}).`);
    }
    return response;
  }

  async function ensureFile({ manifest, destination }) {
    const cached = await matches(destination, manifest);
    if (cached && !force) { log(`Verified cached ${manifest.file}`); return; }
    if (cached === false && !force) {
      throw new Error(`${manifest.file} differs from its manifest. Local data was kept. Use npm run fetch-assets -- --force to restore the published version.`);
    }
    await mkdir(dirname(destination), { recursive: true });
    const temporary = `${destination}.download-${randomUUID()}`;
    try {
      log(`Downloading ${manifest.file} from ${release.tag}…`);
      const response = await responseFor(manifest.file);
      let bytes = 0;
      const hash = createHash('sha256');
      await pipeline(Readable.fromWeb(response.body), new Transform({
        transform(chunk, encoding, callback) {
          bytes += chunk.length;
          if (bytes > manifest.bytes) return callback(new Error(`${manifest.file} exceeds its expected size.`));
          hash.update(chunk); callback(null, chunk);
        },
      }), createWriteStream(temporary, { flags: 'wx' }));
      if (bytes !== manifest.bytes || hash.digest('hex') !== manifest.sha256) {
        throw new Error(`Checksum or size mismatch for ${manifest.file}; download discarded.`);
      }
      await rename(temporary, destination);
      log(`Verified ${manifest.file}`);
    } finally {
      await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  for (const item of metadata) await ensureFile(item);
  const imagery = [];
  for (const item of metadata) {
    const scene = await json(item.destination);
    if (typeof scene.file !== 'string' || !/^[\w.-]+\.tif$/.test(scene.file)) {
      throw new Error(`Invalid scene filename in ${item.manifest.file}.`);
    }
    const path = item.manifest.path.replace(/[^/]+$/, scene.file);
    const target = locked.get(path);
    if (!target || scene.sha256 !== target.manifest.sha256 || scene.bytes !== target.manifest.bytes) {
      throw new Error(`Scene metadata disagrees with the release lock: ${item.manifest.file}`);
    }
    imagery.push(target);
  }
  for (const item of new Set(imagery)) await ensureFile(item);
}

async function main() {
  const { values } = parseArgs({ options: { dataset: { type: 'string' }, force: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false } } });
  if (values.help) {
    console.log('Usage: npm run fetch-assets -- [--dataset tools|time-series] [--force]'); return;
  }
  let paths;
  if (values.dataset) {
    const config = await json(resolve(toolRoot, 'config.json'));
    if (values.dataset === 'tools') paths = [config.scene];
    else if (values.dataset === 'time-series') paths = config.timeSeries.scenes;
    else throw new Error('Unknown dataset. Choose tools or time-series.');
  }
  await ensureAssets(paths, { force: values.force });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
