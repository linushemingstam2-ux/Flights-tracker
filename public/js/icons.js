// Aircraft symbols: detailed top-view silhouettes (64×64 units, nose up), rendered once per
// shape/colour/size into shaded sprites with a soft drop shadow for the map canvas.

// ── Geometry ──────────────────────────────────────────────────────────────

const CX = 32;

/** A closed outline from the right half (top centre → bottom centre), mirrored to the left. */
function sym(right) {
  const pts = [...right, ...right.slice(1, -1).reverse().map(([x, y]) => [2 * CX - x, y])];
  return `M${pts.map(([x, y]) => `${+x.toFixed(2)} ${+y.toFixed(2)}`).join('L')}Z`;
}

/** A shape and its mirror image (for paired parts like engines). */
function pair(right) {
  const shape = (pts) => `M${pts.map(([x, y]) => `${+x.toFixed(2)} ${+y.toFixed(2)}`).join('L')}Z`;
  return [shape(right), shape(right.map(([x, y]) => [2 * CX - x, y]))];
}

/** A nacelle: rounded front at `top`, centred on x, `w` wide, ending at `bottom`. */
function nacelle(x, top, bottom, w) {
  const h = w / 2;
  return pair([
    [x - h, bottom],
    [x - h, top + h * 0.9],
    [x - h * 0.65, top + h * 0.25],
    [x, top],
    [x + h * 0.65, top + h * 0.25],
    [x + h, top + h * 0.9],
    [x + h, bottom],
  ]);
}

// Shared airliner nose: smooth rounded cone over the first few units.
const nose = (top, halfWidth, len = 5) => [
  [CX, top],
  [CX + halfWidth * 0.45, top + len * 0.08],
  [CX + halfWidth * 0.78, top + len * 0.3],
  [CX + halfWidth * 0.95, top + len * 0.62],
  [CX + halfWidth, top + len],
];
const cockpit = (y, hw) =>
  `M${CX - hw} ${y + 1.4}Q${CX} ${y - 0.4} ${CX + hw} ${y + 1.4}L${CX + hw * 0.8} ${y + 2.6}Q${CX} ${y + 1.4} ${CX - hw * 0.8} ${y + 2.6}Z`;

/**
 * Each shape: body (filled, shaded), engines (drawn under the body, darker),
 * details (dark marks on top), lines (thin strokes, e.g. props, rotor blades),
 * disc (translucent rotor disc), scale (relative size on the map).
 */
const SHAPES = {
  // Narrow-body twin jet: A320 family, 737, 757, E-jets, A220.
  jet: {
    scale: 1,
    body: [
      sym([
        ...nose(2.5, 2.6),
        [34.6, 24.5],
        [46, 30.2],
        [57.4, 36],
        [58.5, 36.7],
        [58.6, 38],
        [57.6, 38.5],
        [46, 36.5],
        [35, 36.9],
        [34.6, 48.6],
        [43.6, 54.4],
        [44.3, 55.5],
        [43.8, 56.6],
        [34.4, 55.9],
        [33.9, 59.3],
        [33, 61.1],
        [CX, 61.6],
      ]),
    ],
    engines: nacelle(43, 25.2, 32.5, 3.6),
    details: [cockpit(6.4, 1.7)],
    fin: [47.5, 60.5],
  },

  // Wide-body twin: 777, 787, A330, A350, 767.
  heavy: {
    scale: 1.22,
    body: [
      sym([
        ...nose(2, 3.4, 5.6),
        [35.4, 22.5],
        [48, 29.5],
        [61, 37.2],
        [61.9, 38],
        [61.7, 39.2],
        [60.6, 39.4],
        [48, 37],
        [35.6, 36],
        [35.4, 49],
        [46.6, 55.2],
        [47.3, 56.4],
        [46.7, 57.4],
        [35.2, 56.6],
        [34.4, 60.2],
        [33.2, 62],
        [CX, 62.4],
      ]),
    ],
    engines: nacelle(44.5, 23.6, 33.5, 5),
    details: [cockpit(6.2, 2.2)],
    fin: [47.5, 61.2],
  },

  // Four engines: 747, A380, A340, C-17, Il-76.
  quad: {
    scale: 1.32,
    body: [
      sym([
        ...nose(1.8, 3.6, 5.8),
        [35.6, 21.5],
        [49, 29],
        [62, 37],
        [62.7, 37.8],
        [62.5, 39],
        [61.4, 39.2],
        [49, 37],
        [35.8, 35.6],
        [35.6, 49],
        [47, 55],
        [47.7, 56.2],
        [47.1, 57.2],
        [35.4, 56.4],
        [34.6, 60.2],
        [33.3, 62],
        [CX, 62.4],
      ]),
    ],
    engines: [...nacelle(42.5, 21.9, 31, 3.8), ...nacelle(52.5, 27.7, 36, 3.6)],
    details: [cockpit(6, 2.3)],
    fin: [47.5, 61.2],
  },

  // Rear-engined regional jets: CRJ, ERJ-145, Fokker 70/100, MD-80.
  rearjet: {
    scale: 0.92,
    body: [
      sym([
        ...nose(3, 2.4, 5),
        [34.4, 26.5],
        [44, 30.4],
        [54, 34.6],
        [54.9, 35.3],
        [54.9, 36.5],
        [54, 36.9],
        [44, 36.8],
        [35, 37.3],
        [34.4, 55.4],
        [42.6, 57.5],
        [43.3, 58.5],
        [42.7, 59.5],
        [33.7, 59.2],
        [32.9, 61.3],
        [CX, 61.8],
      ]),
    ],
    engines: pair([
      [35.3, 52.6],
      [35.3, 45],
      [35.9, 43.6],
      [37.4, 43.1],
      [38.9, 43.6],
      [39.5, 45],
      [39.5, 52.6],
      [38.7, 53.5],
      [36.1, 53.5],
    ]),
    details: [cockpit(6.8, 1.6)],
    fin: [49, 60.5],
  },

  // Business jets: rear engines, swept wing with winglets (Gulfstream, Citation, Learjet…).
  bizjet: {
    scale: 0.8,
    body: [
      sym([
        ...nose(4, 2.4, 6),
        [34.4, 27],
        [47, 34.5],
        [55.5, 39.6],
        [56.6, 40],
        [57.1, 38.6],
        [57.6, 41.4],
        [55.8, 41.9],
        [46, 40.4],
        [35, 39.4],
        [34.3, 52.5],
        [42.2, 56.5],
        [42.8, 57.6],
        [42.2, 58.5],
        [33.7, 57.8],
        [32.9, 60.5],
        [CX, 61],
      ]),
    ],
    engines: pair([
      [35.2, 50.8],
      [35.2, 44.4],
      [35.8, 43.1],
      [37.3, 42.6],
      [38.8, 43.1],
      [39.4, 44.4],
      [39.4, 50.8],
      [38.6, 51.7],
      [36, 51.7],
    ]),
    details: [cockpit(8.2, 1.6)],
    fin: [49, 60],
  },

  // Twin turboprops: ATR, Dash 8, Saab 340, King Air.
  turboprop: {
    scale: 0.9,
    body: [
      sym([
        ...nose(3, 2.6, 5.5),
        [34.6, 22],
        [59, 23.3],
        [60, 23.9],
        [60, 26.4],
        [59, 27],
        [34.6, 28.6],
        [34.4, 53],
        [43, 54.6],
        [43.7, 55.6],
        [43.1, 56.6],
        [34.2, 56.4],
        [33.4, 60.5],
        [32.4, 61.6],
        [CX, 61.8],
      ]),
    ],
    engines: nacelle(43, 15.4, 32, 3.4),
    details: [cockpit(6.8, 1.7)],
    lines: [
      ['M37.6 14.6L48.4 14.6', 1.25],
      ['M26.4 14.6L15.6 14.6', 1.25],
    ],
    fin: [50, 61],
  },

  // Single-engine piston/turboprop: Cessna, Piper, Cirrus, PC-12…
  light: {
    scale: 0.74,
    body: [
      sym([
        [CX, 7.6],
        [33.6, 8],
        [34.5, 9.4],
        [34.7, 11.6],
        [34.7, 19.6],
        [57.6, 20.3],
        [58.8, 20.9],
        [58.8, 25.9],
        [57.6, 26.5],
        [34.7, 27.1],
        [33.9, 47.6],
        [42, 48.7],
        [42.7, 49.8],
        [42.1, 52.5],
        [33.5, 52.6],
        [32.7, 55.5],
        [CX, 56],
      ]),
    ],
    engines: [],
    details: [`M${CX - 2} 15.6Q${CX} 14.4 ${CX + 2} 15.6L${CX + 1.8} 18.4L${CX - 1.8} 18.4Z`],
    lines: [['M24.8 6.4L39.2 6.4', 1.3]],
    fin: [46.5, 55],
  },

  fighter: {
    scale: 0.98,
    body: [
      sym([
        [CX, 1.2],
        [32.7, 3.2],
        [33.5, 7.5],
        [34, 14],
        [34.6, 22.5],
        [41, 30],
        [50.2, 40],
        [50.6, 42.2],
        [49.8, 43.2],
        [36.2, 43.4],
        [36.6, 47.2],
        [43.2, 53.8],
        [43.4, 56],
        [42.4, 56.7],
        [35.6, 56.2],
        [34.8, 60],
        [CX, 60.6],
      ]),
    ],
    engines: [],
    details: [`M${CX} 6.6Q${CX + 1.6} 9.5 ${CX + 1.4} 14.5Q${CX} 15.6 ${CX - 1.4} 14.5Q${CX - 1.6} 9.5 ${CX} 6.6Z`],
    lines: [
      ['M34.9 47L34.9 57.6', 1.1],
      ['M29.1 47L29.1 57.6', 1.1],
    ],
  },

  helicopter: {
    scale: 0.92,
    disc: [CX, 24, 27],
    body: [
      sym([
        [CX, 11.5],
        [34.8, 12.1],
        [37, 14.4],
        [38, 18.2],
        [38, 26],
        [36.9, 31.4],
        [34.7, 35],
        [33.2, 37],
        [33.2, 47],
        [37.4, 47.6],
        [37.6, 49.3],
        [33.2, 49.7],
        [33, 56.4],
        [CX, 57.2],
      ]),
      'M33.4 51.6h3.8v1.6h-3.8z',
    ],
    engines: [],
    details: [`M${CX - 4} 15.2Q${CX} 12.6 ${CX + 4} 15.2L${CX + 3.6} 19Q${CX} 17.6 ${CX - 3.6} 19Z`],
    lines: [
      ['M7.9 11.9L56.1 36.1', 1.7],
      ['M56.1 11.9L7.9 36.1', 1.7],
    ],
    hub: [CX, 24, 1.8],
  },

  glider: {
    scale: 0.9,
    body: [
      sym([
        [CX, 8],
        [33, 8.4],
        [33.6, 10],
        [33.8, 13],
        [33.8, 22],
        [62, 23.2],
        [62.6, 23.8],
        [62.4, 24.8],
        [33.8, 26],
        [33.2, 50],
        [40.6, 51],
        [41, 52.4],
        [40.4, 53.2],
        [32.8, 53],
        [32.4, 55.6],
        [CX, 56],
      ]),
    ],
    engines: [],
    details: [`M${CX - 1.2} 12Q${CX} 10.6 ${CX + 1.2} 12L${CX + 1} 17L${CX - 1} 17Z`],
  },

  balloon: {
    scale: 0.82,
    body: ['M32 12A14 14 0 1 1 31.99 12Z', 'M29.4 44.6h5.2v5h-5.2z'],
    engines: [],
    details: [],
    lines: [
      ['M32 12.4L32 39.6', 0.9],
      ['M22.4 16Q27 26 22.4 36', 0.9],
      ['M41.6 16Q37 26 41.6 36', 0.9],
    ],
  },

  ground: {
    scale: 0.6,
    body: ['M24 16h16a3.5 3.5 0 0 1 3.5 3.5v26a3.5 3.5 0 0 1-3.5 3.5h-16a3.5 3.5 0 0 1-3.5-3.5v-26a3.5 3.5 0 0 1 3.5-3.5z'],
    engines: [],
    details: ['M24.5 20.5h15v6h-15z'],
  },
};

// ── Choosing a shape ──────────────────────────────────────────────────────

const TYPES = {
  quad: 'A124 A225 A342 A343 A345 A346 A388 A400 B741 B742 B743 B744 B748 B74D B74R B74S B52 BLCF C17 C5 C5M E3CF E3TF E6 IL76 IL96 K35R KC35 VC25',
  heavy:
    'A306 A30B A310 A332 A333 A337 A338 A339 A359 A35K A3ST B762 B763 B764 B772 B773 B778 B779 B77L B77W B788 B789 B78X DC10 KC10 KC46 L101 MD11',
  rearjet:
    'B712 CRJ1 CRJ2 CRJ7 CRJ9 CRJX DC91 DC93 DC94 DC95 DC9 E135 E145 E35L E45X F28 F70 F100 MD81 MD82 MD83 MD87 MD88 MD90 B721 B722 T134 YK42',
  bizjet:
    'ASTR BE40 C25A C25B C25C C25M C500 C501 C510 C525 C526 C550 C551 C55B C560 C56X C650 C680 C68A C700 C750 CL30 CL35 CL60 E50P E55P E545 E550 FA10 FA20 FA50 FA7X FA8X F2TH F900 G150 G280 GA5C GA6C GALX GL5T GL7T GLEX GLF2 GLF3 GLF4 GLF5 GLF6 H25B H25C HA4T HDJT LJ31 LJ35 LJ40 LJ45 LJ55 LJ60 LJ75 PC24 PRM1 SF50 WW24',
  turboprop:
    'AN24 AN26 AN32 AT43 AT44 AT45 AT46 AT72 AT73 AT75 AT76 ATP B190 B350 BE20 BE30 BE9L BE99 C212 C295 CN35 D228 D328 DH8A DH8B DH8C DH8D DHC6 DHC7 E110 E120 F27 F50 J328 JS31 JS32 JS41 L410 MA60 P180 SB20 SF34 SW4 C130 C30J P3 E2',
  light:
    'BE33 BE35 BE36 BE55 BE58 BE76 C150 C152 C162 C170 C172 C175 C177 C180 C182 C185 C188 C195 C206 C207 C208 C210 C337 C340 C414 C421 DA20 DA40 DA42 DA50 DA62 EV97 M20P M20T P28A P28B P28R P28T P32R P46T PA18 PA22 PA23 PA24 PA27 PA31 PA34 PA44 PA46 PC6 PC12 PC21 SR20 SR22 S22T TB20 TBM7 TBM8 TBM9 TOBA ULAC',
  fighter: 'A10 EUFI F14 F15 F16 F18 F22 F35 FA18 GRIF HAWK M2000 MIG29 RFAL SU27 SU30 SU35 T38 TOR TYPH',
};
const TYPE_SHAPE = new Map();
for (const [shape, list] of Object.entries(TYPES)) for (const t of list.split(' ')) TYPE_SHAPE.set(t, shape);

const HELI_TYPE = /^(A109|A119|A139|A149|A169|A189|AS32|AS35|AS50|AS55|AS65|B06|B105|B212|B222|B230|B407|B412|B427|B429|B430|B505|BK17|CH47|EC20|EC25|EC30|EC35|EC45|EC55|EC75|EH10|EXPL|H125|H130|H135|H145|H155|H160|H175|H215|H225|H47|H500|H60|LYNX|MI8|MI17|MI24|NH90|R22|R44|R66|S61|S64|S70|S76|S92|UH1|UH60|AW09|AW69|V22)/;

/** Which silhouette to draw for an aircraft. */
export function shapeFor(ac) {
  const t = (ac.type || '').toUpperCase();
  if (HELI_TYPE.test(t)) return 'helicopter';
  if (TYPE_SHAPE.has(t)) return TYPE_SHAPE.get(t);
  switch (ac.category) {
    case 'A1':
    case 'B4':
    case 'B6':
      return 'light';
    case 'A2':
      return 'bizjet';
    case 'A5':
      return 'heavy';
    case 'A6':
      return 'fighter';
    case 'A7':
      return 'helicopter';
    case 'B1':
      return 'glider';
    case 'B2':
      return 'balloon';
    case 'C1':
    case 'C2':
    case 'C3':
      return 'ground';
    default:
      return 'jet';
  }
}

export function shapeScale(shape) {
  return SHAPES[shape]?.scale ?? 1;
}

// ── Colours ───────────────────────────────────────────────────────────────

export const CLASSIC_FILL = '#ffc72c';
export const SELECTED_FILL = '#ff4d3a';
export const EMERGENCY_FILL = '#ff2d55';
export const GROUND_FILL = '#a3afbd';

// Altitude (ft) → hue, similar to the scale ADS-B enthusiasts know from tar1090.
const ALT_HUES = [
  [0, 20],
  [2000, 32],
  [4000, 43],
  [6000, 54],
  [8000, 72],
  [10000, 100],
  [13000, 140],
  [20000, 190],
  [30000, 240],
  [40000, 300],
];

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

// ── Sprites ───────────────────────────────────────────────────────────────

const spriteCache = new Map();
const pathCache = new Map();

function paths(shape) {
  let p = pathCache.get(shape);
  if (!p) {
    const s = SHAPES[shape];
    const body = new Path2D();
    for (const d of s.body) body.addPath(new Path2D(d));
    const engines = new Path2D();
    for (const d of s.engines) engines.addPath(new Path2D(d));
    p = {
      body,
      engines,
      hasEngines: s.engines.length > 0,
      details: s.details.map((d) => new Path2D(d)),
      lines: (s.lines || []).map(([d, w]) => [new Path2D(d), w]),
    };
    pathCache.set(shape, p);
  }
  return p;
}

function cached(key, make) {
  let c = spriteCache.get(key);
  if (!c) {
    c = make();
    if (spriteCache.size > 2000) spriteCache.clear();
    spriteCache.set(key, c);
  }
  return c;
}

/**
 * The aircraft drawn `px` CSS pixels wide (at device pixel ratio `dpr`) in `fill`, with a crisp
 * outline, a glossy highlight along the fuselage, soft top-to-bottom lighting, darker engines
 * and small details (cockpit glass, fin, propellers, rotor).
 */
export function sprite(shape, fill, px, dpr) {
  return cached(`${shape}|${fill}|${px}|${dpr}`, () => {
    const s = SHAPES[shape];
    const p = paths(shape);
    const size = Math.ceil(px * dpr);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.scale(size / 64, size / 64);
    const unit = 64 / px; // one CSS pixel in shape units
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (s.disc) {
      const [x, y, r] = s.disc;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.fill();
      ctx.lineWidth = unit * 0.8;
      ctx.strokeStyle = 'rgba(10, 14, 20, 0.35)';
      ctx.stroke();
    }

    // Outline: stroked wide, then the fills cover its inner half for a clean outer edge.
    ctx.strokeStyle = 'rgba(8, 11, 17, 0.92)';
    ctx.lineWidth = unit * 2.1;
    ctx.stroke(p.body);
    if (p.hasEngines) ctx.stroke(p.engines);

    // Engines sit under the wing, so only their intakes show in front of it.
    if (p.hasEngines) {
      ctx.fillStyle = fill;
      ctx.fill(p.engines);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
      ctx.fill(p.engines);
    }

    ctx.fillStyle = fill;
    ctx.fill(p.body);

    // Shading, clipped to the body: rounded-fuselage gloss plus light from the front.
    ctx.save();
    ctx.clip(p.body);
    const across = ctx.createLinearGradient(0, 0, 64, 0);
    across.addColorStop(0, 'rgba(0, 0, 0, 0.26)');
    across.addColorStop(0.38, 'rgba(0, 0, 0, 0)');
    across.addColorStop(0.465, 'rgba(255, 255, 255, 0.12)');
    across.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
    across.addColorStop(0.535, 'rgba(255, 255, 255, 0.12)');
    across.addColorStop(0.62, 'rgba(0, 0, 0, 0)');
    across.addColorStop(1, 'rgba(0, 0, 0, 0.26)');
    ctx.fillStyle = across;
    ctx.fillRect(0, 0, 64, 64);
    const along = ctx.createLinearGradient(0, 0, 0, 64);
    along.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
    along.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
    along.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
    ctx.fillStyle = along;
    ctx.fillRect(0, 0, 64, 64);
    ctx.restore();

    // Vertical fin seen from above: a darker ridge along the tail.
    if (s.fin) {
      ctx.beginPath();
      ctx.moveTo(CX, s.fin[0]);
      ctx.lineTo(CX, s.fin[1]);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.lineWidth = Math.max(1.4, unit * 0.9);
      ctx.stroke();
    }

    // Cockpit glass and other dark details.
    ctx.fillStyle = 'rgba(12, 22, 38, 0.82)';
    for (const d of p.details) ctx.fill(d);

    // Propellers, rotor blades, fins: thin dark strokes that stay at least ~0.6 px wide.
    ctx.strokeStyle = 'rgba(12, 16, 22, 0.8)';
    for (const [d, w] of p.lines) {
      ctx.lineWidth = Math.max(w, unit * 0.65);
      ctx.stroke(d);
    }
    if (s.hub) {
      ctx.beginPath();
      ctx.arc(s.hub[0], s.hub[1], s.hub[2], 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(12, 16, 22, 0.9)';
      ctx.fill();
    }
    return c;
  });
}

/** Padding (CSS px) around a shadow sprite for its blur. */
export const SHADOW_PAD = 6;

/** A soft dark silhouette of the aircraft, drawn offset below it as a drop shadow. */
export function shadowSprite(shape, px, dpr) {
  return cached(`shadow|${shape}|${px}|${dpr}`, () => {
    const p = paths(shape);
    const full = px + SHADOW_PAD * 2;
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(full * dpr);
    const ctx = c.getContext('2d');
    ctx.translate(SHADOW_PAD * dpr, SHADOW_PAD * dpr);
    ctx.scale((px * dpr) / 64, (px * dpr) / 64);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 2.5 * dpr;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fill(p.body);
    if (p.hasEngines) ctx.fill(p.engines);
    return c;
  });
}

/** Inline SVG markup for a silhouette (used in the UI, e.g. the flight card and search). */
export function svgIcon(shape, fill = CLASSIC_FILL) {
  const s = SHAPES[shape] ?? SHAPES.jet;
  const outline = 'stroke="rgba(10,14,20,.9)" stroke-width="2" stroke-linejoin="round"';
  const engines = s.engines.map((d) => `<path d="${d}" fill="${fill}" ${outline}/>`).join('');
  const body = s.body.map((d) => `<path d="${d}" fill="${fill}" ${outline}/>`).join('');
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${engines}${body}</svg>`;
}
