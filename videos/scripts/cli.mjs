import { parseArgs } from 'node:util';
import { mkdir, open, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { configuration, connect, launch, readJson, root, writeJson } from './runtime.mjs';
import { setupProject, verifyAsset } from './project.mjs';
import { record, requireFfmpeg, scenarios } from './record.mjs';

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true,
    options: { url: { type: 'string' }, project: { type: 'string' },
      headed: { type: 'boolean', default: false }, help: { type: 'boolean', default: false } } });
  const [command, selected = 'all'] = positionals;
  if (values.help || !command) {
    console.log('Usage: npm run login|setup|record -- [pen|smart-fill|all] [--url https://app.satify.tech] [--project "Name"] [--headed]');
    return;
  }
  if (!['login', 'setup', 'record'].includes(command)) throw new Error(`Unknown command: ${command}`);
  if (command === 'record' && selected !== 'all' && !scenarios[selected]) throw new Error(`Unknown scenario: ${selected}`);
  if (command === 'record') requireFfmpeg();
  const config = await configuration(values);
  console.log(`Target: ${config.baseUrl} · Project: ${config.projectName}`);
  await mkdir(config.stateDir, { recursive: true });
  const lockPath = resolve(config.stateDir, 'run.lock');
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Another run holds ${lockPath}. If a run crashed, remove this file only after checking no recorder is running.`);
    throw error;
  }
  await lock.writeFile(String(process.pid));
  let runtime;
  try {
    runtime = await launch(config, { login: command === 'login', headed: values.headed });
    if (command === 'login') {
      const page = await runtime.context.newPage();
      await page.goto(config.baseUrl + '/data-store', { waitUntil: 'domcontentloaded' });
      const input = createInterface({ input: stdin, output: stdout });
      try { await input.question('Sign in in the opened browser, then press Enter here. '); }
      finally { input.close(); }
      await runtime.api('GET', '/session/list');
      await runtime.saveAuth();
      console.log('Saved the browser login locally in the Git-ignored .state folder.');
      return;
    }
    const scenePath = resolve(root, config.scene);
    const scene = await readJson(scenePath);
    const bytes = await verifyAsset(scene, resolve(dirname(scenePath), scene.file));
    await connect(runtime, config);
    let state = await readJson(config.stateFile, null);
    state = await setupProject({ api: runtime.api, config, scene, bytes, state,
      save: async value => { await runtime.saveAuth(); await writeJson(config.stateFile, value); } });
    if (command === 'record') {
      for (const name of selected === 'all' ? Object.keys(scenarios) : [selected]) {
        await record(runtime, config, scene, state, name);
      }
    }
    await runtime.saveAuth();
  } finally {
    try { if (runtime) await runtime.close(); }
    finally { await lock.close(); await unlink(lockPath); }
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
