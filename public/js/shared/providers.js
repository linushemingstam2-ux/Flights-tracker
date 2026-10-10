// Live ADS-B data providers and the code that turns their responses into one
// common aircraft shape. Shared by the browser (direct mode) and the Node server.

import { FT_PER_M, KT_PER_MS, FPM_PER_MS, circleBounds, clamp } from './geo.js';

/** Positions older than this are treated as lost and not shown. */
export const MAX_POSITION_AGE_S = 60;

/**
 * Normalized aircraft:
 * {
 *   hex, callsign, reg, type, desc, operator,
 *   lat, lon, posAge (s),
 *   alt (ft, baro) | null, onGround, gs (kt) | null, track (deg) | null, vrate (ft/min) | null,
 *   squawk, emergency, category, military, source, country
 * }
 */

const READSB_SOURCES = {
  adsb_icao: 'ADS-B',
  adsb_icao_nt: 'ADS-B',
  adsb_other: 'ADS-B',
  adsr_icao: 'ADS-R',
  adsr_other: 'ADS-R',
  adsc: 'ADS-C',
  tisb_icao: 'TIS-B',
  tisb_other: 'TIS-B',
  tisb_trackfile: 'TIS-B',
  mlat: 'MLAT',
  mode_s: 'Mode S',
  other: 'Other',
};

// OpenSky's numeric emitter categories mapped to the ADS-B category codes readsb uses.
const OPENSKY_CATEGORIES = {
  2: 'A1', 3: 'A2', 4: 'A3', 5: 'A4', 6: 'A5', 7: 'A6', 8: 'A7',
  9: 'B1', 10: 'B2', 11: 'B3', 12: 'B4', 14: 'B6', 15: 'B7',
  16: 'C1', 17: 'C2', 18: 'C3', 19: 'C3', 20: 'C3',
};

const OPENSKY_SOURCES = ['ADS-B', 'ASTERIX', 'MLAT', 'FLARM'];

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const round = (v, digits) => (v == null ? null : Number(v.toFixed(digits)));

/** One aircraft from a readsb-style feed (adsb.lol, adsb.fi). */
export function normalizeReadsbAircraft(a) {
  if (!a || typeof a !== 'object') return null;
  const lat = num(a.lat);
  const lon = num(a.lon);
  const hex = str(a.hex).toLowerCase();
  if (lat == null || lon == null || !hex) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  const posAge = Math.max(0, num(a.seen_pos) ?? num(a.seen) ?? 0);
  if (posAge > MAX_POSITION_AGE_S) return null;

  const onGround = a.alt_baro === 'ground';
  const alt = onGround ? 0 : num(a.alt_baro) ?? num(a.alt_geom);
  const emergency = str(a.emergency);

  return {
    hex,
    callsign: str(a.flight),
    reg: str(a.r),
    type: str(a.t),
    desc: str(a.desc),
    operator: str(a.ownOp),
    lat,
    lon,
    posAge: round(posAge, 1),
    alt: alt == null ? null : Math.round(alt),
    onGround,
    gs: round(num(a.gs), 1),
    track: round(num(a.track) ?? num(a.true_heading) ?? num(a.mag_heading), 1),
    vrate: num(a.baro_rate) ?? num(a.geom_rate),
    squawk: str(a.squawk),
    emergency: emergency && emergency !== 'none' ? emergency : '',
    category: str(a.category),
    military: (Number(a.dbFlags) & 1) === 1,
    source: READSB_SOURCES[a.type] || '',
    country: '',
  };
}

export function parseReadsb(json) {
  if (!json || typeof json !== 'object') throw new Error('Unexpected response');
  const list = 'ac' in json ? json.ac : 'aircraft' in json ? json.aircraft : undefined;
  if (list === undefined) throw new Error(str(json.msg) || 'Unexpected response');
  if (!Array.isArray(list)) return [];
  return list.map(normalizeReadsbAircraft).filter(Boolean);
}

/** One state vector from the OpenSky Network REST API. */
export function normalizeOpenskyState(s, timeSec) {
  if (!Array.isArray(s)) return null;
  const hex = str(s[0]).toLowerCase();
  const lon = num(s[5]);
  const lat = num(s[6]);
  if (!hex || lat == null || lon == null) return null;

  const posTime = num(s[3]) ?? num(s[4]);
  const posAge = posTime != null && timeSec != null ? Math.max(0, timeSec - posTime) : 0;
  if (posAge > MAX_POSITION_AGE_S) return null;

  const onGround = s[8] === true;
  const altM = num(s[7]) ?? num(s[13]);
  const vel = num(s[9]);
  const vr = num(s[11]);

  return {
    hex,
    callsign: str(s[1]),
    reg: '',
    type: '',
    desc: '',
    operator: '',
    lat,
    lon,
    posAge: round(posAge, 1),
    alt: onGround ? 0 : altM == null ? null : Math.round(altM * FT_PER_M),
    onGround,
    gs: vel == null ? null : round(vel * KT_PER_MS, 1),
    track: round(num(s[10]), 1),
    vrate: vr == null ? null : Math.round(vr * FPM_PER_MS),
    squawk: str(s[14]),
    emergency: '',
    category: OPENSKY_CATEGORIES[s[17]] || '',
    military: false,
    source: OPENSKY_SOURCES[s[16]] || '',
    country: str(s[2]),
  };
}

export function parseOpensky(json) {
  if (!json || typeof json !== 'object' || !('states' in json)) throw new Error('Unexpected response');
  if (!Array.isArray(json.states)) return [];
  const time = num(json.time);
  return json.states.map((s) => normalizeOpenskyState(s, time)).filter(Boolean);
}

const coord = (v) => Number(v).toFixed(4);

/** Lookup kinds supported across providers: by ICAO hex, callsign or registration. */
export const LOOKUP_KINDS = ['hex', 'callsign', 'reg'];

export const PROVIDERS = {
  adsblol: {
    id: 'adsblol',
    name: 'adsb.lol',
    home: 'https://adsb.lol',
    maxRadius: 250,
    pollMs: 5000,
    minIntervalMs: 250,
    areaUrl: (lat, lon, r) => `https://api.adsb.lol/v2/point/${coord(lat)}/${coord(lon)}/${Math.round(r)}`,
    lookupUrl: (kind, value) => `https://api.adsb.lol/v2/${kind}/${encodeURIComponent(value)}`,
    parse: parseReadsb,
  },
  adsbfi: {
    id: 'adsbfi',
    name: 'adsb.fi',
    home: 'https://adsb.fi',
    maxRadius: 250,
    pollMs: 5000,
    minIntervalMs: 1000,
    areaUrl: (lat, lon, r) =>
      `https://opendata.adsb.fi/api/v3/lat/${coord(lat)}/lon/${coord(lon)}/dist/${Math.round(r)}`,
    lookupUrl: (kind, value) =>
      `https://opendata.adsb.fi/api/v2/${kind === 'reg' ? 'registration' : kind}/${encodeURIComponent(value)}`,
    parse: parseReadsb,
  },
  opensky: {
    id: 'opensky',
    name: 'OpenSky Network',
    home: 'https://opensky-network.org',
    maxRadius: 1500,
    pollMs: 10000,
    minIntervalMs: 5000,
    areaUrl: (lat, lon, r) => {
      const b = circleBounds(lat, lon, r);
      return (
        'https://opensky-network.org/api/states/all?extended=1' +
        `&lamin=${coord(b.south)}&lomin=${coord(b.west)}&lamax=${coord(b.north)}&lomax=${coord(b.east)}`
      );
    },
    // OpenSky can only look aircraft up by ICAO hex.
    lookupUrl: (kind, value) =>
      kind === 'hex'
        ? `https://opensky-network.org/api/states/all?extended=1&icao24=${encodeURIComponent(value)}`
        : null,
    parse: parseOpensky,
  },
};

/** Order tried when the source is "auto". */
export const AUTO_ORDER = ['adsblol', 'adsbfi', 'opensky'];

export function isValidSource(id) {
  return id === 'auto' || Object.hasOwn(PROVIDERS, id);
}

export function validLookup(kind, value) {
  if (!LOOKUP_KINDS.includes(kind) || typeof value !== 'string') return null;
  const v = value.trim();
  if (kind === 'hex') return /^~?[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null;
  if (kind === 'callsign') return /^[a-z0-9]{2,8}$/i.test(v) ? v.toUpperCase() : null;
  return /^[a-z0-9-]{2,10}$/i.test(v) ? v.toUpperCase() : null;
}

/** Clamp a requested radius to what the provider supports. */
export function effectiveRadius(provider, r) {
  return clamp(Math.ceil(r), 1, provider.maxRadius);
}

export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status}`);
    this.status = status;
    this.url = url;
  }
}

/** fetch() a JSON document with a timeout; throws HttpError on non-2xx. */
export async function fetchJson(url, { fetchImpl = globalThis.fetch, timeoutMs = 10000, headers } = {}) {
  const res = await fetchImpl(url, {
    headers: { Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new HttpError(res.status, url);
  return res.json();
}
