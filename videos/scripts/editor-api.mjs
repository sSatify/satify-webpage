import { randomUUID } from 'node:crypto';

// Match the app's actual durable operation, not background manifest saves or
// a request from another workflow. Retired write endpoints are never retried.
export function isMutationResponse(response, action) {
  const request = response.request();
  if (request.method() !== 'POST' || !/\/session\/editor-mutation(?:\/v[23])?$/.test(new URL(response.url()).pathname)) return false;
  const body = request.postDataJSON();
  return body?.kind === 'mutation' && body.action === action;
}

export function waitForMutation(page, action) {
  return page.waitForResponse(response => isMutationResponse(response, action), { timeout: 120_000 });
}

export function isTileResponse(response) {
  return response.request().method() === 'POST'
    && new URL(response.url()).pathname.endsWith('/session/editor-save')
    && response.request().postDataJSON()?.kind === 'tile';
}

export function trackEditorWrites(page) {
  const pending = new Set(), failures = [];
  const relevant = request => request.method() === 'POST'
    && /\/session\/(editor-save|editor-mutation(?:\/v[23])?|(?:lines|propagate|timeseries)\/commands\/v[123])$/.test(new URL(request.url()).pathname);
  page.on('request', request => { if (relevant(request)) pending.add(request); });
  page.on('requestfinished', request => pending.delete(request));
  page.on('requestfailed', request => {
    pending.delete(request);
    if (relevant(request)) failures.push('An editor write failed.');
  });
  page.on('response', response => {
    if (relevant(response.request()) && !response.ok()) failures.push(`An editor write returned ${response.status()}.`);
  });
  return async () => {
    for (let n = 0; n < 120 && pending.size; n++) await page.waitForTimeout(250);
    if (failures.length || pending.size) throw new Error(failures[0] ?? 'Editor writes did not finish.');
  };
}

export async function saveEditor(api, payload) {
  const request = { ...payload, operation_id: randomUUID() };
  const receipt = await api('POST', '/session/editor-save', { data: request });
  if (receipt.operation_id !== request.operation_id || !/^\d+$/.test(receipt.revision)) {
    throw new Error('The editor save did not return a valid operation receipt.');
  }
  return receipt;
}

export async function deleteLegacyLayer(api, sid, folder, layer) {
  const state = await api('GET', `/session/editor-mutation/state?sid=${encodeURIComponent(sid)}`);
  const request = { sid, folder, layer, kind: 'mutation', action: 'layer-delete', schema_version: 1,
    operation_id: randomUUID(), base_revision: state.revision, manifest_revision: state.manifest_revision,
    body: {}, query: {} };
  const receipt = await api('POST', '/session/editor-mutation', { data: request });
  if (receipt.operation_id !== request.operation_id || receipt.ok !== true) {
    throw new Error('The legacy layer removal did not return a valid operation receipt.');
  }
}
