// Simulated traffic for demo mode (offline use, or when every live source is down).
// Everything here is made up; the UI labels it clearly as a simulation.

import { distanceNm, destinationPoint } from './shared/geo.js';

const AIRLINES = [
  ['BAW', 'G-', 0x400000], ['EZY', 'G-', 0x400000], ['DLH', 'D-', 0x3c0000], ['AFR', 'F-', 0x380000],
  ['KLM', 'PH-', 0x480000], ['RYR', 'EI-', 0x4ca000], ['SAS', 'SE-', 0x4a8000], ['IBE', 'EC-', 0x340000],
  ['UAE', 'A6-', 0x896000], ['QTR', 'A7-', 0x06a000], ['THY', 'TC-', 0x4b8000], ['AAL', 'N', 0xa00000],
  ['UAL', 'N', 0xa00000], ['DAL', 'N', 0xa00000], ['SWR', 'HB-', 0x4b0000], ['FIN', 'OH-', 0x460000],
];

const TYPES = [
  // [ICAO type, description, category, cruise kt, cruise ft, weight]
  ['A320', 'AIRBUS A-320', 'A3', 450, 36000, 10],
  ['A20N', 'AIRBUS A-320neo', 'A3', 450, 37000, 8],
  ['A321', 'AIRBUS A-321', 'A3', 455, 36000, 6],
  ['B738', 'BOEING 737-800', 'A3', 450, 37000, 10],
  ['B38M', 'BOEING 737 MAX 8', 'A3', 450, 38000, 5],
  ['E190', 'EMBRAER ERJ-190', 'A3', 430, 35000, 3],
  ['AT76', 'ATR 72-600', 'A2', 270, 22000, 2],
  ['B77W', 'BOEING 777-300ER', 'A5', 490, 38000, 3],
  ['B789', 'BOEING 787-9', 'A5', 490, 40000, 3],
  ['A359', 'AIRBUS A-350-900', 'A5', 490, 39000, 3],
  ['A388', 'AIRBUS A-380-800', 'A5', 490, 38000, 1],
  ['C172', 'CESSNA 172', 'A1', 110, 4500, 2],
  ['H145', 'AIRBUS HELICOPTERS H145', 'A7', 130, 2000, 1],
];
const TYPE_WEIGHT = TYPES.reduce((s, t) => s + t[5], 0);

const rnd = (a, b) => a + Math.random() * (b - a);
const pickType = () => {
  let x = Math.random() * TYPE_WEIGHT;
  for (const t of TYPES) if ((x -= t[5]) < 0) return t;
  return TYPES[0];
};
const letters = (n) => Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');

export class SimSource {
  mode = 'demo';
  planes = new Map();
  last = Date.now();

  pollMs() {
    return 3000;
  }

  _spawn(lat, lon, radius) {
    const [type, desc, category, cruiseKt, cruiseFt] = pickType();
    const airline = AIRLINES[Math.floor(Math.random() * AIRLINES.length)];
    const ga = category === 'A1' || category === 'A7';
    const phase = Math.random();
    const alt = ga ? rnd(800, cruiseFt) : phase < 0.65 ? cruiseFt - Math.floor(rnd(0, 6)) * 1000 : rnd(3000, cruiseFt);
    const [pLat, pLon] = destinationPoint(lat, lon, rnd(0, 360), Math.sqrt(Math.random()) * radius);
    const hex = (airline[2] + Math.floor(Math.random() * 0x3fff)).toString(16).padStart(6, '0');
    const p = {
      hex,
      callsign: ga ? '' : `${airline[0]}${Math.floor(rnd(10, 9999))}`,
      reg: airline[1] + (airline[1] === 'N' ? `${Math.floor(rnd(100, 999))}${letters(2)}` : letters(airline[1].length === 2 ? 4 : 3)),
      type,
      desc,
      operator: '',
      lat: pLat,
      lon: pLon,
      alt: Math.round(alt / 100) * 100,
      targetAlt: phase < 0.65 || ga ? alt : Math.random() < 0.5 ? cruiseFt : 3000,
      gs: cruiseKt * (alt / cruiseFt > 0.6 ? 1 : 0.7) + rnd(-15, 15),
      track: rnd(0, 360),
      turn: 0,
      vrate: 0,
      squawk: String(Math.floor(rnd(1000, 7477))).replace(/[89]/g, '0'),
      category,
    };
    this.planes.set(hex, p);
  }

  _advance(now) {
    const dt = Math.min(30, (now - this.last) / 1000);
    this.last = now;
    for (const p of this.planes.values()) {
      if (Math.random() < dt * 0.02) p.turn = Math.random() < 0.5 ? 0 : rnd(-1.5, 1.5); // deg/s
      p.track = (p.track + p.turn * dt + 360) % 360;
      const diff = p.targetAlt - p.alt;
      p.vrate = Math.abs(diff) < 50 ? 0 : Math.sign(diff) * Math.min(2000, Math.abs(diff) * 2);
      p.alt = Math.round(p.alt + (p.vrate * dt) / 60);
      [p.lat, p.lon] = destinationPoint(p.lat, p.lon, p.track, (p.gs * dt) / 3600);
    }
  }

  _out(p) {
    return {
      hex: p.hex, callsign: p.callsign, reg: p.reg, type: p.type, desc: p.desc, operator: p.operator,
      lat: p.lat, lon: p.lon, posAge: 0, alt: p.alt, onGround: false, gs: Math.round(p.gs),
      track: Math.round(p.track * 10) / 10, vrate: Math.round(p.vrate / 64) * 64, squawk: p.squawk,
      emergency: '', category: p.category, military: false, source: 'Simulated', country: '',
    };
  }

  async area(lat, lon, r) {
    const now = Date.now();
    this._advance(now);
    const radius = Math.min(r, 250);
    for (const [hex, p] of this.planes) {
      if (distanceNm(lat, lon, p.lat, p.lon) > radius * 1.3) this.planes.delete(hex);
    }
    const inside = [...this.planes.values()].filter((p) => distanceNm(lat, lon, p.lat, p.lon) <= radius);
    const target = Math.round(Math.min(450, Math.max(25, (Math.PI * radius * radius) / 300)));
    for (let i = inside.length; i < target; i++) this._spawn(lat, lon, radius);
    const aircraft = [...this.planes.values()]
      .filter((p) => distanceNm(lat, lon, p.lat, p.lon) <= radius)
      .map((p) => this._out(p));
    return { aircraft, age: 0, radius, capped: radius < r, source: 'demo', sourceName: 'Demo (simulated)' };
  }

  async find(kind, value) {
    const v = value.toUpperCase();
    const aircraft = [...this.planes.values()]
      .filter((p) => (kind === 'hex' ? p.hex === value.toLowerCase() : kind === 'reg' ? p.reg === v : p.callsign === v))
      .map((p) => this._out(p));
    return { aircraft, age: 0, source: 'demo', sourceName: 'Demo (simulated)' };
  }

  async route() {
    return null;
  }

  async details() {
    return { info: null, photo: null };
  }
}
