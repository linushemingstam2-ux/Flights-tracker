// Aircraft silhouettes (32×32, nose pointing up) and pre-rendered sprites for the map canvas.

const SHAPES = {
  jet: {
    scale: 1,
    paths: [
      'M16 1C17 1 17.6 2.4 17.6 4L17.6 11 30 18.5 30 20.5 17.6 16.5 17.4 25 21.5 28.2 21.5 29.8 16.6 28.6 16 30.5 15.4 28.6 10.5 29.8 10.5 28.2 14.6 25 14.4 16.5 2 20.5 2 18.5 14.4 11 14.4 4C14.4 2.4 15 1 16 1Z',
    ],
  },
  heavy: {
    scale: 1.25,
    paths: [
      'M16 1C17.1 1 17.8 2.6 17.8 4.5L17.8 11 30.5 18.8 30.5 20.8 17.8 16.6 17.5 25 22 28.2 22 29.8 16.6 28.6 16 30.5 15.4 28.6 10 29.8 10 28.2 14.5 25 14.2 16.6 1.5 20.8 1.5 18.8 14.2 11 14.2 4.5C14.2 2.6 14.9 1 16 1Z',
      'M20.6 12.4h1.6v3.6h-1.6zM25 15.1h1.4v3h-1.4zM9.8 12.4h1.6v3.6h-1.6zM5.6 15.1h1.4v3h-1.4z',
    ],
  },
  light: {
    scale: 0.8,
    paths: [
      'M16 3C16.9 3 17.2 4 17.2 5.5L17.2 9 29 9.5 29 12.5 17.2 13 16.9 22 21 23 21 25.5 16.4 25.5 16 27 15.6 25.5 11 25.5 11 23 15.1 22 14.8 13 3 12.5 3 9.5 14.8 9 14.8 5.5C14.8 4 15.1 3 16 3Z',
    ],
  },
  fighter: {
    scale: 0.95,
    paths: [
      'M16 2C16.8 2 17.2 4 17.2 6L17.4 12 28 22 28 24 17.6 21.5 17.6 25 21 28 21 29.5 16 28.5 11 29.5 11 28 14.4 25 14.4 21.5 4 24 4 22 14.6 12 14.8 6C14.8 4 15.2 2 16 2Z',
    ],
  },
  helicopter: {
    scale: 0.9,
    paths: [
      'M16 6C19 6 20 8.5 20 11.5 20 14.5 18.5 16.5 17 17L16.8 27 19.5 27.5 19.5 29 12.5 29 12.5 27.5 15.2 27 15 17C13.5 16.5 12 14.5 12 11.5 12 8.5 13 6 16 6Z',
      'M5.43 2.07 25.43 22.07 26.57 20.93 6.57 0.93Z',
      'M26.57 2.07 6.57 22.07 5.43 20.93 25.43 0.93Z',
    ],
  },
  glider: {
    scale: 0.9,
    paths: [
      'M16 6C16.7 6 17 7 17 8.5L17 12 31 13 31 14.2 17 14.6 16.6 26 19.5 26.5 19.5 27.8 12.5 27.8 12.5 26.5 15.4 26 15 14.6 1 14.2 1 13 15 12 15 8.5C15 7 15.3 6 16 6Z',
    ],
  },
  balloon: {
    scale: 0.8,
    paths: ['M16 3A8 8 0 1 1 15.99 3Z', 'M14 21h4v4h-4z'],
  },
  ground: {
    scale: 0.6,
    paths: ['M12 7h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-14a2 2 0 0 1 2-2z'],
  },
};

const HEAVY_TYPES = new Set([
  'A306', 'A30B', 'A310', 'A332', 'A333', 'A337', 'A338', 'A339', 'A342', 'A343', 'A345', 'A346',
  'A359', 'A35K', 'A388', 'A3ST', 'A400', 'B741', 'B742', 'B743', 'B744', 'B748', 'B74S', 'B762',
  'B763', 'B764', 'B772', 'B773', 'B778', 'B779', 'B77L', 'B77W', 'B788', 'B789', 'B78X', 'BLCF',
  'C17', 'C5M', 'DC10', 'IL76', 'IL96', 'K35R', 'KC10', 'MD11', 'A124', 'A225', 'E3CF', 'E3TF',
]);

const HELI_TYPE = /^(A109|A119|A139|A169|A189|AS32|AS35|AS50|AS55|AS65|B06|B212|B407|B412|B429|B505|EC20|EC25|EC30|EC35|EC45|EC55|EC75|H125|H130|H135|H145|H155|H160|H175|H60|MI8|MI17|R22|R44|R66|S61|S76|S92|UH1|NH90|AW09|AW69|LYNX|EH10|CH47|V22)/;

/** Which silhouette to draw for an aircraft. */
export function shapeFor(ac) {
  const t = ac.type || '';
  if (HELI_TYPE.test(t)) return 'helicopter';
  if (HEAVY_TYPES.has(t)) return 'heavy';
  switch (ac.category) {
    case 'A1':
    case 'B4':
    case 'B6':
      return 'light';
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
export const GROUND_FILL = '#9aa7b4';

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

/** Legend stops for the altitude colour bar. */
export const ALTITUDE_LEGEND = [0, 2000, 4000, 6000, 8000, 10000, 20000, 30000, 40000];

// ── Sprites ───────────────────────────────────────────────────────────────

const spriteCache = new Map();
const path2dCache = new Map();

function paths(shape) {
  if (!path2dCache.has(shape)) path2dCache.set(shape, SHAPES[shape].paths.map((d) => new Path2D(d)));
  return path2dCache.get(shape);
}

/**
 * A canvas with the silhouette drawn in `fill` with a dark outline, sized for
 * `px` CSS pixels at the given device pixel ratio.
 */
export function sprite(shape, fill, px, dpr) {
  const key = `${shape}|${fill}|${px}|${dpr}`;
  let c = spriteCache.get(key);
  if (c) return c;
  const size = Math.ceil(px * dpr);
  c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.scale(size / 32, size / 32);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(10, 14, 20, 0.9)';
  for (const p of paths(shape)) ctx.stroke(p);
  ctx.fillStyle = fill;
  for (const p of paths(shape)) ctx.fill(p);
  if (spriteCache.size > 600) spriteCache.clear();
  spriteCache.set(key, c);
  return c;
}

/** Inline SVG markup for a silhouette (used in the UI, e.g. the details panel). */
export function svgIcon(shape, fill = CLASSIC_FILL) {
  const d = SHAPES[shape]?.paths ?? SHAPES.jet.paths;
  return `<svg viewBox="0 0 32 32" aria-hidden="true">${d
    .map((p) => `<path d="${p}" fill="${fill}" stroke="rgba(10,14,20,.9)" stroke-width="1.2" stroke-linejoin="round"/>`)
    .join('')}</svg>`;
}
