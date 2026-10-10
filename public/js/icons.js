// Aircraft symbols. Each model in aircraft-models.js is turned into true-to-scale top-view
// geometry, then painted once per colour and size into a sprite: an outline for legibility,
// shaded cylindrical fuselage, lit wings with control-surface lines, engines with intakes and
// exhausts, cockpit glass, ambient occlusion where parts meet, and steady navigation lights.
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
  // Flap-track fairings peek out behind the trailing edge on airliners.
  g.tracks = [];
  const n = m.wing.tracks || 0;
  for (let i = 0; i < n; i++) {
    const f = 0.22 + (0.5 * i) / Math.max(1, n - 1);
    const x = wr.x0 + f * (wr.sb - wr.x0);
    const y = wr.te(x);
    const w = m.S * 0.0085;
    const l = m.S * 0.022;
    const canoe = [[x - w / 2, y - l * 0.6], [x + w / 2, y - l * 0.6], [x + w * 0.3, y + l * 0.45], [x, y + l * 0.7], [x - w * 0.3, y + l * 0.45]];
    g.tracks.push(canoe, flipX(canoe));
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
  // Cockpit glass: a wrap-around visor on the nose (or canopy on small aircraft).
  const nl = m.nose.len;
  const yf = m.light || m.kind === 'glider' ? nl * 1.15 : nl * 0.42;
  const yr = m.light || m.kind === 'glider' ? nl * 1.15 + m.L * 0.12 : nl * 0.66;
  g.cockpit = { yf, yr, w: halfWidth(m, yr) * (m.light ? 0.86 : 0.8), canopy: m.light || m.kind === 'glider' };
  if (m.deck) {
    const dw = m.W * 0.37;
    const pts = [[0, nl * 0.5]];
    for (let i = 1; i <= 8; i++) {
      const y = nl * 0.5 + (nl * 0.9 * i) / 8;
      pts.push([dw * Math.sqrt(i / 8), y]);
    }
    pts.push([dw, m.deck - 3], [dw * 0.55, m.deck], [0, m.deck + 0.4]);
    g.deck = mirrorPoly(pts);
  }
  g.rotodome = m.rotodome ? { x: 0, y: m.rotodome.y, r: m.rotodome.d / 2 } : null;
  g.lights = {
    right: wr.tipPoint,
    left: [-wr.tipPoint[0], wr.tipPoint[1]],
    tail: [0, m.L - 0.1],
    beacon: [0, m.wing.y + m.wing.cr * 0.45],
  };
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
  g.cockpit = { yf: L * 0.13, yr: L * 0.29, w: halfWidth(g.m, L * 0.22) * 0.72, canopy: true };
  g.nozzles = m.twin ? [[W * 0.24, L], [-W * 0.24, L]] : [[0, L]];
  g.lights = { right: g.wing.tipPoint, left: [-g.wing.tipPoint[0], g.wing.tipPoint[1]], tail: [0, L], beacon: [0, L * 0.5] };
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
  g.glass = { yf: Lf * 0.015, yr: Lf * 0.17, w: hw * 0.86 };
  g.exhausts = [[hw * 0.4, Lf * 0.5], [-hw * 0.4, Lf * 0.5]];
  g.hubs = m.tandem ? [[0, Lf * 0.1], [0, Lf * 0.88]] : [[0, Lf * 0.35]];
  g.R = R;
  g.lights = { tail: [0, Lf], beacon: [0, Lf * 0.62] };
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
  for (const k of ['fuselage', 'wings', 'ht', 'fin', 'fins', 'tracks', 'body', 'stab', 'tailFin', 'skids', 'deck']) walk(g[k]);
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

const GEOMETRY = new Map();

/** Geometry for a model, transformed into sprite units (cached). */
function geometry(id) {
  let g = GEOMETRY.get(id);
  if (g) return g;
  const m = MODELS[id] || MODELS.a320;
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
  for (const key of ['fuselage', 'wings', 'ht', 'fin', 'fins', 'tracks', 'body', 'stab', 'tailFin', 'skids', 'deck', 'pylons', 'nozzles', 'exhausts', 'hubs']) {
    if (g[key]) out[key] = map(g[key]);
  }
  const mapNac = (n) => n && { ...n, pts: map(n.pts), cx: T([n.cx, 0])[0], front: T([0, n.front])[1], len: n.len * k, r: n.r * k };
  out.fans = (g.fans || []).map(mapNac);
  out.rear = (g.rear || []).map(mapNac);
  out.otw = (g.otw || []).map(mapNac);
  out.center = mapNac(g.center);
  out.props = (g.props || []).map((p) => ({ ...p, nacelle: mapNac(p.nacelle), x: T([p.x, p.y])[0], y: T([p.x, p.y])[1], d: p.d * k }));
  out.tTail = g.tTail;
  if (g.wing?.le) {
    const w = g.wing;
    out.wingLines = {
      le: [T([w.x0, w.le(w.x0)]), T([w.sb, w.tipLE])],
      hinge: Array.from({ length: 9 }, (_, i) => {
        const x = w.x0 + ((w.sb - w.x0) * i) / 8;
        const te = w.te(x);
        return T([x, te - (te - w.le(x)) * 0.23]);
      }),
      aileron: (() => {
        const x = w.x0 + (w.sb - w.x0) * 0.68;
        const te = w.te(x);
        return [T([x, te - (te - w.le(x)) * 0.23]), T([x, te])];
      })(),
      yTop: T([0, w.le(w.x0)])[1],
      yBottom: T([0, w.tipTE])[1],
    };
  }
  if (g.htInfo) out.htLines = { le: [T([g.htInfo.x0, g.htInfo.le(g.htInfo.x0)]), T([g.htInfo.sb, g.htInfo.tipLE])] };
  if (g.cockpit) {
    const c = g.cockpit;
    out.cockpit = { yf: T([0, c.yf])[1], yr: T([0, c.yr])[1], w: c.w * k, canopy: c.canopy };
  }
  if (g.glass) out.glass = { yf: T([0, g.glass.yf])[1], yr: T([0, g.glass.yr])[1], w: g.glass.w * k };
  if (g.tailRotor) out.tailRotor = { x: T([g.tailRotor.x, g.tailRotor.y])[0], y: T([g.tailRotor.x, g.tailRotor.y])[1], d: g.tailRotor.d * k };
  if (g.rotodome) out.rotodome = { x: BOX / 2, y: T([0, g.rotodome.y])[1], r: g.rotodome.r * k };
  if (g.R) out.R = g.R * k;
  out.W = (g.m.W ?? g.m.Wc ?? 1) * k;
  out.lights = {};
  for (const [name, p] of Object.entries(g.lights || {})) out.lights[name] = T(p);
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
export const REALISTIC = 'realistic';

const ALT_HUES = [[0, 20], [2000, 32], [4000, 43], [6000, 54], [8000, 72], [10000, 100], [13000, 140], [20000, 190], [30000, 240], [40000, 300]];

export function altitudeHue(alt) {
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

function paintFor(fill, military) {
  if (fill === REALISTIC) {
    const body = military ? [138, 148, 158] : [243, 245, 248];
    return {
      body,
      wing: military ? [126, 136, 146] : [210, 215, 222],
      tail: military ? [132, 142, 152] : [222, 226, 232],
      engine: military ? [104, 112, 121] : [188, 195, 204],
      fin: military ? [128, 138, 148] : [234, 237, 241],
    };
  }
  const c = parseColor(fill);
  return {
    body: c,
    wing: mix(c, [0, 0, 0], 0.08),
    tail: mix(c, [0, 0, 0], 0.05),
    engine: mix(c, [92, 100, 112], 0.48),
    fin: mix(c, [0, 0, 0], 0.13),
  };
}

const METAL = [64, 70, 80];
const OUTLINE = 'rgba(6, 9, 14, 0.9)';

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
  if (g.tracks?.length) P.tracks = union(g.tracks);
  if (g.fans?.length) P.fans = union(g.fans.map((n) => n.pts));
  if (g.rear?.length) P.rear = union(g.rear.map((n) => n.pts));
  if (g.pylons?.length) P.pylons = union(g.pylons);
  if (g.otw?.length) P.otw = union(g.otw.map((n) => n.pts));
  if (g.center) P.center = path(g.center.pts);
  const propNacelles = (g.props || []).filter((p) => p.nacelle);
  if (propNacelles.length) P.propNacelles = union(propNacelles.map((p) => p.nacelle.pts));
  if (g.deck) P.deck = path(g.deck);
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

/** Shading across a part's width: dark edges, a soft glossy ridge down the middle. */
function cylinder(ctx, cx, halfW, strength = 1) {
  const g = ctx.createLinearGradient(cx - halfW, 0, cx + halfW, 0);
  g.addColorStop(0, `rgba(0,0,0,${0.36 * strength})`);
  g.addColorStop(0.17, `rgba(0,0,0,${0.1 * strength})`);
  g.addColorStop(0.38, `rgba(255,255,255,${0.06 * strength})`);
  g.addColorStop(0.5, `rgba(255,255,255,${0.5 * strength})`);
  g.addColorStop(0.62, `rgba(255,255,255,${0.06 * strength})`);
  g.addColorStop(0.83, `rgba(0,0,0,${0.1 * strength})`);
  g.addColorStop(1, `rgba(0,0,0,${0.36 * strength})`);
  return g;
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

/** Soft shadow cast by `caster` onto `receiver` (ambient occlusion where parts meet). */
function occlude(ctx, receiver, caster, blur, alpha = 0.42) {
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

function drawNacelle(ctx, n, color, u, prop) {
  const p = path(n.pts);
  fillWith(ctx, p, rgb(color));
  clipped(ctx, p, () => {
    ctx.fillStyle = cylinder(ctx, n.cx, n.r, 1.1);
    ctx.fillRect(n.cx - n.r, n.front - 1, n.r * 2, n.len + 2);
    if (prop) {
      // Spinner: polished cone at the front.
      const g = ctx.createLinearGradient(n.cx - n.r, 0, n.cx + n.r, 0);
      g.addColorStop(0, 'rgb(70,76,86)');
      g.addColorStop(0.45, 'rgb(225,229,235)');
      g.addColorStop(1, 'rgb(70,76,86)');
      ctx.fillStyle = g;
      ctx.fillRect(n.cx - n.r, n.front - 1, n.r * 2, n.len * 0.12 + 1);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(n.cx - n.r, n.front + n.len * 0.12, n.r * 2, Math.max(0.25, u * 0.4));
      return;
    }
    // Intake lip and inlet shadow.
    ctx.fillStyle = 'rgba(10,14,20,0.55)';
    ctx.fillRect(n.cx - n.r, n.front - 1, n.r * 2, n.len * 0.045 + 1);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(n.cx - n.r, n.front + n.len * 0.045, n.r * 2, Math.max(0.2, u * 0.35));
    // Fan nozzle step and the hot section behind it.
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(n.cx - n.r, n.front + n.len * 0.7, n.r * 2, Math.max(0.2, u * 0.4));
    const core = ctx.createLinearGradient(n.cx - n.r * 0.7, 0, n.cx + n.r * 0.7, 0);
    core.addColorStop(0, rgb(METAL));
    core.addColorStop(0.5, 'rgb(150,156,166)');
    core.addColorStop(1, rgb(METAL));
    ctx.fillStyle = core;
    ctx.fillRect(n.cx - n.r, n.front + n.len * 0.73, n.r * 2, n.len * 0.35);
    if (n.chevrons) {
      ctx.beginPath();
      const y = n.front + n.len * 0.71;
      for (let i = 0; i <= 8; i++) {
        const x = n.cx - n.r * 0.88 + (n.r * 1.76 * i) / 8;
        ctx.lineTo(x, y + (i % 2 ? n.len * 0.025 : 0));
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = Math.max(0.2, u * 0.3);
      ctx.stroke();
    }
  });
}

function strokeLine(ctx, pts, style, width) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.stroke();
}

function lightDot(ctx, [x, y], color, u) {
  const r = Math.max(1.1, u * 1.6);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.55)'));
  g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** The cockpit visor or canopy, with a glint of reflected sky. */
function drawGlass(ctx, c, u) {
  const { yf, yr, w } = c;
  const p = new Path2D();
  if (c.canopy) {
    p.ellipse(BOX / 2, (yf + yr) / 2, w, (yr - yf) / 2, 0, 0, Math.PI * 2);
  } else {
    const h = yr - yf;
    p.moveTo(BOX / 2 - w, yr);
    p.quadraticCurveTo(BOX / 2, yf - h * 0.35, BOX / 2 + w, yr);
    p.lineTo(BOX / 2 + w * 0.9, yr + h * 0.22);
    p.quadraticCurveTo(BOX / 2, yr - h * 0.32, BOX / 2 - w * 0.9, yr + h * 0.22);
    p.closePath();
  }
  const g = ctx.createLinearGradient(0, yf, 0, yr);
  g.addColorStop(0, 'rgb(40,62,92)');
  g.addColorStop(1, 'rgb(10,16,28)');
  fillWith(ctx, p, g);
  clipped(ctx, p, () => {
    ctx.beginPath();
    ctx.ellipse(BOX / 2 - w * 0.25, yf + (yr - yf) * 0.32, w * 0.5, (yr - yf) * 0.18, -0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fill();
  });
}

function drawProps(ctx, props, u) {
  for (const p of props) {
    const t = Math.max(0.7, p.d * 0.06);
    const g = ctx.createLinearGradient(p.x - p.d / 2, 0, p.x + p.d / 2, 0);
    g.addColorStop(0, 'rgba(18,22,28,0)');
    g.addColorStop(0.07, 'rgba(18,22,28,0.42)');
    g.addColorStop(0.5, 'rgba(18,22,28,0.26)');
    g.addColorStop(0.93, 'rgba(18,22,28,0.42)');
    g.addColorStop(1, 'rgba(18,22,28,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.d / 2, t / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    if (p.spinner) {
      const r = Math.max(0.6, p.d * 0.07);
      const s = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, 0, p.x, p.y, r);
      s.addColorStop(0, 'rgb(235,238,242)');
      s.addColorStop(1, 'rgb(80,86,96)');
      ctx.fillStyle = s;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + r * 0.4, r, r * 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function paintAirframe(ctx, id, g, P, paint, u, blur) {
  const C = paint;
  // 1. One clean outer outline around the whole aircraft.
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = u * 1.5;
  ctx.stroke(P.solid);

  // 2. Under the wing: flap-track fairings and turbofans (the wing shades their tops).
  if (P.tracks) {
    fillWith(ctx, P.tracks, rgb(mix(C.wing, [0, 0, 0], 0.1)));
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = u * 0.5;
    ctx.stroke(P.tracks);
  }
  for (const n of g.fans) drawNacelle(ctx, n, C.engine, u, false);
  if (P.fans) occlude(ctx, P.fans, P.wings, blur, 0.5);

  // 3. Wings and (conventional) tailplane.
  const surfaces = (p, color, lines) => {
    fillWith(ctx, p, rgb(color));
    clipped(ctx, p, () => {
      if (lines) {
        const lg = ctx.createLinearGradient(0, lines.yTop, 0, lines.yBottom);
        lg.addColorStop(0, 'rgba(255,255,255,0.18)');
        lg.addColorStop(0.5, 'rgba(255,255,255,0)');
        lg.addColorStop(1, 'rgba(0,0,0,0.2)');
        ctx.fillStyle = lg;
        ctx.fillRect(0, 0, BOX, BOX);
      }
    });
  };
  surfaces(P.wings, C.wing, g.wingLines);
  if (g.wingLines) {
    clipped(ctx, P.wings, () => {
      for (const s of [1, -1]) {
        const mirror = (pts) => pts.map(([x, y]) => [s > 0 ? x : BOX - x, y]);
        strokeLine(ctx, mirror(g.wingLines.le), 'rgba(255,255,255,0.5)', u * 0.7);
        strokeLine(ctx, mirror(g.wingLines.hinge), 'rgba(0,0,0,0.2)', u * 0.4);
        strokeLine(ctx, mirror(g.wingLines.aileron), 'rgba(0,0,0,0.22)', u * 0.4);
      }
    });
  }
  if (P.ht && !g.tTail && g.kind !== 'fighter') {
    surfaces(P.ht, C.tail, null);
    if (g.htLines) clipped(ctx, P.ht, () => {
      for (const s of [1, -1]) strokeLine(ctx, g.htLines.le.map(([x, y]) => [s > 0 ? x : BOX - x, y]), 'rgba(255,255,255,0.45)', u * 0.6);
    });
  }
  if (g.kind === 'fighter' && P.ht) surfaces(P.ht, C.tail, null);

  // 4. Propeller nacelles sit on top of the wing.
  if (P.propNacelles) occlude(ctx, P.wings, P.propNacelles, blur, 0.35);
  for (const p of g.props) if (p.nacelle) drawNacelle(ctx, p.nacelle, C.engine, u, true);

  // 5. Fuselage, shading the wing roots around it.
  occlude(ctx, P.wings, P.fuselage, blur, 0.45);
  if (P.ht && !g.tTail) occlude(ctx, P.ht, P.fuselage, blur * 0.8, 0.4);
  fillWith(ctx, P.fuselage, rgb(C.body));
  clipped(ctx, P.fuselage, () => {
    ctx.fillStyle = cylinder(ctx, BOX / 2, g.W / 2, 1);
    ctx.fillRect(0, 0, BOX, BOX);
    const lg = ctx.createLinearGradient(0, 2, 0, BOX - 2);
    lg.addColorStop(0, 'rgba(255,255,255,0.12)');
    lg.addColorStop(0.35, 'rgba(255,255,255,0)');
    lg.addColorStop(1, 'rgba(0,0,0,0.14)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, BOX, BOX);
  });
  if (P.deck) {
    fillWith(ctx, P.deck, 'rgba(255,255,255,0.14)');
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = u * 0.45;
    ctx.stroke(P.deck);
  }
  if (g.cockpit) drawGlass(ctx, g.cockpit, u);

  // 6. Engines on the fuselage and over the wing (each shading what it sits on).
  if (P.pylons) {
    occlude(ctx, P.fuselage, P.pylons, blur * 0.6, 0.3);
    fillWith(ctx, P.pylons, rgb(C.wing));
  }
  if (P.rear) occlude(ctx, P.fuselage, P.rear, blur * 0.7, 0.35);
  for (const n of g.rear) drawNacelle(ctx, n, C.engine, u, false);
  if (g.center) {
    occlude(ctx, P.fuselage, P.center, blur * 0.7, 0.35);
    drawNacelle(ctx, g.center, C.engine, u, false);
  }
  if (P.otw) occlude(ctx, P.wings, P.otw, blur, 0.4);
  for (const n of g.otw) drawNacelle(ctx, n, C.engine, u, false);

  // 7. Fin(s), then a T-tail on top of the fin.
  for (const f of [P.fin, P.fins]) {
    if (!f) continue;
    occlude(ctx, P.fuselage, f, blur * 0.5, 0.3);
    fillWith(ctx, f, rgb(C.fin));
    clipped(ctx, f, () => {
      ctx.fillStyle = cylinder(ctx, BOX / 2, Math.max(u, g.W * 0.12), 0.9);
      ctx.fillRect(0, 0, BOX, BOX);
    });
  }
  if (P.ht && g.tTail) {
    occlude(ctx, P.fuselage, P.ht, blur, 0.35);
    surfaces(P.ht, C.tail, null);
    if (g.htLines) clipped(ctx, P.ht, () => {
      for (const s of [1, -1]) strokeLine(ctx, g.htLines.le.map(([x, y]) => [s > 0 ? x : BOX - x, y]), 'rgba(255,255,255,0.45)', u * 0.6);
    });
  }
  if (g.nozzles) {
    for (const [x, y] of g.nozzles) {
      ctx.beginPath();
      ctx.ellipse(x, y - u * 0.4, g.W * 0.16, u * 0.9, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgb(METAL);
      ctx.fill();
    }
  }

  // 8. AWACS radar dome on its pylon.
  if (g.rotodome) {
    const { x, y, r } = g.rotodome;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = u * 1.5;
    ctx.stroke();
    const rg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    rg.addColorStop(0, 'rgb(236,239,243)');
    rg.addColorStop(1, 'rgb(150,158,168)');
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.fillStyle = 'rgba(20,24,30,0.75)';
    ctx.fillRect(x - r, y - r * 0.12, r * 2, r * 0.24);
  }

  // 9. Spinning propellers and navigation lights.
  drawProps(ctx, g.props, u);
  if (g.lights.left) lightDot(ctx, g.lights.left, 'rgba(255,48,48,1)', u);
  if (g.lights.right) lightDot(ctx, g.lights.right, 'rgba(48,220,110,1)', u);
}

function paintHeli(ctx, g, P, paint, u, blur) {
  const C = paint;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = u * 1.5;
  ctx.stroke(P.solid);
  if (P.skids) fillWith(ctx, P.skids, 'rgb(70,76,86)');
  if (P.stab) {
    fillWith(ctx, P.stab, rgb(C.tail));
    occlude(ctx, P.stab, P.body, blur * 0.6, 0.35);
  }
  if (P.skids) occlude(ctx, P.skids, P.body, blur * 0.8, 0.45);
  fillWith(ctx, P.body, rgb(C.body));
  clipped(ctx, P.body, () => {
    ctx.fillStyle = cylinder(ctx, BOX / 2, g.W / 2, 1);
    ctx.fillRect(0, 0, BOX, BOX);
  });
  fillWith(ctx, P.tailFin, rgb(C.fin));
  clipped(ctx, P.tailFin, () => {
    ctx.fillStyle = cylinder(ctx, BOX / 2, g.W * 0.14, 1);
    ctx.fillRect(0, 0, BOX, BOX);
  });
  drawGlass(ctx, { ...g.glass, canopy: false }, u);
  for (const [x, y] of g.exhausts) {
    ctx.beginPath();
    ctx.ellipse(x, y, g.W * 0.08, g.W * 0.13, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(30,34,40,0.8)';
    ctx.fill();
  }
  if (g.tailRotor) {
    const { x, y, d } = g.tailRotor;
    const tg = ctx.createLinearGradient(0, y - d / 2, 0, y + d / 2);
    tg.addColorStop(0, 'rgba(18,22,28,0)');
    tg.addColorStop(0.15, 'rgba(18,22,28,0.45)');
    tg.addColorStop(0.85, 'rgba(18,22,28,0.45)');
    tg.addColorStop(1, 'rgba(18,22,28,0)');
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.5, u * 0.7), d / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const [x, y] of g.hubs) {
    const r = Math.max(0.9, g.W * 0.14);
    const hg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    hg.addColorStop(0, 'rgb(200,205,212)');
    hg.addColorStop(1, 'rgb(40,45,52)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintBalloon(ctx, paint, u) {
  const r = 22;
  const cx = BOX / 2;
  const cy = BOX / 2 - 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = u * 1.5;
  ctx.stroke();
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
  g.addColorStop(0, rgb(mix(paint.body, [255, 255, 255], 0.55)));
  g.addColorStop(0.55, rgb(paint.body));
  g.addColorStop(1, rgb(mix(paint.body, [0, 0, 0], 0.35)));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = u * 0.6;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = 'rgb(120,82,48)';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = u;
  ctx.beginPath();
  ctx.rect(cx - 3, cy + r + 2, 6, 5);
  ctx.fill();
  ctx.stroke();
}

function paintGround(ctx, paint, u) {
  const w = 22;
  const h = 46;
  const x = BOX / 2 - w / 2;
  const y = BOX / 2 - h / 2;
  const p = new Path2D();
  p.roundRect ? p.roundRect(x, y, w, h, 5) : p.rect(x, y, w, h);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = u * 1.5;
  ctx.stroke(p);
  fillWith(ctx, p, rgb(paint.body));
  clipped(ctx, p, () => {
    ctx.fillStyle = cylinder(ctx, BOX / 2, w / 2, 0.8);
    ctx.fillRect(0, 0, BOX, BOX);
  });
  ctx.fillStyle = 'rgb(18,28,44)';
  ctx.fillRect(x + 3, y + 7, w - 6, 8);
  ctx.fillStyle = 'rgb(255,170,0)';
  ctx.fillRect(x + 5, y + 19, w - 10, 3);
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

/**
 * The aircraft drawn `px` CSS pixels wide (at device pixel ratio `dpr`). `fill` is a colour, or
 * REALISTIC for natural white/grey paint.
 */
export function sprite(id, fill, px, dpr) {
  return cached(`${id}|${fill}|${px}|${dpr}`, () => {
    const g = geometry(id);
    const size = Math.ceil(px * dpr);
    const c = canvas(size);
    const ctx = c.getContext('2d');
    ctx.scale(size / BOX, size / BOX);
    const u = BOX / px; // one CSS pixel in sprite units
    const blur = Math.max(1.2, size * 0.035);
    const paint = paintFor(fill, g.m.military);
    if (g.kind === 'balloon') paintBalloon(ctx, paint, u);
    else if (g.kind === 'ground') paintGround(ctx, paint, u);
    else if (g.kind === 'heli') paintHeli(ctx, g, pathsFor(id, g), paint, u, blur);
    else paintAirframe(ctx, id, g, pathsFor(id, g), paint, u, blur);
    return c;
  });
}

/** Padding (CSS px) around a shadow sprite for its blur. */
export const SHADOW_PAD = 6;

/** A soft dark silhouette of the aircraft, drawn offset below it as a drop shadow. */
export function shadowSprite(id, px, dpr) {
  return cached(`shadow|${id}|${px}|${dpr}`, () => {
    const g = geometry(id);
    const full = px + SHADOW_PAD * 2;
    const c = canvas(Math.ceil(full * dpr));
    const ctx = c.getContext('2d');
    ctx.translate(SHADOW_PAD * dpr, SHADOW_PAD * dpr);
    ctx.scale((px * dpr) / BOX, (px * dpr) / BOX);
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 2.5 * dpr;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
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
    // The disc swept by the blades: a faint glassy tint with a light rim and a dark edge, so it
    // reads on dark and light maps alike.
    const disc = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
    disc.addColorStop(0, 'rgba(255,255,255,0.04)');
    disc.addColorStop(0.8, 'rgba(255,255,255,0.09)');
    disc.addColorStop(0.95, 'rgba(255,255,255,0.22)');
    disc.addColorStop(0.985, 'rgba(10,14,20,0.35)');
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
        trail.addColorStop(a, 'rgba(225,230,236,0.42)');
        trail.addColorStop(a + 0.3 / n, 'rgba(225,230,236,0)');
        trail.addColorStop(a + 0.999 / n, 'rgba(225,230,236,0)');
      }
      ctx.fillStyle = trail;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.97, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineCap = 'round';
    const bw = Math.max(1.2 * dpr, r * 0.07);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const [cx, cy] = [Math.cos(a), Math.sin(a)];
      ctx.beginPath();
      ctx.moveTo(cx * r * 0.08, cy * r * 0.08);
      ctx.lineTo(cx * r * 0.96, cy * r * 0.96);
      ctx.strokeStyle = 'rgba(12,16,22,0.9)';
      ctx.lineWidth = bw;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = bw * 0.35;
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
  add(g.tracks);
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
