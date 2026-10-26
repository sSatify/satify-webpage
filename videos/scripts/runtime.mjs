import { chromium } from './browser.mjs';
import { mkdir, readFile, writeFile, rename, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash } from './project.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}
export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}
export async function configuration(options) {
  const base = await readJson(resolve(root, 'config.json'));
  const dataset = options.dataset || 'tools';
  if (!['tools', 'time-series'].includes(dataset)) throw new Error('Unknown dataset. Choose tools or time-series.');
  const config = dataset === 'time-series' ? { ...base, ...base.timeSeries } : { ...base };
  delete config.timeSeries;
  if (dataset === 'time-series') delete config.scene;
  config.dataset = dataset;
  const environments = { prod: base.baseUrl, dev: 'https://app-dev.satify.tech' };
  const environment = options.env ?? 'prod';
  if (!Object.hasOwn(environments, environment)) throw new Error('Unknown environment. Choose prod or dev.');
  if (options.env !== undefined && options.url !== undefined) {
    throw new Error('Choose either --env or --url, not both.');
  }
  config.baseUrl = (options.url || environments[environment]).replace(/\/$/, '');
  const url = new URL(config.baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('--url must be an HTTP(S) origin, without credentials, a path, or a query.');
  }
  config.baseUrl = url.origin;
  if (options.project) config.projectName = options.project.trim();
  if (!config.projectName) throw new Error('A nonempty project name is required.');
  config.stateDir = resolve(root, '.state', hash(`${config.baseUrl}|${config.projectName}`).slice(0, 20));
  config.authFile = resolve(root, '.state', `auth-${hash(config.baseUrl).slice(0, 20)}.json`);
  config.stateFile = resolve(config.stateDir, 'project.json');
  return config;
}

export async function launch(config, { login = false, headed = false } = {}) {
  let storageState;
  try { await access(config.authFile); storageState = config.authFile; }
  catch { /* An unauthenticated local instance can work without a login file. */ }
  const browser = await chromium.launch({ headless: !login && !headed,
    ...(login ? { args: ['--window-size=1280,900'] } : {}) });
  // Manual sign-in follows the window size; only recordings need fixed geometry.
  // Omit deviceScaleFactor with a null viewport (Playwright disallows that pair).
  const context = await browser.newContext({ storageState,
    ...(login ? { viewport: null } : { viewport: config.viewport, deviceScaleFactor: 1 }),
    locale: 'en-US', timezoneId: 'Europe/Berlin', colorScheme: 'light' });
  context.setDefaultTimeout(30_000);
  const apiBase = config.baseUrl + config.apiPath;
  let authorization;
  // Reuse the application's own authentication, including Supabase refreshes.
  // Keep the bearer token only in memory; never log it or put it in project.json.
  context.on('request', request => {
    if (request.url().startsWith(apiBase + '/')) {
      // The app sets Authorization explicitly, so it is in the request event.
      // allHeaders() needs a live page and can reject after connect closes it.
      const headers = request.headers();
      if (headers.authorization) authorization = headers.authorization;
    }
  });
  const api = async (method, path, options = {}) => {
    const { responseType = 'json', allowNotFound = false, ...requestOptions } = options;
    const response = await context.request.fetch(apiBase + path, {
      method, ...requestOptions, headers: authorization ? { Authorization: authorization } : {},
      timeout: 120_000, maxRedirects: 0,
    });
    if (response.status() === 404 && allowNotFound) return null;
    if (!response.ok()) {
      const authHint = response.status() === 401 ? ' Run npm run login for this URL first.' : '';
      throw new Error(`${method} ${path.split('?')[0]} failed (${response.status()}).${authHint}`);
    }
    return responseType === 'buffer' ? response.body() : response.json();
  };
  return { browser, context, api,
    async saveAuth() { await mkdir(dirname(config.authFile), { recursive: true }); await context.storageState({ path: config.authFile }); },
    async close() { await context.close(); await browser.close(); },
  };
}

export async function connect(runtime, config) {
  const page = await runtime.context.newPage();
  try {
    const ready = page.waitForResponse(response =>
      response.url().startsWith(config.baseUrl + config.apiPath + '/session/list'), { timeout: 30_000 });
    // Attach a rejection handler before navigation, so connection errors do not
    // leave an unhandled pending response promise.
    const result = await Promise.all([
      ready, page.goto(config.baseUrl + '/data-store', { waitUntil: 'domcontentloaded' }),
    ]);
    if (!result[0].ok()) throw new Error('Sign in with npm run login before setup.');
    await runtime.saveAuth();
  } catch (error) {
    throw new Error(`Cannot connect to ${config.baseUrl}. Check that SATIFY is reachable and run npm run login for this URL.`, { cause: error });
  } finally { await page.close(); }
}
