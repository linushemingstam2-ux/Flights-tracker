import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../lib/app.js';
import { createUpstream } from '../lib/upstream.js';
import { READSB_SAMPLE, ADSBDB_ROUTE, PLANESPOTTERS, OPENSKY_SAMPLE } from './fixtures.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Fake upstream: maps URL substrings to handlers and records calls. */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push(String(url));
    for (const [match, handler] of Object.entries(routes)) {
      if (String(url).includes(match)) return handler(String(url), opts);
    }
    return json(404, { error: 'not found' });
  };
  fn.calls = calls;
  return fn;
}

async function startServer(fetchImpl, opts = {}) {
  // A fake clock that rate-limit waits advance instantly.
  let clock = 1_000_000;
  const now = () => clock;
  const sleep = async (ms) => {
    clock += ms;
  };
  const upstream = createUpstream({ fetchImpl, now, sleep, opensky: {}, ...opts });
  const server = http.createServer(createApp({ upstream, now }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    get: (path) => fetch(base + path),
    close: () => new Promise((r) => server.close(r)),
  };
}

test('GET /api/aircraft returns normalized traffic from adsb.lol', async (t) => {
  const f = fakeFetch({ 'api.adsb.lol/v2/point/': () => json(200, READSB_SAMPLE) });
  const s = await startServer(f);
  t.after(s.close);

  const res = await s.get('/api/aircraft?lat=51.47&lon=-0.45&r=100');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.source, 'adsblol');
  assert.equal(body.radius, 100);
  assert.equal(body.capped, false);
  assert.equal(body.aircraft.length, 3);
  assert.equal(body.aircraft[0].callsign, 'BAW283');
  assert.equal(f.calls[0], 'https://api.adsb.lol/v2/point/51.4700/-0.4500/100');

  // A second request for the same area is served from cache.
  await (await s.get('/api/aircraft?lat=51.47&lon=-0.45&r=100')).json();
  assert.equal(f.calls.length, 1);
});

test('radius is capped to what the provider supports', async (t) => {
  const f = fakeFetch({ 'api.adsb.lol': () => json(200, { ac: [] }) });
  const s = await startServer(f);
  t.after(s.close);
  const body = await (await s.get('/api/aircraft?lat=10&lon=10&r=900')).json();
  assert.equal(body.radius, 250);
  assert.equal(body.capped, true);
  assert.match(f.calls[0], /\/250$/);
});

test('falls back to the next provider when one fails', async (t) => {
  const f = fakeFetch({
    'api.adsb.lol': () => json(429, {}),
    'opendata.adsb.fi': () => json(200, { aircraft: READSB_SAMPLE.ac }),
  });
  const s = await startServer(f);
  t.after(s.close);
  const body = await (await s.get('/api/aircraft?lat=51&lon=0&r=50')).json();
  assert.equal(body.source, 'adsbfi');
  assert.equal(body.aircraft.length, 3);

  // Failed providers cool down and are skipped on the next request.
  f.calls.length = 0;
  await (await s.get('/api/aircraft?lat=40&lon=0&r=50')).json();
  assert.ok(f.calls.every((u) => u.includes('adsb.fi')), f.calls.join(','));
});

test('falls back to OpenSky and reports 502 when everything is down', async (t) => {
  let openskyUp = true;
  const f = fakeFetch({
    'api.adsb.lol': () => json(500, {}),
    'opendata.adsb.fi': () => {
      throw new TypeError('fetch failed');
    },
    'opensky-network.org': () => (openskyUp ? json(200, OPENSKY_SAMPLE) : json(500, {})),
  });
  const s = await startServer(f);
  t.after(s.close);
  const body = await (await s.get('/api/aircraft?lat=50&lon=8&r=60')).json();
  assert.equal(body.source, 'opensky');
  assert.equal(body.aircraft[0].callsign, 'DLH9LF');

  openskyUp = false;
  const res = await s.get('/api/aircraft?lat=20&lon=8&r=60&source=opensky');
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /OpenSky Network: HTTP 500/);
});

test('OpenSky requests carry an OAuth token when credentials are configured', async (t) => {
  const f = fakeFetch({
    'auth.opensky-network.org': () => json(200, { access_token: 'tok123', expires_in: 1800 }),
    'opensky-network.org/api': (_url, opts) => {
      assert.equal(opts.headers.Authorization, 'Bearer tok123');
      return json(200, OPENSKY_SAMPLE);
    },
  });
  const s = await startServer(f, { opensky: { clientId: 'id', clientSecret: 'secret' } });
  t.after(s.close);
  const res = await s.get('/api/aircraft?lat=50&lon=8&r=60&source=opensky');
  assert.equal(res.status, 200);
});

test('GET /api/find looks aircraft up by hex, callsign or registration', async (t) => {
  const f = fakeFetch({ 'api.adsb.lol/v2/callsign/BAW283': () => json(200, { ac: [READSB_SAMPLE.ac[0]] }) });
  const s = await startServer(f);
  t.after(s.close);
  const body = await (await s.get('/api/find?callsign=baw283')).json();
  assert.equal(body.aircraft[0].hex, '4007f1');

  const bad = await s.get('/api/find?callsign=../../x');
  assert.equal(bad.status, 400);
});

test('a 404 from a lookup is "not found", not an outage', async (t) => {
  const f = fakeFetch({
    'api.adsb.lol/v2/hex/': () => json(404, {}),
    'api.adsb.lol/v2/point/': () => json(200, READSB_SAMPLE),
  });
  const s = await startServer(f);
  t.after(s.close);
  const body = await (await s.get('/api/find?hex=abcdef')).json();
  assert.deepEqual(body.aircraft, []);
  assert.equal((await (await s.get('/api/aircraft?lat=51&lon=0&r=50')).json()).source, 'adsblol');
});

test('OpenSky is skipped for lookups it cannot do', async (t) => {
  const f = fakeFetch({ 'opensky-network.org': () => json(200, OPENSKY_SAMPLE) });
  const s = await startServer(f);
  t.after(s.close);
  const res = await s.get('/api/find?reg=G-XWBA&source=opensky');
  assert.equal(res.status, 400);
  assert.equal(f.calls.length, 0);
});

test('GET /api/route and /api/info proxy adsbdb and planespotters', async (t) => {
  const f = fakeFetch({
    'api.adsbdb.com/v0/callsign/BAW283': () => json(200, ADSBDB_ROUTE),
    'api.adsbdb.com/v0/callsign/ZZZ999': () => json(404, { response: 'unknown callsign' }),
    'api.adsbdb.com/v0/aircraft/4007f1': () =>
      json(200, { response: { aircraft: { registration: 'G-XWBA', registered_owner: 'British Airways' } } }),
    'api.planespotters.net/pub/photos/hex/4007f1': () => json(200, PLANESPOTTERS),
  });
  const s = await startServer(f);
  t.after(s.close);

  const route = await (await s.get('/api/route?callsign=BAW283')).json();
  assert.equal(route.route.destination.icao, 'KJFK');
  const unknown = await (await s.get('/api/route?callsign=ZZZ999')).json();
  assert.equal(unknown.route, null);

  const info = await (await s.get('/api/info?hex=4007F1')).json();
  assert.equal(info.info.owner, 'British Airways');
  assert.equal(info.photo.photographer, 'Jane Spotter');
});

test('validates query parameters', async (t) => {
  const s = await startServer(fakeFetch({}));
  t.after(s.close);
  for (const q of ['lat=91&lon=0&r=10', 'lat=0&lon=0', 'lat=x&lon=0&r=1', 'lat=0&lon=0&r=10&source=evil']) {
    const res = await s.get(`/api/aircraft?${q}`);
    assert.equal(res.status, 400, q);
  }
  assert.equal((await s.get('/api/nope')).status, 404);
});

test('serves the web app and blocks path traversal', async (t) => {
  const s = await startServer(fakeFetch({}));
  t.after(s.close);
  const index = await s.get('/');
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type'), /text\/html/);
  assert.match(await index.text(), /<title>Tracker/);

  const js = await s.get('/js/shared/providers.js');
  assert.match(js.headers.get('content-type'), /javascript/);

  for (const p of ['/../package.json', '/%2e%2e/package.json', '/js/../../server.js', '/%00']) {
    const res = await s.get(p);
    assert.ok([400, 403, 404].includes(res.status), `${p} → ${res.status}`);
    assert.doesNotMatch(await res.text(), /"name": "tracker"|createServer/);
  }
  assert.equal((await fetch(s.base + '/', { method: 'POST' })).status, 405);
});

test('/api/health lists the sources', async (t) => {
  const s = await startServer(fakeFetch({}));
  t.after(s.close);
  const body = await (await s.get('/api/health')).json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.sources.map((x) => x.id), ['adsblol', 'adsbfi', 'opensky']);
});
