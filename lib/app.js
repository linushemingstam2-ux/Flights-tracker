// HTTP handler: serves the web app from public/ and a small JSON API that
// proxies the live ADS-B providers (avoiding browser CORS limits and sharing a cache).

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { PROVIDERS, AUTO_ORDER, isValidSource, validLookup } from '../public/js/shared/providers.js';
import { createUpstream } from './upstream.js';

const gzipAsync = promisify(gzip);
const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

class BadRequest extends Error {
  status = 400;
}

function number(params, name, min, max) {
  const raw = params.get(name);
  const v = raw === null || raw.trim() === '' ? NaN : Number(raw);
  if (!Number.isFinite(v) || v < min || v > max) throw new BadRequest(`"${name}" must be a number between ${min} and ${max}`);
  return v;
}

function source(params) {
  const s = params.get('source') || 'auto';
  if (!isValidSource(s)) throw new BadRequest(`Unknown source "${s}"`);
  return s;
}

async function send(req, res, status, body, headers = {}) {
  let data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  const h = {
    'X-Content-Type-Options': 'nosniff',
    ...(typeof body === 'object' && !Buffer.isBuffer(body) ? { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' } : {}),
    ...headers,
  };
  if (data.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    data = await gzipAsync(data);
    h['Content-Encoding'] = 'gzip';
    h['Vary'] = 'Accept-Encoding';
  }
  res.writeHead(status, h);
  res.end(req.method === 'HEAD' ? undefined : data);
}

export function createApp({ upstream = createUpstream(), now = Date.now, publicDir = PUBLIC_DIR, log = () => {} } = {}) {
  const trafficResponse = (r) => ({
    now: now(),
    source: r.provider.id,
    sourceName: r.provider.name,
    age: Math.max(0, (now() - r.fetchedAt) / 1000),
    radius: r.radius,
    capped: r.capped,
    aircraft: r.aircraft,
  });

  const routes = {
    '/api/health': async () => ({
      ok: true,
      sources: AUTO_ORDER.map((id) => ({ id, name: PROVIDERS[id].name, maxRadius: PROVIDERS[id].maxRadius, pollMs: PROVIDERS[id].pollMs })),
    }),

    '/api/aircraft': async (params) => {
      const lat = number(params, 'lat', -90, 90);
      const lon = number(params, 'lon', -180, 180);
      const r = number(params, 'r', 1, 5000);
      return trafficResponse(await upstream.area(lat, lon, r, source(params)));
    },

    '/api/find': async (params) => {
      const kind = ['hex', 'callsign', 'reg'].find((k) => params.has(k));
      const value = kind && validLookup(kind, params.get(kind));
      if (!value) throw new BadRequest('Provide a valid "hex", "callsign" or "reg"');
      return trafficResponse(await upstream.lookup(kind, value, source(params)));
    },

    '/api/route': async (params) => {
      const callsign = validLookup('callsign', params.get('callsign') || '');
      if (!callsign) throw new BadRequest('Provide a valid "callsign"');
      return { route: await upstream.route(callsign) };
    },

    '/api/info': async (params) => {
      const hex = validLookup('hex', params.get('hex') || '');
      if (!hex || hex.startsWith('~')) throw new BadRequest('Provide a valid ICAO "hex"');
      const [info, photo] = await Promise.all([
        upstream.info(hex).catch(() => null),
        upstream.photo(hex).catch(() => null),
      ]);
      return { info, photo: photo || info?.photo || null };
    },
  };

  async function serveStatic(req, res, pathname) {
    let rel;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      rel = '\0';
    }
    if (rel.includes('\0')) return send(req, res, 400, 'Bad request', { 'Content-Type': MIME['.txt'] });
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(publicDir, '.' + path.posix.normalize('/' + rel));
    if (file !== publicDir && !file.startsWith(publicDir + path.sep)) {
      return send(req, res, 403, 'Forbidden', { 'Content-Type': MIME['.txt'] });
    }
    try {
      const info = await stat(file);
      if (!info.isFile()) throw Object.assign(new Error('not a file'), { code: 'ENOENT' });
      const ext = path.extname(file).toLowerCase();
      const body = await readFile(file);
      const cache = file.includes(`${path.sep}vendor${path.sep}`) ? 'public, max-age=604800' : 'no-cache';
      return send(req, res, 200, body, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache });
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
        return send(req, res, 404, 'Not found', { 'Content-Type': MIME['.txt'] });
      }
      throw err;
    }
  }

  return async function handle(req, res) {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return send(req, res, 400, { error: 'Bad request' });
    }
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return send(req, res, 405, { error: 'Method not allowed' }, { Allow: 'GET, HEAD' });
      }
      if (url.pathname.startsWith('/api/')) {
        // Public, read-only data: let the app on other origins (e.g. GitHub Pages) use this API.
        res.setHeader('Access-Control-Allow-Origin', '*');
        const route = routes[url.pathname];
        if (!route) return send(req, res, 404, { error: 'Not found' });
        return send(req, res, 200, await route(url.searchParams));
      }
      return await serveStatic(req, res, url.pathname);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) log(`[server] ${req.method} ${url.pathname}: ${err.message}`);
      if (!res.headersSent) return send(req, res, status, { error: status === 500 ? 'Internal error' : err.message });
      res.destroy();
    }
  };
}
