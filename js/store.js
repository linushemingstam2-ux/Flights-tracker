// Live aircraft state on the client: merges updates, extrapolates positions
// between updates so planes glide smoothly, and keeps a trail per aircraft.

import { distanceNm, normalizeLon } from './shared/geo.js';
import { countryForHex } from './shared/countries.js';

const MAX_EXTRAPOLATE_S = 30; // never dead-reckon further than this past the last fix
const SMOOTH_MS = 1500; // blend away the jump when a fresh position arrives
const MAX_SMOOTH_DEG = 0.25; // bigger jumps snap instead of sliding
const MISSING_GRACE_MS = 20_000; // keep an aircraft this long after a feed drops it
const SELECTED_GRACE_MS = 120_000;
const MAX_TRAIL = 1500;

const DATA_FIELDS = [
  'callsign', 'reg', 'type', 'desc', 'operator', 'alt', 'onGround', 'gs', 'track', 'vrate',
  'squawk', 'emergency', 'category', 'military', 'source', 'country',
];

export class AircraftStore {
  constructor() {
    this.byHex = new Map();
    this.sorted = []; // draw order: low altitude first so high traffic is on top
    this.selectedHex = null;
    this.version = 0;
  }

  get size() {
    return this.byHex.size;
  }

  get(hex) {
    return this.byHex.get(hex);
  }

  /** Display position of an aircraft at client time `t` (ms). */
  positionAt(ac, t) {
    let lat = ac.lat;
    let lon = ac.lon;
    if (ac.gs > 2 && ac.track != null) {
      const dt = Math.min(Math.max(0, (t - ac.posTime) / 1000), MAX_EXTRAPOLATE_S);
      const dist = (ac.gs * dt) / 3600; // nm
      if (dist > 0) {
        const rad = (ac.track * Math.PI) / 180;
        lat += (dist * Math.cos(rad)) / 60;
        lon += (dist * Math.sin(rad)) / (60 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
      }
    }
    if (ac.corr) {
      const k = 1 - (t - ac.corr.t) / SMOOTH_MS;
      if (k > 0) {
        lat += ac.corr.dLat * k;
        lon += ac.corr.dLon * k;
      } else {
        ac.corr = null;
      }
    }
    return [lat, lon];
  }

  /**
   * Merge a batch of normalized aircraft received at client time `t`.
   * `age` is how old the batch already was when the server sent it (s).
   * `area` ({lat, lon, radius}) marks a full snapshot of that circle: aircraft
   * inside it that are missing from the batch are dropped after a grace period.
   */
  ingest(list, { t = Date.now(), age = 0, area = null } = {}) {
    const seen = new Set();
    for (const a of list) {
      seen.add(a.hex);
      const posTime = t - (age + (a.posAge || 0)) * 1000;
      let ac = this.byHex.get(a.hex);
      if (!ac) {
        ac = { hex: a.hex, trail: [], firstSeen: t, corr: null };
        ac.countryInfo = countryForHex(a.hex);
        this.byHex.set(a.hex, ac);
        Object.assign(ac, pick(a), { lat: a.lat, lon: a.lon, posTime, lastSeen: t });
        pushTrail(ac, a.lat, a.lon, a.alt, posTime);
        continue;
      }
      if (posTime < ac.posTime - 500) {
        // Older than what we already have (e.g. a slower provider); keep the fresher fix.
        ac.lastSeen = t;
        continue;
      }
      const [beforeLat, beforeLon] = this.positionAt(ac, t);
      Object.assign(ac, pick(a), { lat: a.lat, lon: a.lon, posTime, lastSeen: t });
      ac.corr = null;
      const [afterLat, afterLon] = this.positionAt(ac, t);
      const dLat = beforeLat - afterLat;
      const dLon = normalizeLon(beforeLon - afterLon);
      if (Math.abs(dLat) < MAX_SMOOTH_DEG && Math.abs(dLon) < MAX_SMOOTH_DEG) {
        ac.corr = { dLat, dLon, t };
      }
      pushTrail(ac, a.lat, a.lon, a.alt, posTime);
    }

    if (area) {
      for (const [hex, ac] of this.byHex) {
        if (seen.has(hex)) continue;
        const selected = hex === this.selectedHex;
        const inside = distanceNm(area.lat, area.lon, ac.lat, ac.lon) <= area.radius;
        const grace = selected ? SELECTED_GRACE_MS : inside ? MISSING_GRACE_MS : 0;
        if (t - ac.lastSeen > grace) this.byHex.delete(hex);
      }
    }

    this.sorted = [...this.byHex.values()].sort((x, y) => sortAlt(x) - sortAlt(y));
    this.version++;
    return seen;
  }

  clear() {
    this.byHex.clear();
    this.sorted = [];
    this.version++;
  }

  /** Aircraft whose callsign, registration, hex or type match `q`, best matches first. */
  search(q, limit = 8) {
    const needle = q.trim().toUpperCase();
    if (!needle) return [];
    const scored = [];
    for (const ac of this.byHex.values()) {
      const fields = [ac.callsign, ac.reg, ac.hex.toUpperCase(), ac.type];
      let best = 0;
      for (const f of fields) {
        if (!f) continue;
        const v = f.toUpperCase();
        if (v === needle) best = Math.max(best, 3);
        else if (v.startsWith(needle)) best = Math.max(best, 2);
        else if (needle.length >= 3 && v.includes(needle)) best = Math.max(best, 1);
      }
      if (best) scored.push([best, ac]);
    }
    scored.sort((a, b) => b[0] - a[0] || (a[1].callsign || '').localeCompare(b[1].callsign || ''));
    return scored.slice(0, limit).map((s) => s[1]);
  }
}

function pick(a) {
  const out = {};
  for (const k of DATA_FIELDS) out[k] = a[k];
  return out;
}

function sortAlt(ac) {
  return ac.onGround ? -1 : ac.alt ?? 0;
}

function pushTrail(ac, lat, lon, alt, t) {
  const last = ac.trail[ac.trail.length - 1];
  if (last && (t <= last.t || (last.lat === lat && last.lon === lon))) return;
  // A big jump (e.g. a bad position) would draw a line across the map: restart the trail.
  if (last && distanceNm(last.lat, last.lon, lat, lon) > Math.max(30, ((t - last.t) / 3600000) * 1200)) {
    ac.trail.length = 0;
  }
  ac.trail.push({ lat, lon, alt, t });
  if (ac.trail.length > MAX_TRAIL) {
    // Thin out the oldest half rather than dropping the start of the flight.
    const half = ac.trail.length >> 1;
    ac.trail = ac.trail.slice(0, half).filter((_, i) => i % 2 === 0).concat(ac.trail.slice(half));
  }
}
