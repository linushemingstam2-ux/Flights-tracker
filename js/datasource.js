// Where live traffic comes from in the browser:
//  - ServerSource: the bundled Node server's /api (best: shared cache, no CORS limits)
//  - DirectSource: straight to the public providers (for static hosting, e.g. GitHub Pages),
//    through a public CORS relay when a provider doesn't allow browsers to read it directly

import { PROVIDERS, AUTO_ORDER, effectiveRadius, fetchJson, HttpError } from './shared/providers.js';
import { routeUrl, aircraftInfoUrl, photoUrl, parseRoute, parseAircraftInfo, parsePhoto } from './shared/enrich.js';

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  let body = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON error page.
  }
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body;
}

export async function createDataSource() {
  try {
    const health = await getJson('api/health');
    if (health?.ok) return new ServerSource();
  } catch {
    // No backend: this is a static deployment.
  }
  return new DirectSource();
}

const pollMsFor = (source) => PROVIDERS[source]?.pollMs ?? 5000;

class ServerSource {
  mode = 'server';

  pollMs(source) {
    return pollMsFor(source);
  }

  area(lat, lon, r, source) {
    const q = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4), r: Math.ceil(r), source });
    return getJson(`api/aircraft?${q}`);
  }

  find(kind, value, source) {
    return getJson(`api/find?${new URLSearchParams({ [kind]: value, source })}`);
  }

  async route(callsign) {
    return (await getJson(`api/route?${new URLSearchParams({ callsign })}`)).route;
  }

  details(hex) {
    return getJson(`api/info?${new URLSearchParams({ hex })}`);
  }
}

// Public relays that add the CORS headers some providers leave out. They only see the
// provider URL being requested (an area on the map), nothing about the viewer.
const ROUTES = [
  { name: 'direct', wrap: (url) => url },
  { name: 'relay allorigins', wrap: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
  { name: 'relay codetabs', wrap: (url) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}` },
];
const workingRoute = new Map(); // host -> index into ROUTES that last worked

function describe(err) {
  if (err instanceof HttpError) return `HTTP ${err.status}`;
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return 'timed out';
  if (err instanceof TypeError) return 'blocked'; // usually CORS: the provider doesn't allow browsers
  return err?.message || 'failed';
}

/** fetchJson() that falls back to a relay when the browser can't read a provider directly. */
async function getJsonAnyRoute(url) {
  const host = new URL(url).host;
  const start = workingRoute.get(host) ?? 0;
  const problems = [];
  for (let i = 0; i < ROUTES.length; i++) {
    const idx = (start + i) % ROUTES.length;
    try {
      const json = await fetchJson(ROUTES[idx].wrap(url), { timeoutMs: idx ? 12000 : 8000 });
      workingRoute.set(host, idx);
      return json;
    } catch (err) {
      // A direct HTTP error is the provider's real answer (e.g. 404 or 429); a relay won't change it.
      if (idx === 0 && err instanceof HttpError) throw err;
      problems.push(`${ROUTES[idx].name} ${describe(err)}`);
    }
  }
  throw new Error(problems.join(', '));
}

class DirectSource {
  mode = 'direct';
  cooldown = new Map();

  pollMs(source) {
    return pollMsFor(source);
  }

  async _withFallback(source, supports, run) {
    const ids = source === 'auto' ? AUTO_ORDER : [source];
    const now = Date.now();
    let list = ids.map((id) => PROVIDERS[id]).filter(supports);
    const ready = list.filter((p) => (this.cooldown.get(p.id) ?? 0) <= now);
    if (ready.length) list = ready;
    const errors = [];
    for (const p of list) {
      try {
        const res = await run(p);
        this.cooldown.delete(p.id);
        return { source: p.id, sourceName: p.name, age: 0, ...res };
      } catch (err) {
        const limited = err instanceof HttpError && err.status === 429;
        this.cooldown.set(p.id, Date.now() + (limited ? 60_000 : 20_000));
        errors.push(`${p.name}: ${describe(err)}`);
      }
    }
    throw new Error(errors.length ? `No live data source available (${errors.join('; ')})` : 'Not supported');
  }

  area(lat, lon, r, source) {
    return this._withFallback(source, () => true, async (p) => {
      const radius = effectiveRadius(p, r);
      const aircraft = p.parse(await getJsonAnyRoute(p.areaUrl(lat, lon, radius)));
      return { aircraft, radius, capped: radius < r };
    });
  }

  find(kind, value, source) {
    return this._withFallback(
      source,
      (p) => p.lookupUrl(kind, value) != null,
      async (p) => ({ aircraft: (await parseOr404(p.lookupUrl(kind, value), p.parse)) ?? [] }),
    );
  }

  async route(callsign) {
    return parseOr404(routeUrl(callsign), parseRoute);
  }

  async details(hex) {
    const [info, photo] = await Promise.all([
      parseOr404(aircraftInfoUrl(hex), parseAircraftInfo).catch(() => null),
      parseOr404(photoUrl(hex), parsePhoto).catch(() => null),
    ]);
    return { info, photo: photo || info?.photo || null };
  }
}

async function parseOr404(url, parse) {
  try {
    return parse(await getJsonAnyRoute(url));
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}
