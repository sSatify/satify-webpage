import { parseArgs } from 'node:util';
import { mkdir, open, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { configuration, connect, launch, readJson, root, writeJson } from './runtime.mjs';
import { setupProject, verifyAsset } from './project.mjs';
import { setupSeriesProject } from './series-project.mjs';
import { ensureAssets } from './fetch-assets.mjs';
import { record, requireFfmpeg, scenarios } from './record.mjs';

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true,
    options: { env: { type: 'string' }, url: { type: 'string' }, project: { type: 'string' }, dataset: { type: 'string' },
      headed: { type: 'boolean', default: false }, help: { type: 'boolean', default: false } } });
  const [command, selected = 'all'] = positionals;
  if (values.help || !command) {
    console.log('Usage: npm run login|setup|record -- [pen|smart-fill|change-detection|all] [--dataset tools|time-series] [--env prod|dev | --url ORIGIN] [--project "Name"] [--headed]\nSetup defaults to both projects, tools first and time-series second. Use --dataset to prepare only one; --project requires it for setup.\nRecording a named scenario selects its dataset automatically. All records the selected dataset (tools by default).\nEnvironment defaults to prod (https://app.satify.tech); dev uses https://app-dev.satify.tech.');
    return;
  }
  await runCommand(command, selected, values);
}

export async function runCommand(command, selected, values, execute = runProject) {
  if (!['login', 'setup', 'record'].includes(command)) throw new Error(`Unknown command: ${command}`);
  if (command === 'record' && selected !== 'all' && !scenarios[selected]) throw new Error(`Unknown scenario: ${selected}`);
  if (command === 'setup' && values.dataset === undefined && values.project !== undefined) {
    throw new Error('Use --dataset tools or --dataset time-series with --project so each project has its own name.');
  }
  const scenarioDataset = command === 'record' && selected !== 'all' ? scenarios[selected].dataset : undefined;
  if (scenarioDataset && values.dataset && values.dataset !== scenarioDataset) {
    throw new Error(`Scenario ${selected} requires --dataset ${scenarioDataset}.`);
  }
  const datasets = command === 'setup' && values.dataset === undefined
    ? ['tools', 'time-series'] : [values.dataset ?? scenarioDataset ?? 'tools'];
  // Validate every configuration before touching the app; run each project to completion.
  const configs = await Promise.all(datasets.map(dataset => configuration({ ...values, dataset })));
  for (const config of configs) await execute(command, selected, values, config);
}

async function runProject(command, selected, values, config) {
  if (command === 'record') requireFfmpeg();
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
    if (command !== 'login') await ensureAssets(config.scenes || [config.scene]);
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
    const assets = await Promise.all((config.scenes || [config.scene]).map(async path => {
      const scenePath = resolve(root, path);
      const scene = await readJson(scenePath);
      const bytes = await verifyAsset(scene, resolve(dirname(scenePath), scene.file));
      return { scene, bytes };
    }));
    const { scene, bytes } = assets[0];
    await connect(runtime, config);
    let state = await readJson(config.stateFile, null);
    const setup = config.dataset === 'time-series' ? setupSeriesProject : setupProject;
    state = await setup({ api: runtime.api, config, scene, bytes, assets, state,
      save: async value => { await runtime.saveAuth(); await writeJson(config.stateFile, value); } });
    if (command === 'record') {
      for (const name of selected === 'all'
        ? Object.keys(scenarios).filter(name => scenarios[name].dataset === config.dataset) : [selected]) {
        await record(runtime, config, scene, state, name, { assets });
      }
    }
    await runtime.saveAuth();
    if (command === 'setup') console.log(`Prepared ${config.projectName}`);
  } finally {
    try { if (runtime) await runtime.close(); }
    finally { await lock.close(); await unlink(lockPath); }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
