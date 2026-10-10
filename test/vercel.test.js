import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { READSB_SAMPLE } from './fixtures.js';

test('Vercel functions in api/ serve the API (with CORS)', async (t) => {
  // The functions use the global fetch; point it at a fake feed before loading them.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) =>
    String(url).includes('api.adsb.lol/v2/point/')
      ? new Response(JSON.stringify(READSB_SAMPLE), { headers: { 'Content-Type': 'application/json' } })
      : new Response('{}', { status: 404 });
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  const functions = {};
  for (const name of ['health', 'aircraft', 'find', 'route', 'info']) {
    functions[name] = (await import(`../api/${name}.js`)).default;
  }
  // Route like Vercel does: /api/<name> → api/<name>.js, with the original URL in req.url.
  const server = http.createServer((req, res) => functions[new URL(req.url, 'http://x').pathname.slice(5)](req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const health = await realFetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('access-control-allow-origin'), '*');
  assert.equal((await health.json()).ok, true);

  const res = await realFetch(`${base}/api/aircraft?lat=51.47&lon=-0.45&r=80`);
  const body = await res.json();
  assert.equal(body.source, 'adsblol');
  assert.equal(body.aircraft.length, 3);
});
