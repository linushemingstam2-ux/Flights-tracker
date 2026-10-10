// Aircraft symbols. Each model in aircraft-models.js is turned into top-view geometry from its
// real dimensions, nudged towards classic map-icon proportions (a slightly fuller fuselage,
// wings and engines) so every type stays legible at a glance. It is painted once per colour and
// size into a sprite: a flat silhouette with a crisp outline, finished with just a little depth —
// a soft sheen along the fuselage, gentle tone steps between parts and fine seams where they meet.
// Helicopter rotors are animated by the map layer.

import { MODELS, modelIdFor } from './aircraft-models.js?v=9';

const rad = (d) => (d * Math.PI) / 180;
const BOX = 64; // sprite design space: 64×64 units, nose up

// ── Geometry in metres (nose at y = 0, x to the right) ───────────────────

function fairingOf(m) {
  if (m.fairing) return m.fairing;
  if (!m.wing || m.light || m.biz || m.kind) return null;
  return { y: m.wing.y - m.wing.cr * 0.12, len: m.wing.cr * 1.45, w: 1.05 };
}

/** Half-width of the fuselage at station y. */
function halfWidth(m, y) {
  const hw = m.W / 2;
  const end = m.tailEnd ?? 0.16;
  if (y <= 0) return 0;
  if (y >= m.L) return hw * end;
  const { len: nl, a = 2, b = 2 } = m.nose;
  let w = hw;
  if (y < nl) w = hw * Math.pow(1 - Math.pow(1 - y / nl, a), 1 / b);
  const ts = m.L - m.tailLen;
  if (y > ts) w = Math.min(w, hw * (1 - (1 - end) * Math.pow((y - ts) / m.tailLen, 1.8)));
  const f = fairingOf(m);
  if (f && y > f.y && y < f.y + f.len) w *= 1 + (f.w - 1) * Math.pow(Math.sin((Math.PI * (y - f.y)) / f.len), 0.7);
  return w;
}

const mirrorPoly = (right) => [...right, ...right.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
const flipX = (pts) => pts.map(([x, y]) => [-x, y]).reverse();
const bez = (p0, p1, p2, t) => [
  (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
  (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
];

function fuselagePoly(m) {
  const ys = new Set();
  for (let i = 1; i <= 20; i++) ys.add(m.nose.len * Math.pow(i / 20, 1.7));
  const f = fairingOf(m);
  if (f) for (let i = 0; i <= 14; i++) ys.add(f.y + (f.len * i) / 14);
  const ts = m.L - m.tailLen;
  for (let i = 0; i < 18; i++) ys.add(ts + (m.tailLen * i) / 18);
  const sorted = [...ys].filter((y) => y > 0 && y < m.L).sort((p, q) => p - q);
  return mirrorPoly([[0, 0], ...sorted.map((y) => [halfWidth(m, y), y]), [halfWidth(m, m.L), m.L], [0, m.L]]);
}

/** A lifting surface (wing or tailplane), right side. */
function surface(m, s, semi, rootX) {
  const x0 = rootX;
  const tan = Math.tan(rad(s.sweep));
  const tip = s.tip || 'none';
  const dw = s.tipW || 0;
  const sb = tip === 'none' ? semi : semi - dw;
  const le = (x) => s.y + (x - x0) * tan;
  const kink = s.kink || 0;
  const xk = x0 + kink * (sb - x0);
  const rootTE = s.y + s.cr;
  const kinkTE = rootTE + (xk - x0) * Math.tan(rad(s.teIn ?? 1));
  const tipLE = le(sb);
  const tipTE = tipLE + s.ct;
  const te = (x) =>
    x <= xk && xk > x0
      ? rootTE + ((x - x0) * (kinkTE - rootTE)) / (xk - x0)
      : kinkTE + ((x - xk) * (tipTE - kinkTE)) / Math.max(1e-6, sb - xk);
  const pts = [[x0, s.y]];
  let tipPoint;
  switch (tip) {
    case 'winglet':
    case 'sharklet':
      pts.push([sb, tipLE], [sb + dw, tipLE + s.ct * 0.62], [sb + dw, tipLE + s.ct * 1.02], [sb, tipTE]);
      tipPoint = [sb + dw * 0.6, tipLE + s.ct * 0.6];
      break;
    case 'fence':
      pts.push([sb, tipLE], [sb, tipLE - s.ct * 0.3], [sb + dw, tipLE - s.ct * 0.16], [sb + dw, tipTE + s.ct * 0.2], [sb, tipTE + s.ct * 0.12], [sb, tipTE]);
      tipPoint = [sb + dw * 0.5, tipLE + s.ct * 0.4];
      break;
    case 'raked': {
      const tipY = tipLE + dw * Math.tan(rad(Math.min(70, s.sweep + 18)));
      pts.push([sb, tipLE], [semi, tipY], [semi - dw * 0.1, tipY + s.ct * 0.2], [sb, tipTE]);
      tipPoint = [semi - dw * 0.12, tipY + s.ct * 0.05];
      break;
    }
    case 'blended': {
      const p0 = [sb, tipLE];
      const p1 = [semi, tipLE + dw * 0.3];
      const p2 = [semi, tipLE + dw * 0.75 + s.ct * 0.3];
      for (let i = 1; i <= 7; i++) pts.push(bez(p0, p1, p2, i / 7));
      pts.push([semi - dw * 0.08, p2[1] + s.ct * 0.15], [sb, tipTE]);
      tipPoint = [semi - dw * 0.05, p2[1] - s.ct * 0.1];
      break;
    }
    default: {
      const r = Math.min(s.ct * 0.28, 0.6);
      pts.push([sb - r, le(sb - r)], [sb - r * 0.25, tipLE + r * 0.35], [sb, tipLE + s.ct * 0.45], [sb - r * 0.2, tipTE - r * 0.3], [sb - r, tipTE]);
      tipPoint = [sb - r * 0.4, tipLE + s.ct * 0.3];
    }
  }
  if (xk > x0 + 0.01) pts.push([xk, kinkTE]);
  pts.push([x0, rootTE]);
  return { pts, le, te, x0, sb, xk, tipLE, tipTE, tipPoint };
}

const FAN = [[0, 0.78], [0.025, 0.93], [0.08, 1], [0.42, 0.99], [0.68, 0.88], [0.72, 0.72], [0.8, 0.62], [0.93, 0.42], [0.97, 0.3], [1, 0.12]];
const PROP_NACELLE = [[0, 0.06], [0.025, 0.36], [0.06, 0.56], [0.1, 0.66], [0.13, 0.74], [0.26, 0.97], [0.55, 1], [0.8, 0.84], [1, 0.3]];

function nacelle(cx, front, len, d, profile = FAN) {
  const r = d / 2;
  const right = profile.map(([t, w]) => [cx + r * w, front + len * t]);
  const left = profile.slice().reverse().map(([t, w]) => [cx - r * w, front + len * t]);
  return { pts: [...right, ...left], cx, front, len, r };
}
const mirrorNacelle = (n) => ({ ...n, cx: -n.cx, pts: n.pts.map(([x, y]) => [-x, y]) });

function buildAirframe(m) {
  const g = { kind: m.kind || 'fixed', m };
  g.fuselage = fuselagePoly(m);
  const wr = surface(m, m.wing, m.S / 2, halfWidth(m, m.wing.y + m.wing.cr * 0.4) * 0.9);
  g.wing = wr;
  g.wings = [wr.pts, flipX(wr.pts)];
  g.tTail = !!m.ht?.tTail;
  if (m.ht) {
    const hx0 = g.tTail ? (m.fin?.t ?? 0.3) * 0.5 : halfWidth(m, m.ht.y + m.ht.cr * 0.4) * 0.9;
    const hr = surface(m, m.ht, m.ht.span / 2, hx0);
    g.htInfo = hr;
    g.ht = [hr.pts, flipX(hr.pts)];
  }
  if (m.fin) {
    const { y, len, t } = m.fin;
    g.fin = mirrorPoly([[0, y], [t * 0.5, y + len * 0.32], [t * 0.42, y + len * 0.78], [t * 0.18, y + len], [0, y + len]]);
  }
  g.fans = [];
  for (const e of m.fans || []) {
    const nc = nacelle(e.x, wr.le(e.x) - e.len * e.lead, e.len, e.d);
    nc.chevrons = e.chevrons;
    g.fans.push(nc, mirrorNacelle(nc));
  }
  g.rear = [];
  g.pylons = [];
  for (const e of m.rear || []) {
    const nc = nacelle(e.x, e.y, e.len, e.d);
    g.rear.push(nc, mirrorNacelle(nc));
    const fx = halfWidth(m, e.y + e.len * 0.55) * 0.9;
    const pylon = [[fx, e.y + e.len * 0.3], [e.x - e.d * 0.3, e.y + e.len * 0.38], [e.x - e.d * 0.3, e.y + e.len * 0.72], [fx, e.y + e.len * 0.84]];
    g.pylons.push(pylon, flipX(pylon));
  }
  g.center = m.center ? nacelle(0, m.center.y, m.center.len, m.center.d) : null;
  g.otw = [];
  for (const e of m.otw || []) {
    const nc = nacelle(e.x, e.y, e.len, e.d);
    g.otw.push(nc, mirrorNacelle(nc));
  }
  g.props = [];
  for (const p of m.props || []) {
    const nc = nacelle(p.x, p.front, p.len, p.w, PROP_NACELLE);
    for (const k of [nc, mirrorNacelle(nc)]) g.props.push({ nacelle: k, x: k.cx, y: p.front + p.len * 0.1, d: p.d });
  }
  if (m.noseProp) g.props.push({ nacelle: null, x: 0, y: -0.06, d: m.noseProp.d, spinner: true });
  g.rotodome = m.rotodome ? { x: 0, y: m.rotodome.y, r: m.rotodome.d / 2 } : null;
  return g;
}

function buildFighter(m) {
  const { L, S, W } = m;
  const f = { L, W, nose: { len: L * 0.3, a: 1.35, b: 1.7 }, tailLen: L * 0.12, tailEnd: m.twin ? 0.8 : 0.62 };
  const g = { kind: 'fighter', m: { ...m, ...f } };
  g.fuselage = fuselagePoly(g.m);
  const semi = S / 2;
  const x0 = halfWidth(g.m, L * 0.6) * 0.9;
  let wing;
  if (m.delta) {
    const y = L * 0.4;
    const tipY = y + (semi - x0) * Math.tan(rad(m.sweep));
    wing = [[x0, y], [semi, tipY], [semi, tipY + L * 0.07], [semi - L * 0.02, tipY + L * 0.075], [x0, L * 0.9]];
  } else {
    const y = L * 0.46;
    const tipY = y + (semi - x0) * Math.tan(rad(m.sweep));
    wing = [[x0 * 0.7, L * 0.24], [x0, y], [semi, tipY], [semi, tipY + L * 0.1], [x0, y + L * 0.33]];
  }
  g.wings = [wing, flipX(wing)];
  g.wing = { tipPoint: [semi - 0.1, wing[2][1] + L * 0.02] };
  if (m.canard) {
    const c = [[x0 * 0.9, L * 0.2], [semi * 0.42, L * 0.27], [semi * 0.42, L * 0.3], [x0 * 0.9, L * 0.29]];
    g.ht = [c, flipX(c)];
  } else {
    const hy = L * 0.82;
    const h = [[x0 * 0.9, hy], [semi * 0.6, hy + L * 0.09], [semi * 0.6, hy + L * 0.15], [x0 * 0.9, hy + L * 0.15]];
    g.ht = [h, flipX(h)];
  }
  g.fins = [];
  const fy = L * 0.7;
  const finAt = (cx) => [[cx, fy], [cx + 0.14, fy + L * 0.15], [cx + 0.1, fy + L * 0.28], [cx - 0.1, fy + L * 0.28], [cx - 0.14, fy + L * 0.15]];
  if (m.twin) g.fins.push(finAt(W * 0.42), finAt(-W * 0.42));
  else g.fins.push(finAt(0));
  g.nozzles = m.twin ? [[W * 0.24, L], [-W * 0.24, L]] : [[0, L]];
  return g;
}

function buildHeli(m) {
  const { Lf, Wc, R } = m;
  const hw = Wc / 2;
  const right = [[0, 0]];
  const nose = Lf * 0.2;
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    right.push([hw * Math.pow(1 - Math.pow(1 - t, 2.2), 0.5), nose * t]);
  }
  right.push([hw, Lf * 0.36], [hw * 0.92, Lf * 0.45], [hw * 0.62, Lf * 0.54], [hw * 0.2, Lf * 0.6], [hw * 0.15, Lf * 0.9], [hw * 0.1, Lf * 0.97], [0, Lf * 0.98]);
  const g = { kind: 'heli', m };
  g.body = mirrorPoly(right);
  const sy = Lf * 0.8;
  const stab = [[hw * 0.15, sy], [hw * 1.35, sy + Lf * 0.012], [hw * 1.35, sy + Lf * 0.055], [hw * 0.15, sy + Lf * 0.06]];
  g.stab = [stab, flipX(stab)];
  g.tailFin = m.tail === 'fenestron'
    ? mirrorPoly([[0, Lf * 0.88], [hw * 0.24, Lf * 0.9], [hw * 0.26, Lf * 0.98], [0, Lf * 1.01]])
    : mirrorPoly([[0, Lf * 0.9], [hw * 0.09, Lf * 0.93], [hw * 0.06, Lf * 1.0], [0, Lf * 1.01]]);
  g.tailRotor = m.tail === 'rotor' && !m.tandem ? { x: hw * 0.32, y: Lf * 0.96, d: R * 0.36 } : null;
  g.skids = [];
  if (m.skids) {
    const sx = hw * 1.25;
    const rail = [[sx - 0.06, Lf * 0.13], [sx + 0.06, Lf * 0.12], [sx + 0.07, Lf * 0.56], [sx - 0.07, Lf * 0.56]];
    g.skids.push(rail, flipX(rail));
    for (const cy of [0.24, 0.47]) {
      const tube = [[hw * 0.6, Lf * cy - 0.05], [sx, Lf * cy - 0.05], [sx, Lf * cy + 0.05], [hw * 0.6, Lf * cy + 0.05]];
      g.skids.push(tube, flipX(tube));
    }
  }
  g.hubs = m.tandem ? [[0, Lf * 0.1], [0, Lf * 0.88]] : [[0, Lf * 0.35]];
  g.R = R;
  return g;
}

// ── Fit geometry into the 64-unit sprite box ─────────────────────────────

function eachPoint(g, fn) {
  const walk = (v) => {
    if (!v) return;
    if (Array.isArray(v) && typeof v[0] === 'number' && v.length === 2) fn(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v.pts) walk(v.pts);
  };
  for (const k of ['fuselage', 'wings', 'ht', 'fin', 'fins', 'body', 'stab', 'tailFin', 'skids']) walk(g[k]);
  for (const k of ['fans', 'rear', 'otw', 'pylons']) walk(g[k]);
  if (g.center) walk(g.center);
  for (const p of g.props || []) {
    if (p.nacelle) walk(p.nacelle);
    fn([p.x - p.d / 2, p.y]);
    fn([p.x + p.d / 2, p.y]);
  }
  for (const [x, y] of g.hubs || []) {
    fn([x - g.R, y - g.R]);
    fn([x + g.R, y + g.R]);
  }
}

// Classic map icons are drawn a touch fuller than life: at 20–40 px a true-to-scale airliner is
// a hairline. These factors keep each type recognisable while giving every symbol solid weight.
const FULLER = { body: 1.32, chord: 1.12, engine: 1.15 };

function iconic(m) {
  if (m.kind === 'heli') return { ...m, Wc: m.Wc * 1.2 };
  if (m.kind === 'fighter') return { ...m, W: m.W * 1.2 };
  if (!m.wing) return m;
  const W = m.W * FULLER.body;
  const grow = (W - m.W) / 2;
  const chord = (s, f) => s && { ...s, cr: s.cr * f, ct: s.ct * f };
  const engine = (e) => ({ ...e, d: e.d * FULLER.engine });
  return {
    ...m,
    W,
    wing: chord(m.wing, FULLER.chord),
    ht: chord(m.ht, 1.1),
    fin: m.fin && { ...m.fin, t: m.fin.t * FULLER.body },
    fans: m.fans?.map(engine),
    rear: m.rear?.map((e) => ({ ...engine(e), x: e.x + grow })),
    center: m.center && engine(m.center),
    otw: m.otw?.map(engine),
    props: m.props?.map((p) => ({ ...p, w: p.w * FULLER.engine })),
  };
}

const GEOMETRY = new Map();

/** Geometry for a model, transformed into sprite units (cached). */
function geometry(id) {
  let g = GEOMETRY.get(id);
  if (g) return g;
  const m = iconic(MODELS[id] || MODELS.a320);
  if (m.kind === 'balloon' || m.kind === 'ground') {
    g = { kind: m.kind, m, k: 1, size: m.kind === 'balloon' ? m.D : Math.max(m.L, m.W) };
    GEOMETRY.set(id, g);
    return g;
  }
  g = m.kind === 'heli' ? buildHeli(m) : m.kind === 'fighter' ? buildFighter(m) : buildAirframe(m);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  eachPoint(g, ([x, y]) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  const extent = Math.max(maxX - minX, maxY - minY);
  const k = 58 / extent;
  const cy = (minY + maxY) / 2;
  const T = ([x, y]) => [BOX / 2 + x * k, BOX / 2 + (y - cy) * k];
  const map = (v) => {
    if (!v) return v;
    if (Array.isArray(v) && typeof v[0] === 'number' && v.length === 2) return T(v);
    if (Array.isArray(v)) return v.map(map);
    return v;
  };
  const out = { kind: g.kind, m: g.m, k, size: extent, cy };
  for (const key of ['fuselage', 'wings', 'ht', 'fin', 'fins', 'body', 'stab', 'tailFin', 'skids', 'pylons', 'nozzles', 'hubs']) {
    if (g[key]) out[key] = map(g[key]);
  }
  const mapNac = (n) => n && { ...n, pts: map(n.pts), cx: T([n.cx, 0])[0], front: T([0, n.front])[1], len: n.len * k, r: n.r * k };
  out.fans = (g.fans || []).map(mapNac);
  out.rear = (g.rear || []).map(mapNac);
  out.otw = (g.otw || []).map(mapNac);
  out.center = mapNac(g.center);
  out.props = (g.props || []).map((p) => ({ ...p, nacelle: mapNac(p.nacelle), x: T([p.x, p.y])[0], y: T([p.x, p.y])[1], d: p.d * k }));
  out.tTail = g.tTail;
  // Vertical extent of the wing and tailplane, for their leading-to-trailing-edge light.
  if (g.wing?.le) out.wingSpanY = [T([0, g.wing.le(g.wing.x0)])[1], T([0, g.wing.tipTE])[1]];
  if (g.htInfo) out.htTop = T([0, g.htInfo.le(g.htInfo.x0)])[1];
  if (g.tailRotor) out.tailRotor = { x: T([g.tailRotor.x, g.tailRotor.y])[0], y: T([g.tailRotor.x, g.tailRotor.y])[1], d: g.tailRotor.d * k };
  if (g.rotodome) out.rotodome = { x: BOX / 2, y: T([0, g.rotodome.y])[1], r: g.rotodome.r * k };
  if (g.R) out.R = g.R * k;
  out.W = (g.m.W ?? g.m.Wc ?? 1) * k;
  GEOMETRY.set(id, out);
  return out;
}

// ── Public: choosing and sizing ──────────────────────────────────────────

/** Which model to draw for an aircraft. */
export function shapeFor(ac) {
  return modelIdFor(ac);
}

/** Relative size on the map: bigger aircraft are bigger, compressed so all stay readable. */
export function shapeScale(id) {
  const g = geometry(id); // .size: overall footprint in metres, rotors and propellers included
  const min = g.kind === 'heli' ? 0.86 : g.kind === 'balloon' || g.kind === 'ground' ? 0.6 : 0.64;
  return Math.min(1.45, Math.max(min, Math.sqrt(g.size / 36)));
}

// ── Colours ───────────────────────────────────────────────────────────────

export const CLASSIC_FILL = '#ffc72c';
export const SELECTED_FILL = '#ff4d3a';
export const EMERGENCY_FILL = '#ff2d55';
export const GROUND_FILL = '#a3afbd';

const ALT_HUES = [[0, 20], [2000, 32], [4000, 43], [6000, 54], [8000, 72], [10000, 100], [13000, 140], [20000, 190], [30000, 240], [40000, 300]];

function altitudeHue(alt) {
  if (alt <= ALT_HUES[0][0]) return ALT_HUES[0][1];
  for (let i = 1; i < ALT_HUES.length; i++) {
    const [a1, h1] = ALT_HUES[i];
    if (alt <= a1) {
      const [a0, h0] = ALT_HUES[i - 1];
      return h0 + ((alt - a0) / (a1 - a0)) * (h1 - h0);
    }
  }
  return ALT_HUES[ALT_HUES.length - 1][1];
}

/** Colour for an altitude, quantised to 500 ft so sprites can be cached. */
export function altitudeColor(alt, onGround) {
  if (onGround) return GROUND_FILL;
  if (alt == null) return '#b0b8c4';
  const q = Math.round(Math.max(0, alt) / 500) * 500;
  return `hsl(${Math.round(altitudeHue(q))} 85% 55%)`;
}

function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

function parseColor(c) {
  if (c[0] === '#') {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = c.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  return m ? hslToRgb(+m[1], +m[2] / 100, +m[3] / 100) : [200, 205, 212];
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c, a = 1) => (a === 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);

function rgbToHsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/** Lighter (t > 0) or deeper (t < 0) shade of a colour. Deeper shades keep their hue and
 * saturation, so a yellow deepens to gold rather than turning olive. */
function tone(c, t) {
  if (t >= 0) return mix(c, [255, 255, 255], t);
  const [h, s, l] = rgbToHsl(c);
  return hslToRgb(h, s, l * (1 + t));
}

/** The palette for one symbol: the body colour plus gentle tone steps for the other parts. */
function paintFor(fill) {
  const c = parseColor(fill);
  return { body: c, wing: tone(c, -0.075), tail: tone(c, -0.05), engine: tone(c, -0.2), fin: tone(c, -0.12) };
}

const OUTLINE = 'rgba(8, 11, 16, 0.86)';
const SEAM = 'rgba(0, 0, 0, 0.3)';

// ── Painting ──────────────────────────────────────────────────────────────

function path(pts) {
  const p = new Path2D();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  p.closePath();
  return p;
}

function union(list) {
  const p = new Path2D();
  for (const pts of list) if (pts) p.addPath(path(pts));
  return p;
}

const PATHS = new Map();

function pathsFor(id, g) {
  let P = PATHS.get(id);
  if (P) return P;
  P = {};
  if (g.fuselage) P.fuselage = path(g.fuselage);
  if (g.wings) P.wings = union(g.wings);
  if (g.ht) P.ht = union(g.ht);
  if (g.fin) P.fin = path(g.fin);
  if (g.fins) P.fins = union(g.fins);
  if (g.fans?.length) P.fans = union(g.fans.map((n) => n.pts));
  if (g.rear?.length) P.rear = union(g.rear.map((n) => n.pts));
  if (g.pylons?.length) P.pylons = union(g.pylons);
  if (g.otw?.length) P.otw = union(g.otw.map((n) => n.pts));
  if (g.center) P.center = path(g.center.pts);
  const propNacelles = (g.props || []).filter((p) => p.nacelle);
  if (propNacelles.length) P.propNacelles = union(propNacelles.map((p) => p.nacelle.pts));
  if (g.body) P.body = path(g.body);
  if (g.stab) P.stab = union(g.stab);
  if (g.tailFin) P.tailFin = path(g.tailFin);
  if (g.skids?.length) P.skids = union(g.skids);
  // Everything solid, for the outline and the drop shadow.
  const solid = new Path2D();
  for (const k of ['fans', 'wings', 'ht', 'pylons', 'rear', 'propNacelles', 'fuselage', 'otw', 'center', 'fin', 'fins', 'skids', 'stab', 'body', 'tailFin']) {
    if (P[k]) solid.addPath(P[k]);
  }
  P.solid = solid;
  PATHS.set(id, P);
  return P;
}

function fillWith(ctx, p, style) {
  ctx.fillStyle = style;
  ctx.fill(p);
}

function clipped(ctx, p, fn) {
  ctx.save();
  ctx.clip(p);
  fn();
  ctx.restore();
}

/** A soft, low sheen across a rounded part: a light ridge down the middle, slightly darker sides. */
function sheen(ctx, p, cx, halfW, strength = 1) {
  clipped(ctx, p, () => {
    const g = ctx.createLinearGradient(cx - halfW, 0, cx + halfW, 0);
    g.addColorStop(0, `rgba(0,0,0,${0.16 * strength})`);
    g.addColorStop(0.3, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, `rgba(255,255,255,${0.3 * strength})`);
    g.addColorStop(0.7, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${0.16 * strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, BOX, BOX);
  });
}

/** A fine seam: the outline of `upper` drawn only where it lies over `lower`. */
function seam(ctx, lower, upper, u, alpha = 1) {
  clipped(ctx, lower, () => {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = SEAM;
    ctx.lineWidth = u * 1.1;
    ctx.stroke(upper);
  });
}

/** A faint, tight contact shadow from `caster` onto `receiver` — the only real depth cue. */
function contact(ctx, receiver, caster, blur, alpha = 0.2) {
  ctx.save();
  ctx.clip(receiver);
  // Draw the caster far off to the side and offset only its shadow back into place, so the
  // receiver gets the soft shadow without the caster itself being painted.
  const scale = ctx.getTransform().a;
  ctx.shadowColor = `rgba(0,0,0,${alpha})`;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = 1000 * scale;
  ctx.translate(-1000, 0);
  ctx.fillStyle = '#000';
  ctx.fill(caster);
  ctx.restore();
}

/** Lifting surfaces: flat, with the leading edge catching a little more light than the trailing. */
function surface2d(ctx, p, color, yTop, yBottom) {
  fillWith(ctx, p, rgb(color));
  clipped(ctx, p, () => {
    const g = ctx.createLinearGradient(0, yTop, 0, yBottom);
    g.addColorStop(0, 'rgba(255,255,255,0.12)');
    g.addColorStop(0.55, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.08)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, BOX, BOX);
  });
}

function nacelles(ctx, list, P, color, u) {
  if (!P) return;
  fillWith(ctx, P, rgb(color));
  for (const n of list) sheen(ctx, path(n.pts), n.cx, n.r, 0.8);
  // A darker intake ring at the front, kept small so it reads as a detail, not a blot.
  clipped(ctx, P, () => {
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    for (const n of list) ctx.fillRect(n.cx - n.r, n.front - 1, n.r * 2, 1 + Math.max(u * 0.7, n.len * 0.06));
  });
}

function drawProps(ctx, props, u) {
  for (const p of props) {
    const t = Math.max(u * 0.9, p.d * 0.05);
    const g = ctx.createLinearGradient(p.x - p.d / 2, 0, p.x + p.d / 2, 0);
    g.addColorStop(0, 'rgba(14,18,24,0)');
    g.addColorStop(0.12, 'rgba(14,18,24,0.34)');
    g.addColorStop(0.5, 'rgba(14,18,24,0.2)');
    g.addColorStop(0.88, 'rgba(14,18,24,0.34)');
    g.addColorStop(1, 'rgba(14,18,24,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.d / 2, t / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function outline(ctx, p, u) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = u * 1.7;
  ctx.stroke(p);
}

function paintAirframe(ctx, id, g, P, paint, u, blur) {
  const C = paint;
  const [yTop, yBottom] = g.wingSpanY ?? [0, BOX];
  outline(ctx, P.solid, u);

  // Under-wing engines first: the wing covers their rear half, as seen from above.
  nacelles(ctx, g.fans, P.fans, C.engine, u);
  surface2d(ctx, P.wings, C.wing, yTop, yBottom);
  if (P.fans) seam(ctx, P.fans, P.wings, u);
  const lowTail = P.ht && !g.tTail;
  if (lowTail) surface2d(ctx, P.ht, C.tail, g.htTop ?? yTop, BOX);

  // Propeller nacelles sit on top of the wing.
  if (P.propNacelles) {
    contact(ctx, P.wings, P.propNacelles, blur * 0.6, 0.18);
    nacelles(ctx, g.props.filter((p) => p.nacelle).map((p) => p.nacelle), P.propNacelles, C.engine, u);
    seam(ctx, P.wings, P.propNacelles, u, 0.8);
  }

  // Fuselage, with a faint contact shadow and a crisp seam where it meets the wings and tail.
  const under = new Path2D();
  under.addPath(P.wings);
  if (lowTail) under.addPath(P.ht);
  contact(ctx, under, P.fuselage, blur * 0.7, 0.2);
  seam(ctx, under, P.fuselage, u);
  fillWith(ctx, P.fuselage, rgb(C.body));
  sheen(ctx, P.fuselage, BOX / 2, g.W / 2, 1);

  // Engines on the fuselage and over the wing.
  if (P.pylons) fillWith(ctx, P.pylons, rgb(C.wing));
  for (const [list, Pn] of [[g.rear, P.rear], [g.center ? [g.center] : [], P.center], [g.otw, P.otw]]) {
    if (!Pn) continue;
    contact(ctx, g.otw === list ? P.wings : P.fuselage, Pn, blur * 0.5, 0.18);
    nacelles(ctx, list, Pn, C.engine, u);
    seam(ctx, g.otw === list ? P.wings : P.fuselage, Pn, u, 0.8);
  }

  // Fin(s), then a T-tail on top.
  for (const f of [P.fin, P.fins]) {
    if (!f) continue;
    fillWith(ctx, f, rgb(C.fin));
    sheen(ctx, f, BOX / 2, Math.max(u, g.W * 0.1), 0.8);
  }
  if (P.ht && g.tTail) {
    contact(ctx, P.fuselage, P.ht, blur * 0.6, 0.16);
    surface2d(ctx, P.ht, C.tail, g.htTop ?? yTop, BOX);
    seam(ctx, P.fuselage, P.ht, u, 0.8);
  }
  if (g.nozzles) {
    for (const [x, y] of g.nozzles) {
      ctx.beginPath();
      ctx.ellipse(x, y - u * 0.4, g.W * 0.15, u * 0.8, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
    }
  }

  // AWACS radar dome on its pylon.
  if (g.rotodome) {
    const { x, y, r } = g.rotodome;
    const dome = new Path2D();
    dome.arc(x, y, r, 0, Math.PI * 2);
    outline(ctx, dome, u);
    fillWith(ctx, dome, rgb(tone(C.body, -0.04)));
    sheen(ctx, dome, x, r, 0.7);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x - r, y - r * 0.1, r * 2, r * 0.2);
  }

  drawProps(ctx, g.props, u);
}

function paintHeli(ctx, g, P, paint, u, blur) {
  const C = paint;
  outline(ctx, P.solid, u);
  if (P.skids) fillWith(ctx, P.skids, rgb(C.engine));
  if (P.stab) surface2d(ctx, P.stab, C.tail, 0, BOX);
  const under = new Path2D();
  if (P.skids) under.addPath(P.skids);
  if (P.stab) under.addPath(P.stab);
  contact(ctx, under, P.body, blur * 0.6, 0.2);
  seam(ctx, under, P.body, u);
  fillWith(ctx, P.body, rgb(C.body));
  sheen(ctx, P.body, BOX / 2, g.W / 2, 1);
  fillWith(ctx, P.tailFin, rgb(C.fin));
  if (g.tailRotor) {
    const { x, y, d } = g.tailRotor;
    ctx.fillStyle = 'rgba(14,18,24,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(u * 0.6, d * 0.06), d / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const [x, y] of g.hubs) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(u * 1.1, g.W * 0.13), 0, Math.PI * 2);
    ctx.fillStyle = rgb(tone(C.engine, -0.25));
    ctx.fill();
  }
}

function paintBalloon(ctx, paint, u) {
  const r = 22;
  const cx = BOX / 2;
  const cy = BOX / 2 - 3;
  const env = new Path2D();
  env.arc(cx, cy, r, 0, Math.PI * 2);
  outline(ctx, env, u);
  fillWith(ctx, env, rgb(paint.body));
  clipped(ctx, env, () => {
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.28)');
    g.addColorStop(0.6, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.14)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, BOX, BOX);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = u * 0.8;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
  });
  const basket = new Path2D();
  basket.rect(cx - 3, cy + r + 2, 6, 5);
  outline(ctx, basket, u * 0.7);
  fillWith(ctx, basket, 'rgb(134,96,60)');
}

function paintGround(ctx, paint, u) {
  const w = 22;
  const h = 46;
  const x = BOX / 2 - w / 2;
  const y = BOX / 2 - h / 2;
  const p = new Path2D();
  p.roundRect ? p.roundRect(x, y, w, h, 6) : p.rect(x, y, w, h);
  outline(ctx, p, u);
  fillWith(ctx, p, rgb(paint.body));
  sheen(ctx, p, BOX / 2, w / 2, 0.8);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x + 3, y + 7, w - 6, 7);
  ctx.fillStyle = 'rgba(255,176,0,0.9)';
  ctx.fillRect(x + 6, y + 19, w - 12, 3);
}

// ── Sprites ───────────────────────────────────────────────────────────────

const spriteCache = new Map();

function cached(key, make) {
  let c = spriteCache.get(key);
  if (!c) {
    c = make();
    if (spriteCache.size > 2500) spriteCache.clear();
    spriteCache.set(key, c);
  }
  return c;
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/** The aircraft in colour `fill`, drawn `px` CSS pixels wide (at device pixel ratio `dpr`). */
export function sprite(id, fill, px, dpr) {
  return cached(`${id}|${fill}|${px}|${dpr}`, () => {
    const g = geometry(id);
    const size = Math.ceil(px * dpr);
    const c = canvas(size);
    const ctx = c.getContext('2d');
    ctx.scale(size / BOX, size / BOX);
    const u = BOX / px; // one CSS pixel in sprite units
    const blur = Math.max(1.2, size * 0.035);
    const paint = paintFor(fill);
    if (g.kind === 'balloon') paintBalloon(ctx, paint, u);
    else if (g.kind === 'ground') paintGround(ctx, paint, u);
    else if (g.kind === 'heli') paintHeli(ctx, g, pathsFor(id, g), paint, u, blur);
    else paintAirframe(ctx, id, g, pathsFor(id, g), paint, u, blur);
    return c;
  });
}

/** Padding (CSS px) around a shadow sprite for its blur. */
export const SHADOW_PAD = 6;

/** A soft silhouette of the aircraft, drawn offset below it as a drop shadow. */
export function shadowSprite(id, px, dpr) {
  return cached(`shadow|${id}|${px}|${dpr}`, () => {
    const g = geometry(id);
    const full = px + SHADOW_PAD * 2;
    const c = canvas(Math.ceil(full * dpr));
    const ctx = c.getContext('2d');
    // Only the blurred shadow is wanted, so the shape itself is drawn far off-canvas.
    ctx.shadowColor = 'rgba(0,0,0,0.42)';
    ctx.shadowBlur = 2.4 * dpr;
    ctx.shadowOffsetX = 1000 * dpr;
    ctx.translate(SHADOW_PAD * dpr - 1000 * dpr, SHADOW_PAD * dpr);
    ctx.scale((px * dpr) / BOX, (px * dpr) / BOX);
    ctx.fillStyle = '#000';
    if (g.kind === 'balloon') {
      ctx.beginPath();
      ctx.arc(BOX / 2, BOX / 2 - 3, 22, 0, Math.PI * 2);
      ctx.fill();
    } else if (g.kind === 'ground') {
      ctx.fillRect(BOX / 2 - 11, BOX / 2 - 23, 22, 46);
    } else {
      ctx.fill(pathsFor(id, g).solid);
    }
    return c;
  });
}

/**
 * Main rotor(s) of a helicopter for the layer to spin: the sprite is centred on a hub; `hubs`
 * are offsets from the aircraft sprite centre, in fractions of its size.
 */
export function rotorFor(id) {
  const g = geometry(id);
  if (g.kind !== 'heli') return null;
  return { hubs: g.hubs.map(([x, y]) => [(x - BOX / 2) / BOX, (y - BOX / 2) / BOX]), radius: g.R / BOX, blades: g.m.blades };
}

export function rotorSprite(id, px, dpr) {
  return cached(`rotor|${id}|${px}|${dpr}`, () => {
    const g = geometry(id);
    const rPx = (g.R / BOX) * px;
    const size = Math.ceil(rPx * 2 * dpr) + 2;
    const c = canvas(size);
    const ctx = c.getContext('2d');
    const r = size / 2 - 1;
    ctx.translate(size / 2, size / 2);
    // The disc swept by the blades: a faint tint with a fine light rim and a dark edge, so it
    // reads on dark and light maps alike.
    const disc = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
    disc.addColorStop(0, 'rgba(255,255,255,0.03)');
    disc.addColorStop(0.86, 'rgba(255,255,255,0.07)');
    disc.addColorStop(0.96, 'rgba(255,255,255,0.18)');
    disc.addColorStop(0.985, 'rgba(10,14,20,0.24)');
    disc.addColorStop(1, 'rgba(10,14,20,0)');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    // Blades with a motion-blur trail behind each.
    const n = g.m.blades;
    if (ctx.createConicGradient) {
      const trail = ctx.createConicGradient(0, 0, 0);
      for (let i = 0; i < n; i++) {
        const a = i / n;
        trail.addColorStop(a, 'rgba(228,232,238,0.3)');
        trail.addColorStop(a + 0.28 / n, 'rgba(228,232,238,0)');
        trail.addColorStop(a + 0.999 / n, 'rgba(228,232,238,0)');
      }
      ctx.fillStyle = trail;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.97, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineCap = 'round';
    const bw = Math.max(1.1 * dpr, r * 0.06);
    ctx.strokeStyle = 'rgba(16,20,26,0.8)';
    ctx.lineWidth = bw;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const [cx, cy] = [Math.cos(a), Math.sin(a)];
      ctx.beginPath();
      ctx.moveTo(cx * r * 0.08, cy * r * 0.08);
      ctx.lineTo(cx * r * 0.95, cy * r * 0.95);
      ctx.stroke();
    }
    return c;
  });
}

/** Inline SVG silhouette (flight card, search results). */
export function svgIcon(id, fill = CLASSIC_FILL) {
  const g = geometry(id);
  const d = (pts) => `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`;
  const parts = [];
  const add = (list) => list && list.forEach((pts) => pts && parts.push(d(pts)));
  if (g.kind === 'balloon') return `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="29" r="22" fill="${fill}"/></svg>`;
  if (g.kind === 'ground') return `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="21" y="9" width="22" height="46" rx="5" fill="${fill}"/></svg>`;
  add((g.fans || []).map((n) => n.pts));
  add(g.wings);
  add(g.ht);
  add((g.props || []).filter((p) => p.nacelle).map((p) => p.nacelle.pts));
  add([g.fuselage, g.body, g.fin, g.tailFin]);
  add(g.fins);
  add(g.stab);
  add(g.skids);
  add(g.pylons);
  add((g.rear || []).map((n) => n.pts));
  add((g.otw || []).map((n) => n.pts));
  if (g.center) add([g.center.pts]);
  const style = `fill="${fill}" stroke="rgba(10,14,20,.85)" stroke-width="1.2" stroke-linejoin="round"`;
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${parts.map((p) => `<path d="${p}" ${style}/>`).join('')}</svg>`;
}
