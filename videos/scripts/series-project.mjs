import { baseline, detectionInput, hash, importDraft, poll } from './project.mjs';

export function seriesKey(config, assets) {
  return hash(JSON.stringify(['time-series', assets.map(({ scene }) =>
    [scene.file, scene.sha256, scene.displayName, scene.acquisition_date]),
  config.calibration, config.labels, config.selectedLabel]));
}

export function validateSeries(assets) {
  if (assets.length < 2 || assets.length > 3) throw new Error('Time-series setup needs two or three scenes.');
  const scenes = assets.map(asset => asset.scene);
  if (new Set(scenes.map(scene => scene.file)).size !== scenes.length) {
    throw new Error('Time-series filenames must be unique.');
  }
  const dates = scenes.map(scene => scene.acquisition_date);
  if (dates.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
    || dates.some((date, i) => i && date <= dates[i - 1])) {
    throw new Error('Time-series dates must be distinct valid dates in chronological order.');
  }
  const boxes = scenes.map(scene => {
    const grid = scene.geotransform;
    if (scene.crs_wkt !== scenes[0].crs_wkt || !scene.crs_wkt || !Array.isArray(grid)
      || grid.length !== 6 || !grid.every(Number.isFinite) || grid[2] !== 0 || grid[4] !== 0
      || grid[1] <= 0 || grid[5] >= 0 || !Number.isInteger(scene.width) || !Number.isInteger(scene.height)
      || scene.width <= 0 || scene.height <= 0) {
      throw new Error('Time-series bundles need compatible north-up georeferenced grids.');
    }
    return [grid[0], grid[3] + scene.height * grid[5], grid[0] + scene.width * grid[1], grid[3]];
  });
  if (Math.max(...boxes.map(b => b[0])) >= Math.min(...boxes.map(b => b[2]))
    || Math.max(...boxes.map(b => b[1])) >= Math.min(...boxes.map(b => b[3]))) {
    throw new Error('Time-series scenes must have a common geographic overlap.');
  }
}

/** Prepare all dates in one dedicated project. Never reset drawing layers. */
export async function setupSeriesProject({ api, config, assets, state, save, log = console.log, wait }) {
  validateSeries(assets);
  const key = seriesKey(config, assets);
  const filenames = assets.map(({ scene }) => scene.file);
  const { sessions } = await api('GET', '/session/list');
  if (state) {
    if (state.schemaVersion !== 2 || state.kind !== 'time-series' || state.origin !== config.baseUrl
      || state.setupKey !== key || !['created', 'uploaded', 'processing', 'ready'].includes(state.stage)) {
      throw new Error('Saved time-series state belongs to a different URL, scene selection or setup. Use a new project name.');
    }
    if (!sessions.some(project => project.sid === state.sid && project.name === config.projectName)) {
      throw new Error('The saved time-series project is missing, inaccessible or renamed.');
    }
    if (!Array.isArray(state.imports) || state.imports.length !== assets.length
      || state.imports.some((item, i) => item.scene_id !== filenames[i])
      || !Array.isArray(state.uploadedFiles) || new Set(state.uploadedFiles).size !== state.uploadedFiles.length
      || state.uploadedFiles.some(file => !filenames.includes(file))
      || (state.stage !== 'created' && state.uploadedFiles.length !== assets.length)) {
      throw new Error('Invalid saved time-series upload state; no project was modified.');
    }
  } else {
    if (sessions.some(project => project.name === config.projectName)) {
      throw new Error('A project with this name already exists but is not managed by this recorder. Choose a new name.');
    }
    const report = await api('POST', '/imports/detect', {
      data: { files: assets.flatMap(({ scene }) => detectionInput(scene).files) },
    });
    if (report.hard_errors?.length || report.scenes?.length !== assets.length) {
      throw new Error('Expected one detected scene for each time-series TIFF.');
    }
    const imports = assets.map(({ scene }) => {
      const matches = report.scenes.filter(item => item.id === scene.file);
      if (matches.length !== 1 || matches[0].metadata_suggestion?.bands?.some(band => band.file_path !== scene.file)) {
        throw new Error('The server did not preserve the time-series file identities.');
      }
      return importDraft({ hard_errors: [], scenes: matches }, scene, config);
    });
    const created = await api('POST', '/session/new', { data: { name: config.projectName } });
    state = { schemaVersion: 2, kind: 'time-series', origin: config.baseUrl, sid: created.sid,
      setupKey: key, stage: 'created', imports, uploadedFiles: [] };
    await save(state);
  }
  const query = `sid=${encodeURIComponent(state.sid)}`;
  const admission = () => poll(async () => (await api('POST', '/session/preparation-admission', {
    data: { sid: state.sid },
  })).status === 'active', config.timeoutMs, 'a preparation slot', wait);
  if (state.stage === 'created') {
    const current = await api('POST', '/session/switch', { data: { sid: state.sid } });
    if (current.sid !== state.sid) throw new Error('The server switched to an unexpected project.');
    await api('PUT', `/session/manifest?${query}&base_revision=${current.manifest_revision}`, {
      data: baseline(config, assets[0].scene),
    });
    for (const draft of state.imports) {
      await api('PUT', '/session/metadata-repair', { data: { sid: state.sid, ...draft } });
    }
    for (const { scene, bytes } of assets) {
      if (state.uploadedFiles.includes(scene.file)) continue;
      await admission();
      log(`Uploading ${scene.displayName}…`);
      await api('POST', `/session/bands?${query}&bands=${scene.bands.length}`, {
        multipart: { file: { name: scene.file, mimeType: 'image/tiff', buffer: bytes } },
      });
      state.uploadedFiles.push(scene.file);
      await save(state);
    }
    state.stage = 'uploaded';
    await save(state);
  }
  if (state.stage === 'uploaded' || state.stage === 'processing') {
    const progress = await api('GET', `/session/compute-progress?${query}`);
    if (!progress.running && (state.stage === 'uploaded' || !progress.finished)) {
      await admission();
      await api('POST', '/session/metadata-repair/process', {
        data: { sid: state.sid, scene_ids: state.imports.map(item => item.scene_id) },
      });
    }
    state.stage = 'processing';
    await save(state);
  }
  await poll(async () => {
    const progress = await api('GET', `/session/compute-progress?${query}`);
    if (progress.failed || progress.error || progress.pipeline_status === 'failed') {
      throw new Error('Server preparation failed. Inspect the time-series project and rerun setup.');
    }
    return progress.finished;
  }, config.timeoutMs, 'time-series scenes and masks', wait);
  const { scenes } = await api('GET', `/session/scenes?${query}`);
  if (scenes.length !== assets.length) throw new Error('The time-series project has an unexpected scene count.');
  const ids = assets.map(({ scene }, i) => {
    const matches = scenes.filter(item => item.source_product_id === state.imports[i].scene_id);
    if (matches.length !== 1 || !matches[0].ready || matches[0].band_count !== scene.bands.length || !matches[0].id) {
      throw new Error(`Expected a fully prepared scene for ${scene.file}.`);
    }
    return matches[0].id;
  });
  if (new Set(ids).size !== ids.length || (state.sceneIds && JSON.stringify(ids) !== JSON.stringify(state.sceneIds))) {
    throw new Error('The saved time-series scene identities have changed.');
  }
  state.sceneIds = ids;
  state.stage = 'ready';
  await save(state);
  log(`Time-series project ready: ${config.projectName} (${state.sid}), ${ids.length} scenes`);
  return state;
}
