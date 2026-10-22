import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect, launch } from '../scripts/runtime.mjs';

test('saved login and refreshed bearer auth survive closing the setup page', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'satify-video-auth-'));
  let expectedToken = 'fixture-first';
  const server = createServer((request, response) => {
    if (request.url === '/data-store') {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(`<script>
        document.cookie = 'fixtureSession=present; path=/';
        fetch('/satify-api/session/list', { headers: { Authorization: 'Bearer ${expectedToken}' } });
      </script>`);
      return;
    }
    const authorized = request.headers.authorization === `Bearer ${expectedToken}`
      && request.headers.cookie?.includes('fixtureSession=present');
    response.writeHead(authorized ? 200 : 401, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(authorized ? { sessions: [] } : { error: 'unauthorized' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const config = { baseUrl: `http://127.0.0.1:${server.address().port}`,
    apiPath: '/satify-api', authFile: join(directory, 'auth.json'),
    viewport: { width: 1000, height: 900 } };
  let runtime;
  try {
    runtime = await launch(config);
    await connect(runtime, config);
    assert.equal(runtime.context.pages().length, 0);
    assert.deepEqual(await runtime.api('GET', '/session/list'), { sessions: [] });
    await runtime.close();
    runtime = undefined;

    // A new browser restores the saved cookies and captures the current token.
    runtime = await launch(config);
    assert.ok((await runtime.context.cookies()).some(cookie => cookie.name === 'fixtureSession'));
    expectedToken = 'fixture-refreshed';
    await connect(runtime, config);
    assert.equal(runtime.context.pages().length, 0);
    assert.deepEqual(await runtime.api('GET', '/session/list'), { sessions: [] });

    // Later browser requests can refresh authorization again in the same run.
    expectedToken = 'fixture-refreshed-again';
    await connect(runtime, config);
    assert.deepEqual(await runtime.api('GET', '/session/list'), { sessions: [] });
  } finally {
    try { if (runtime) await runtime.close(); }
    finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await rm(directory, { recursive: true, force: true });
    }
  }
});
