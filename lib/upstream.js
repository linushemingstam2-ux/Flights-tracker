// Fetches live traffic from the public ADS-B providers with caching, per-provider
// rate limiting, automatic fallback and (optional) OpenSky OAuth2 credentials.

import {
  PROVIDERS,
  AUTO_ORDER,
  HttpError,
  effectiveRadius,
  fetchJson,
} from '../public/js/shared/providers.js';
import { routeUrl, aircraftInfoUrl, photoUrl, parseRoute, parseAircraftInfo, parsePhoto } from '../public/js/shared/enrich.js';
import { TtlCache } from './cache.js';

const USER_AGENT = 'Tracker-FlightRadar/1.0 (+https://github.com/linushemingstam2-ux/Tracker)';
const OPENSKY_TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const MAX_QUEUE_WAIT_MS = 3000;
const HOUR = 3600_000;

export class ProviderBusyError extends Error {}

export function createUpstream({
  fetchImpl = globalThis.fetch,
  now = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  opensky = { clientId: process.env.OPENSKY_CLIENT_ID, clientSecret: process.env.OPENSKY_CLIENT_SECRET },
  log = () => {},
} = {}) {
  const cache = new TtlCache({ now });
  const nextSlot = new Map(); // provider id -> earliest time the next request may start
  const cooldown = new Map(); // provider id -> time until which it is skipped in "auto"
  let openskyToken = null;

  // Space requests to each provider by its minimum interval; refuse instead of queueing forever.
  async function waitForSlot(p) {
    const t = now();
    const slot = Math.max(t, nextSlot.get(p.id) ?? 0);
    if (slot - t > Math.max(MAX_QUEUE_WAIT_MS, p.minIntervalMs * 2)) throw new ProviderBusyError(`${p.name} is busy`);
    nextSlot.set(p.id, slot + p.minIntervalMs);
    if (slot > t) await sleep(slot - t);
  }

  async function authHeaders(p) {
    if (p.id !== 'opensky' || !opensky?.clientId || !opensky?.clientSecret) return {};
    if (!openskyToken || openskyToken.expires - 60_000 < now()) {
      const res = await fetchImpl(OPENSKY_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: opensky.clientId,
          client_secret: opensky.clientSecret,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new HttpError(res.status, OPENSKY_TOKEN_URL);
      const json = await res.json();
      openskyToken = { value: json.access_token, expires: now() + (json.expires_in || 1800) * 1000 };
    }
    return { Authorization: `Bearer ${openskyToken.value}` };
  }

  async function request(p, url) {
    await waitForSlot(p);
    const headers = { 'User-Agent': USER_AGENT, ...(await authHeaders(p)) };
    return p.parse(await fetchJson(url, { fetchImpl, headers }));
  }

  function candidates(source, supports) {
    const all = (source === 'auto' ? AUTO_ORDER : [source]).map((id) => PROVIDERS[id]).filter(supports);
    if (source !== 'auto') return all;
    const t = now();
    const ready = all.filter((p) => (cooldown.get(p.id) ?? 0) <= t);
    // If everything is cooling down, still try them all rather than fail outright.
    return ready.length ? ready : all;
  }

  async function withFallback(source, supports, run) {
    const errors = [];
    for (const p of candidates(source, supports)) {
      try {
        const result = await run(p);
        cooldown.delete(p.id);
        return { provider: p, ...result };
      } catch (err) {
        if (!(err instanceof ProviderBusyError)) {
          const rateLimited = err instanceof HttpError && err.status === 429;
          cooldown.set(p.id, now() + (rateLimited ? 60_000 : 20_000));
        }
        errors.push(`${p.name}: ${err.message}`);
        log(`[upstream] ${p.name} failed: ${err.message}`);
      }
    }
    const err = new Error(
      errors.length ? `No live data source available (${errors.join('; ')})` : 'Not supported by this data source',
    );
    err.status = errors.length ? 502 : 400;
    throw err;
  }

  /** Aircraft within `r` nm of (lat, lon). */
  function area(lat, lon, r, source = 'auto') {
    return withFallback(source, () => true, async (p) => {
      const radius = effectiveRadius(p, r);
      const key = `area:${p.id}:${lat.toFixed(2)}:${lon.toFixed(2)}:${radius}`;
      const entry = await cache.wrap(
        key,
        async () => ({ aircraft: await request(p, p.areaUrl(lat, lon, radius)), fetchedAt: now() }),
        Math.max(2000, p.pollMs - 1000),
      );
      return { ...entry, radius, capped: radius < r };
    });
  }

  /** Aircraft matching a hex / callsign / registration anywhere in the world. */
  function lookup(kind, value, source = 'auto') {
    return withFallback(source, (p) => p.lookupUrl(kind, value) != null, async (p) => {
      const url = p.lookupUrl(kind, value);
      return cache.wrap(
        `lookup:${p.id}:${kind}:${value}`,
        async () => {
          try {
            return { aircraft: await request(p, url), fetchedAt: now() };
          } catch (err) {
            // Some feeds answer 404 for "no such aircraft": that's an empty result, not an outage.
            if (err instanceof HttpError && err.status === 404) return { aircraft: [], fetchedAt: now() };
            throw err;
          }
        },
        3000,
      );
    });
  }

  // Enrichment lookups: 404 means "not known", which is cached like a result.
  async function enrich(key, url, parse) {
    return cache.wrap(
      key,
      async () => {
        try {
          return { value: parse(await fetchJson(url, { fetchImpl, headers: { 'User-Agent': USER_AGENT } })) };
        } catch (err) {
          if (err instanceof HttpError && err.status === 404) return { value: null };
          throw err;
        }
      },
      (v) => (v.value ? 12 * HOUR : HOUR),
    ).then((v) => v.value);
  }

  return {
    area,
    lookup,
    route: (callsign) => enrich(`route:${callsign}`, routeUrl(callsign), parseRoute),
    info: (hex) => enrich(`info:${hex}`, aircraftInfoUrl(hex), parseAircraftInfo),
    photo: (hex) => enrich(`photo:${hex}`, photoUrl(hex), parsePhoto),
  };
}
