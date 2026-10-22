import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// The editor initializes this layer on every load (displayed as "Raster labels").
// It is reserved for the recorder ONLY inside the dedicated managed project.
export const DRAWING_LAYER = 'Drawing Layer 1';
export const hash = value => createHash('sha256').update(value).digest('hex');
const segment = encodeURIComponent;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function verifyAsset(manifest, file) {
  const bytes = await readFile(file);
  if (hash(bytes) !== manifest.sha256 || bytes.length !== manifest.bytes) {
    throw new Error('The scene TIFF does not match its provenance manifest. Rebuild the bundle.');
  }
  return bytes;
}

export function setupKey(config, scene) {
  return hash(JSON.stringify([scene.sha256, config.calibration, config.labels, config.selectedLabel, DRAWING_LAYER]));
}

export function detectionInput(scene) {
  return { files: [{ path: scene.file, name: scene.file, size: scene.bytes,
    rasterInfo: { width: scene.width, height: scene.height,
      hasEmbeddedCrs: true, hasEmbeddedTransform: true,
      samples: scene.bands.map(band => ({ channelIndex: band.index, description: band.name })),
    },
  }] };
}

export function importDraft(report, scene, config) {
  if (report.hard_errors?.length || report.scenes?.length !== 1) {
    throw new Error('Expected exactly one importable scene. Review the import detection report.');
  }
  const detected = report.scenes[0];
  const suggestion = detected.metadata_suggestion;
  if (suggestion?.bands?.length !== scene.bands.length || suggestion.sensor !== 'sentinel-2') {
    throw new Error('The server did not recognise all Sentinel-2 bands. Review import detection.');
  }
  const { scale, offset } = config.calibration;
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(offset)) {
    throw new Error('Configure a finite positive calibration scale and finite offset.');
  }
  const indexes = suggestion.bands.map(band => band.channel_index).sort((a, b) => a - b);
  if (indexes.some((index, i) => index !== i + 1) || suggestion.bands.some(band => !band.roles?.length)) {
    throw new Error('Detected bands need unique channel indexes and spectral roles.');
  }
  return { scene_id: detected.id, draft: {
    scene_name: 'Urban forest demonstration', sensor: suggestion.sensor,
    // Do not invent L1C/L2A provenance from a band count or file name.
    product_level: suggestion.product_level ?? null,
    bands: suggestion.bands.map(band => ({ ...band, scale, offset, missing_fields: [] })),
  } };
}

export function baseline(config, scene, sceneId = null) {
  return { version: 1,
    nav: { projectName: config.projectName, links: sceneId ? [sceneId] : [],
      currentLinkIndex: 0, currentFolder: sceneId, rootFolder: sceneId,
      linkLabels: sceneId ? { [sceneId]: 'Urban forest demonstration' } : {} },
    upload: { labelDefinitions: config.labels, noDataColor: '#808080',
      displayRecipes: [], defaultDisplayRecipeId: null, useNdvi: false,
      useNdwi: false, useAgriculture: false },
    editor: { width: scene.width, height: scene.height,
      selectedLabelIndex: Math.max(0, config.labels.findIndex(label => label.labelName === config.selectedLabel)),
      selectedDrawingLayer: DRAWING_LAYER, drawingLayerNameDisplayOrder: [DRAWING_LAYER],
      layerNameDrawerSettings: { [DRAWING_LAYER]: { opacity: 100, visible: true, discretizable: false,
        discreteActive: false, discreteMenuOpen: false, isLayer: true, legendDisplayAlways: false, legendForLayer: '' } },
      penSize: 8, penMode: 'paint', currentLayer: 'rgb199',
      currentDisplayRecipeId: 'natural-color', currentNormalization: '2and98percentile',
      histogramEqualization: false, polygonsByFolder: {} },
  };
}

export function validateBinding(state, config, scene, projects) {
  if (state.schemaVersion !== 1 || !['created', 'uploaded', 'processing', 'ready'].includes(state.stage)) {
    throw new Error('Unrecognised recorder state; no project was modified.');
  }
  if (state.origin !== config.baseUrl || state.setupKey !== setupKey(config, scene)) {
    throw new Error('This saved project belongs to a different URL, scene or setup. Use a new project name.');
  }
  const project = projects.find(project => project.sid === state.sid);
  if (!project || project.name !== config.projectName) {
    throw new Error('The saved demo project is missing, inaccessible or renamed. No project was reset.');
  }
  return project;
}

async function poll(check, timeoutMs, description, wait = pause) {
  const deadline = Date.now() + timeoutMs;
  do {
    const result = await check();
    if (result) return result;
    if (Date.now() >= deadline) break;
    await wait(2000);
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for ${description}. Rerun setup to resume the saved project.`);
}

/** api(method, path, options) returns JSON; all writes target our saved sid. */
export async function setupProject({ api, config, scene, bytes, state, save, log = console.log, wait }) {
  const projects = (await api('GET', '/session/list')).sessions;
  if (state) validateBinding(state, config, scene, projects);
  else {
    if (projects.some(project => project.name === config.projectName)) {
      throw new Error('A project with this name already exists but is not managed by this recorder. Choose a new name.');
    }
    // Detect/validate before creating any project.
    const draft = importDraft(await api('POST', '/imports/detect', { data: detectionInput(scene) }), scene, config);
    const created = await api('POST', '/session/new', { data: { name: config.projectName } });
    state = { schemaVersion: 1, origin: config.baseUrl, sid: created.sid,
      setupKey: setupKey(config, scene), stage: 'created', import: draft };
    await save(state); // Save identity immediately; interrupted setup reuses this ID.
  }
  const sidQuery = `sid=${segment(state.sid)}`;
  if (state.stage === 'created') {
    const current = await api('POST', '/session/switch', { data: { sid: state.sid } });
    await api('PUT', `/session/manifest?${sidQuery}&base_revision=${current.manifest_revision}`, {
      data: baseline(config, scene),
    });
    await api('PUT', '/session/metadata-repair', { data: { sid: state.sid, ...state.import } });
    await poll(async () => {
      const admission = await api('POST', '/session/preparation-admission', { data: { sid: state.sid } });
      return admission.status === 'active';
    }, config.timeoutMs, 'a preparation slot', wait);
    log('Uploading the verified scene to the managed demonstration project…');
    await api('POST', `/session/bands?${sidQuery}&bands=${scene.bands.length}`, {
      multipart: { file: { name: scene.file, mimeType: 'image/tiff', buffer: bytes } },
    });
    state.stage = 'uploaded';
    await save(state);
  }
  if (state.stage === 'uploaded' || state.stage === 'processing') {
    const progress = await api('GET', `/session/compute-progress?${sidQuery}`);
    if (!progress.running && (state.stage === 'uploaded' || !progress.finished)) {
      await poll(async () => (await api('POST', '/session/preparation-admission', {
        data: { sid: state.sid },
      })).status === 'active', config.timeoutMs, 'a preparation slot', wait);
      await api('POST', '/session/metadata-repair/process', {
        data: { sid: state.sid, scene_ids: [state.import.scene_id] },
      });
    }
    state.stage = 'processing';
    await save(state);
    log('Waiting for scene preparation and masks…');
  }
  await poll(async () => {
    const progress = await api('GET', `/session/compute-progress?${sidQuery}`);
    if (progress.failed || progress.error || progress.pipeline_status === 'failed') {
      throw new Error('Server preparation failed. Inspect this demo project in SATIFY, then rerun setup.');
    }
    return progress.finished;
  }, config.timeoutMs, 'scene and mask preparation', wait);
  const { scenes } = await api('GET', `/session/scenes?${sidQuery}`);
  if (scenes.length !== 1 || !scenes[0].ready || scenes[0].band_count !== scene.bands.length) {
    throw new Error('Expected one fully prepared demo scene with all source bands.');
  }
  const sceneId = scenes[0].id;
  if (!sceneId || (state.sceneId && state.sceneId !== sceneId)) throw new Error('The saved scene identity has changed.');
  state.sceneId = sceneId;
  state.stage = 'ready';
  await save(state);
  log(`Demo project ready: ${config.projectName} (${state.sid})`);
  return state;
}

export async function resetProject({ api, config, scene, state }) {
  validateBinding(state, config, scene, (await api('GET', '/session/list')).sessions);
  if (state.stage !== 'ready' || !state.sceneId) throw new Error('Run setup before resetting.');
  const current = await api('POST', '/session/switch', { data: { sid: state.sid } });
  if (current.sid !== state.sid) throw new Error('The server switched to an unexpected project.');
  const { scenes } = await api('GET', `/session/scenes?sid=${segment(state.sid)}`);
  if (scenes.length !== 1 || scenes[0].id !== state.sceneId) throw new Error('The managed project scene changed; no drawing was reset.');
  const layerPath = `/session/labeltiles/${segment(state.sceneId)}/${segment(DRAWING_LAYER)}`;
  const sidQuery = `sid=${segment(state.sid)}`;
  // No project deletion or blanket layer deletion: only this tool's reserved layer.
  const { tiles } = await api('GET', `${layerPath}?${sidQuery}`);
  for (const { x, y } of tiles) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) throw new Error('Invalid label tile coordinates.');
    await api('DELETE', `${layerPath}/${x}/${y}.png?${sidQuery}`);
  }
  // Remove the same layer's legacy PNG too, otherwise editor restore can bring
  // back old pixels after its native tiles were cleared. Masks are untouched.
  await api('DELETE', `/session/layers/${segment(`${state.sceneId}__${DRAWING_LAYER}`)}`);
  const desired = baseline(config, scene, state.sceneId);
  const manifest = { ...current.manifest, ...desired,
    upload: { ...current.manifest?.upload, ...desired.upload },
    editor: { ...current.manifest?.editor, ...desired.editor },
  };
  await api('PUT', `/session/manifest?${sidQuery}&base_revision=${current.manifest_revision}`, { data: manifest });
}
