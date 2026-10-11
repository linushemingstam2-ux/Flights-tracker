// Simulated traffic for demo mode (offline use, or when every live source is down).
// Thousands of made-up airline flights between real airports, flown worldwide in real time: each
// climbs out, cruises along the great circle and descends to land, so routes, progress and trails
// work as they do live. Light aircraft and helicopters potter about near airports. Everything
// here is made up; the UI labels it clearly as a simulation.

import { distanceNm, bearingDeg, destinationPoint } from './shared/geo.js';
import { hexRangeFor } from './shared/countries.js?v=2';
import { AIRPORTS, AIRLINES, TYPES, LOCAL_TYPES, LOCAL_REG } from './sim-data.js';

const AIRBORNE = 12000; // airliners in the air worldwide at any moment
const MAX_RADIUS = 1000; // nm served per request: wider views show a circle of traffic, as live
const CLIMB_NM = 38; // scale of the climb: 95% of cruise height about 115 nm after take-off
const DESCENT_FT_PER_NM = 310; // a 3° descent all the way down to the runway
const ROLLOUT_S = 75; // time on the ground after landing, slowing to taxi speed
const LOCAL_LEASH_NM = 35; // light aircraft turn back towards home beyond this
const SOURCE = { source: 'demo', sourceName: 'Demo (simulated)' };
const DEG = Math.PI / 180;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const letter = () => LETTERS[Math.floor(Math.random() * 26)];

/** A function that picks from `items`, each with probability proportional to `weight(item)`. */
function weighted(items, weight) {
  const cum = [];
  let total = 0;
  for (const item of items) cum.push((total += weight(item)));
  return () => {
    const x = Math.random() * total;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] > x) hi = mid;
      else lo = mid + 1;
    }
    return items[lo];
  };
}

/** A registration from a pattern: @ is a letter, 9 a digit, # a digit other than 0. */
function fillPattern(pattern) {
  return pattern.replace(/[@9#]/g, (c) => {
    if (c === '@') return letter();
    return String(c === '#' ? 1 + Math.floor(Math.random() * 9) : Math.floor(Math.random() * 10));
  });
}

/** A transponder code that is not one of the special ones (emergencies, VFR, unassigned). */
function squawk() {
  const digits = () => Math.floor(Math.random() * 8);
  return `${1 + Math.floor(Math.random() * 6)}${digits()}${digits()}${digits()}`;
}

const countryName = (() => {
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    return (code) => names.of(code) || code;
  } catch {
    return (code) => code;
  }
})();

// ── Reference data, unpacked ───────────────────────────────────────────────

const airports = AIRPORTS.map(([iata, icao, name, city, countryCode, lat, lon, size]) => ({
  iata, icao, name, city, country: countryName(countryCode), countryCode, lat, lon, size,
}));
const AIRPORT = new Map(airports.map((a) => [a.iata, a]));
const TYPE = new Map(
  TYPES.map(([type, desc, category, cruiseKt, cruiseFt, minNm, maxNm]) => [type, { type, desc, category, cruiseKt, cruiseFt, minNm, maxNm }]),
);
const airlines = AIRLINES.map((a) => ({
  ...a,
  hubs: a.hubs.split(' ').map((code) => AIRPORT.get(code)),
  fleet: a.fleet.split(' ').map((code) => TYPE.get(code)),
}));
const pickAirline = weighted(airlines, (a) => a.size);

// Airports within range of each airport for each aircraft type; the big hubs get most flights,
// and nearly all the long-haul ones.
const destinations = new Map(); // "LHR A320" -> picker, or null when none is in range
function pickDestination(from, type) {
  const key = `${from.iata} ${type.type}`;
  if (!destinations.has(key)) {
    const list = airports.filter((a) => {
      const d = distanceNm(from.lat, from.lon, a.lat, a.lon);
      return d >= type.minNm && d <= type.maxNm;
    });
    destinations.set(key, list.length ? weighted(list, (a) => a.size ** (type.category === 'A5' ? 3 : 2)) : null);
  }
  return destinations.get(key)?.() ?? null;
}

// ── Flight profile ─────────────────────────────────────────────────────────

/** Height (ft) `d` nm into a flight: climbing out, cruising, then a steady 3° descent to land. */
export function altitudeAt(f, d) {
  if (d >= f.dist) return 0;
  const climb = f.cruise * 1.04 * (1 - Math.exp(-d / CLIMB_NM));
  return Math.max(0, Math.min(f.cruise, climb, (f.dist - d) * DESCENT_FT_PER_NM));
}

/** True airspeed (kt): 150 kt near the ground, 250 kt at 10,000 ft, then up to cruise speed. */
function airspeedAt(f, alt) {
  const v10 = Math.min(f.cruiseKt, 250);
  if (alt <= 10000) return 150 + (v10 - 150) * (alt / 10000);
  return v10 + (f.cruiseKt - v10) * Math.sqrt(Math.min(1, (alt - 10000) / Math.max(1, f.cruise - 10000)));
}

function groundSpeedAt(f, alt) {
  return airspeedAt(f, alt) + f.wind * Math.min(1, alt / f.cruise);
}

/** Cruise height: lower on short hops, odd thousands of feet eastbound and even westbound. */
function cruiseHeight(type, dist, bearing) {
  let fl = Math.min(type.cruiseFt / 1000 + Math.floor(rnd(-2, 1.5)), Math.round((dist * 120 + 8000) / 1000));
  if ((fl % 2 === 1) !== bearing < 180) fl -= 1;
  return fl * 1000;
}

// ── The simulation ─────────────────────────────────────────────────────────

export class SimSource {
  mode = 'demo';

  constructor() {
    this.flights = new Map(); // hex -> flight
    this.callsigns = new Set(); // every callsign handed out, so a cached route never goes stale
    this.last = Date.now();
    for (let i = 0; i < AIRBORNE; i++) this._add(this._airliner(true));
    for (const airport of airports) {
      if (!LOCAL_REG[airport.countryCode]) continue;
      for (let i = 0; i < airport.size; i++) this._add(this._local(airport));
    }
  }

  pollMs() {
    return 2000;
  }

  _add(f) {
    this.flights.set(f.hex, f);
  }

  _hex(country) {
    const [lo, hi] = hexRangeFor(country) ?? [0xa00000, 0xafffff];
    for (;;) {
      const hex = (lo + Math.floor(Math.random() * (hi - lo + 1))).toString(16).padStart(6, '0');
      if (!this.flights.has(hex)) return hex;
    }
  }

  _callsign(airline) {
    for (let tries = 0; ; tries++) {
      if (tries === 50) this.callsigns.clear(); // after many hours: start reusing them
      let number = String(Math.floor(rnd(1, airline.alpha ? 10000 : 3000)));
      if (airline.alpha && Math.random() < 0.5) number = number.slice(0, 2) + letter() + letter(); // e.g. EZY45TP
      const callsign = airline.icao + number;
      if (!this.callsigns.has(callsign)) {
        this.callsigns.add(callsign);
        return callsign;
      }
    }
  }

  /** A new airline flight: taking off now, or (`airborne`) already somewhere along its route. */
  _airliner(airborne) {
    for (;;) {
      const airline = pickAirline();
      const hub = pick(airline.hubs);
      const type = pick(airline.fleet);
      const other = pickDestination(hub, type);
      if (!other) continue;
      const [from, to] = Math.random() < 0.5 ? [hub, other] : [other, hub];
      const dist = distanceNm(from.lat, from.lon, to.lat, to.lon);
      // Long flights stay in the air for longer, so more of those airborne at any moment are long.
      if (airborne && Math.random() > (dist + 200) / 9000) continue;
      const bearing = bearingDeg(from.lat, from.lon, to.lat, to.lon);
      const f = {
        kind: 'airliner',
        hex: this._hex(airline.country),
        callsign: this._callsign(airline),
        reg: fillPattern(airline.reg),
        airline,
        type,
        from,
        to,
        dist,
        bearing,
        cruise: cruiseHeight(type, dist, bearing),
        cruiseKt: type.cruiseKt + rnd(-10, 10),
        // Wind at cruise height: the jet stream speeds eastbound flights and slows westbound ones.
        wind: Math.sin(bearing * DEG) * 40 + rnd(-15, 15),
        d: airborne ? rnd(0.3, dist - 1) : 0.3, // nm flown
        landed: 0, // time of touchdown
        squawk: squawk(),
        track: bearing,
      };
      this._place(f);
      return f;
    }
  }

  /** A light aircraft or helicopter near `airport`. */
  _local(airport) {
    const [type, desc, category, speed, low, high] = pick(LOCAL_TYPES);
    const [lat, lon] = destinationPoint(airport.lat, airport.lon, rnd(0, 360), Math.sqrt(Math.random()) * LOCAL_LEASH_NM);
    const alt = Math.round(rnd(low, high) / 100) * 100;
    return {
      kind: 'local',
      hex: this._hex(airport.countryCode),
      callsign: '',
      reg: fillPattern(LOCAL_REG[airport.countryCode]),
      type: { type, desc, category },
      home: airport,
      low,
      high,
      lat,
      lon,
      alt,
      targetAlt: alt,
      gs: speed + rnd(-10, 10),
      track: rnd(0, 360),
      turn: 0,
      vrate: 0,
      squawk: airport.countryCode === 'US' || airport.countryCode === 'CA' ? '1200' : '7000', // flying VFR
      landed: 0,
    };
  }

  /** Position, height and speed of an airliner from how far along its route it is. */
  _place(f) {
    [f.lat, f.lon] = destinationPoint(f.from.lat, f.from.lon, f.bearing, f.d);
    if (f.landed) return;
    f.alt = altitudeAt(f, f.d);
    f.gs = groundSpeedAt(f, f.alt);
    const ahead = altitudeAt(f, Math.min(f.dist, f.d + 0.5));
    f.vrate = ((ahead - f.alt) / 0.5) * (f.gs / 60);
    if (f.dist - f.d > 1) f.track = bearingDeg(f.lat, f.lon, f.to.lat, f.to.lon);
  }

  _wander(f, dt) {
    if (distanceNm(f.lat, f.lon, f.home.lat, f.home.lon) > LOCAL_LEASH_NM) {
      const diff = ((bearingDeg(f.lat, f.lon, f.home.lat, f.home.lon) - f.track + 540) % 360) - 180;
      f.turn = Math.abs(diff) < 10 ? 0 : Math.sign(diff) * 3; // turn back towards home
    } else if (Math.random() < dt * 0.02) {
      f.turn = Math.random() < 0.5 ? 0 : rnd(-3, 3); // deg/s
    }
    if (Math.random() < dt * 0.005) f.targetAlt = Math.round(rnd(f.low, f.high) / 100) * 100;
    f.track = (f.track + f.turn * dt + 360) % 360;
    const climb = f.targetAlt - f.alt;
    f.vrate = Math.abs(climb) < 50 ? 0 : Math.sign(climb) * Math.min(700, Math.abs(climb));
    f.alt += (f.vrate * dt) / 60;
    [f.lat, f.lon] = destinationPoint(f.lat, f.lon, f.track, (f.gs * dt) / 3600);
  }

  /** Moves everything on to `now`; landed flights leave and new ones take off in their place. */
  _advance(now) {
    const dt = Math.min(120, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    let departures = 0;
    for (const [hex, f] of this.flights) {
      if (f.kind === 'local') {
        this._wander(f, dt);
        continue;
      }
      if (f.landed) {
        if (now - f.landed > ROLLOUT_S * 1000) {
          this.flights.delete(hex);
          departures++;
          continue;
        }
        f.gs = Math.max(15, 140 * Math.exp(-(now - f.landed) / 12000)); // braking, then taxiing
      }
      f.d += (f.gs * dt) / 3600;
      if (!f.landed && f.d >= f.dist) {
        Object.assign(f, { landed: now, alt: 0, vrate: 0, gs: 140 });
      }
      this._place(f);
    }
    for (let i = 0; i < departures; i++) this._add(this._airliner(false));
  }

  _out(f) {
    return {
      hex: f.hex,
      callsign: f.callsign,
      reg: f.reg,
      type: f.type.type,
      desc: f.type.desc,
      operator: f.airline?.name ?? '',
      lat: f.lat,
      lon: f.lon,
      posAge: 0,
      alt: Math.round(f.alt / 25) * 25,
      onGround: Boolean(f.landed),
      gs: Math.round(f.gs),
      track: Math.round(f.track * 10) / 10,
      vrate: Math.round(f.vrate / 64) * 64,
      squawk: f.squawk,
      emergency: '',
      category: f.type.category,
      military: false,
      source: 'Simulated',
      country: '',
    };
  }

  async area(lat, lon, r) {
    this._advance(Date.now());
    const radius = Math.min(r, MAX_RADIUS);
    const aircraft = [];
    for (const f of this.flights.values()) {
      if (Math.abs(f.lat - lat) * 60 > radius) continue; // quick reject before the exact distance
      if (distanceNm(lat, lon, f.lat, f.lon) <= radius) aircraft.push(this._out(f));
    }
    return { aircraft, age: 0, radius, capped: radius < r, ...SOURCE };
  }

  async find(kind, value) {
    this._advance(Date.now());
    const v = value.toUpperCase();
    const aircraft = [...this.flights.values()]
      .filter((f) => (kind === 'hex' ? f.hex === value.toLowerCase() : kind === 'reg' ? f.reg === v : f.callsign === v))
      .map((f) => this._out(f));
    return { aircraft, age: 0, ...SOURCE };
  }

  /** The route of a flight, in the same form as a live route lookup (see shared/enrich.js). */
  async route(callsign) {
    let f = null;
    for (const x of this.flights.values()) if (x.callsign === callsign) f = x;
    if (!f) return null;
    const { airline } = f;
    const airport = ({ size, ...a }) => a;
    return {
      callsign,
      flightIata: airline.iata + callsign.slice(3),
      airline: { name: airline.name, icao: airline.icao, iata: airline.iata, country: countryName(airline.country) },
      origin: airport(f.from),
      destination: airport(f.to),
    };
  }

  /** Where a flight has been since take-off: [{ lat, lon, alt, t }], oldest first. */
  async trail(hex) {
    const f = this.flights.get(hex);
    if (!f || f.kind !== 'airliner') return null;
    const end = Math.min(f.d, f.dist);
    const steps = Math.min(200, Math.max(2, Math.ceil(end / 3)));
    const step = end / steps;
    const points = [];
    let t = this.last;
    for (let i = steps; i >= 0; i--) {
      const alt = altitudeAt(f, i * step);
      const [lat, lon] = destinationPoint(f.from.lat, f.from.lon, f.bearing, i * step);
      points.push({ lat, lon, alt: Math.round(alt / 25) * 25, t: Math.round(t) });
      t -= (step / groundSpeedAt(f, alt)) * 3_600_000;
    }
    return points.reverse();
  }

  async details() {
    return { info: null, photo: null };
  }
}
