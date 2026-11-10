import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { isMutationResponse, saveEditor, trackEditorWrites } from '../scripts/editor-api.mjs';

test('matches only the durable operation being demonstrated', () => {
  const response = (path, body, method = 'POST') => ({
    url: () => `https://app-dev.satify.tech/satify-api${path}`,
    request: () => ({ method: () => method, postDataJSON: () => body }),
  });
  for (const suffix of ['', '/v2', '/v3']) {
    assert.equal(isMutationResponse(response('/session/editor-mutation' + suffix, {kind: 'mutation', action: 'fill'}), 'fill'), true);
  }
  for (const value of [response('/session/editor-save', {kind: 'manifest'}),
    response('/session/editor-mutation', {kind: 'mutation', action: 'sync'}),
    response('/session/fill/scene', {}), response('/session/editor-mutation', {}, 'GET')]) {
    assert.equal(isMutationResponse(value, 'fill'), false);
  }
});

test('save conflicts stop the reset without retrying against newer data', async () => {
  let calls = 0;
  await assert.rejects(saveEditor(async () => { calls++; throw new Error('revision conflict'); }, {}), /revision conflict/);
  assert.equal(calls, 1);
  await assert.rejects(saveEditor(async () => ({ operation_id: 'unrelated', revision: '8' }), {}), /valid operation receipt/);
});

test('capture waits for all tile saves and reports a rejected write', async () => {
  const page = new EventEmitter();
  const request = () => ({ method: () => 'POST', url: () => 'https://example.test/satify-api/session/editor-save' });
  const a = request(), b = request();
  const finished = trackEditorWrites(page);
  page.emit('request', a); page.emit('request', b);
  page.emit('requestfinished', a);
  let waits = 0;
  page.waitForTimeout = async () => { waits++; page.emit('requestfinished', b); };
  await finished();
  assert.equal(waits, 1, 'The first tile acknowledgement cannot finish a multi-tile save');
  page.emit('response', { request: () => b, ok: () => false, status: () => 409 });
  await assert.rejects(finished(), /409/);
});
