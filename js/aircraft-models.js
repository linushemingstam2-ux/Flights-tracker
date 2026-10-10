// Aircraft models for the map symbols. Dimensions are in metres: length (L), wingspan (S) and
// fuselage width (W) from published specifications; planform details (chords, sweep, tail and
// engine positions) estimated from three-view drawings. y is measured aft from the nose, x out
// to the right; everything listed for the right side is mirrored to the left.
//
//   nose: { len, a, b }     superellipse nose cone (higher a = blunter)
//   tailLen, tailEnd        length of the tail cone, and its end width (fraction of W)
//   wing / ht: { y, cr, ct, sweep, kink, teIn, tip, tipW, tracks, span, tTail }
//                           root leading edge, root/tip chord, leading-edge sweep (deg), Yehudi
//                           kink (fraction of semi-span), wingtip device and its size
//   fin: { y, len, t }      vertical fin seen from above (thickness t)
//   fans                    under-wing turbofans { x, len, d, lead (fraction ahead of the wing) }
//   rear, center, otw       fuselage-mounted, centreline (trijets) and over-the-wing engines
//   props, noseProp         propellers on the wing { x, d, blades, front, len, w } or at the nose
//   fairing, deck, rotodome wing-body fairing bulge, 747 upper deck, AWACS radar dome

function merge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' ? { ...base[k], ...v } : v;
  }
  return out;
}

/** A longer or shorter version of a type: fuselage plugs ahead of and behind the wing. */
function stretch(base, L, extra) {
  const d = L - base.L;
  const fwd = d * 0.45;
  const m = { ...base, L };
  if (base.wing) m.wing = { ...base.wing, y: base.wing.y + fwd };
  if (base.ht) m.ht = { ...base.ht, y: base.ht.y + d };
  if (base.fin) m.fin = { ...base.fin, y: base.fin.y + d };
  if (base.rear) m.rear = base.rear.map((e) => ({ ...e, y: e.y + d }));
  if (base.center) m.center = { ...base.center, y: base.center.y + d };
  if (base.props) m.props = base.props.map((p) => ({ ...p, front: p.front + fwd }));
  if (base.fairing) m.fairing = { ...base.fairing, y: base.fairing.y + fwd };
  if (base.deck) m.deck = base.deck + fwd;
  if (base.rotodome) m.rotodome = { ...base.rotodome, y: base.rotodome.y + fwd };
  return merge(m, extra);
}

// ── Airliners ────────────────────────────────────────────────────────────

const A320 = {
  L: 37.57, S: 35.8, W: 3.95,
  nose: { len: 4.4, a: 2.1, b: 2 }, tailLen: 10.6, tailEnd: 0.17,
  wing: { y: 13, cr: 6.7, ct: 1.5, sweep: 27, kink: 0.33, teIn: 1, tip: 'sharklet', tipW: 0.8, tracks: 3 },
  ht: { y: 31.3, cr: 3.7, ct: 1.3, span: 12.45, sweep: 32 },
  fin: { y: 28.6, len: 8.5, t: 0.34 },
  fans: [{ x: 5.75, len: 4.5, d: 2.2, lead: 0.62 }],
};
const NEO = { fans: [{ x: 5.75, len: 4.9, d: 2.45, lead: 0.6 }] };

const B738 = {
  L: 39.47, S: 35.79, W: 3.76,
  nose: { len: 5, a: 1.75, b: 1.9 }, tailLen: 11.2, tailEnd: 0.15,
  wing: { y: 14.4, cr: 6.4, ct: 1.25, sweep: 27, kink: 0.32, teIn: 1, tip: 'winglet', tipW: 0.9, tracks: 3 },
  ht: { y: 33.4, cr: 3.9, ct: 1.2, span: 14.35, sweep: 31 },
  fin: { y: 30.8, len: 8.4, t: 0.32 },
  fans: [{ x: 4.9, len: 4.1, d: 2.05, lead: 0.7 }],
};
const MAX = { wing: { tip: 'winglet', tipW: 1.0 }, fans: [{ x: 4.95, len: 4.5, d: 2.25, lead: 0.68 }] };
const B733 = stretch(B738, 33.4, { S: 28.88, wing: { tip: 'none' }, fans: [{ x: 4.9, len: 3.9, d: 1.9, lead: 0.72 }] });

const B752 = {
  L: 47.32, S: 38.05, W: 3.76,
  nose: { len: 5.2, a: 1.8, b: 1.9 }, tailLen: 12.5, tailEnd: 0.15,
  wing: { y: 17, cr: 8, ct: 1.75, sweep: 27, kink: 0.3, teIn: 1, tip: 'winglet', tipW: 0.9, tracks: 3 },
  ht: { y: 41, cr: 4.4, ct: 1.4, span: 15.21, sweep: 31 },
  fin: { y: 37.8, len: 9.2, t: 0.34 },
  fans: [{ x: 6.6, len: 5.4, d: 2.5, lead: 0.62 }],
};

const BCS3 = {
  L: 38.7, S: 35.1, W: 3.7,
  nose: { len: 4.3, a: 2, b: 2 }, tailLen: 11, tailEnd: 0.16,
  wing: { y: 14.4, cr: 6.5, ct: 1.4, sweep: 27, kink: 0.3, teIn: 1, tip: 'raked', tipW: 1.2, tracks: 3 },
  ht: { y: 33, cr: 3.6, ct: 1.2, span: 11.5, sweep: 31 },
  fin: { y: 30.2, len: 8.2, t: 0.32 },
  fans: [{ x: 5.9, len: 4.9, d: 2.35, lead: 0.6 }],
};

const E190 = {
  L: 36.24, S: 28.72, W: 3.01,
  nose: { len: 3.9, a: 1.9, b: 1.95 }, tailLen: 10.2, tailEnd: 0.16,
  wing: { y: 13.8, cr: 5.4, ct: 1.15, sweep: 26, kink: 0.3, teIn: 1, tip: 'winglet', tipW: 0.55, tracks: 3 },
  ht: { y: 31, cr: 3, ct: 1.1, span: 12.08, sweep: 31 },
  fin: { y: 28, len: 7.9, t: 0.3 },
  fans: [{ x: 4.65, len: 3.7, d: 1.7, lead: 0.62 }],
};
const E290 = merge(E190, { S: 33.72, wing: { tip: 'none', ct: 1.0 }, fans: [{ x: 5.2, len: 4.3, d: 2.1, lead: 0.62 }] });

const CRJ9 = {
  L: 36.2, S: 24.85, W: 2.69,
  nose: { len: 4.3, a: 1.6, b: 1.85 }, tailLen: 10.5, tailEnd: 0.18,
  wing: { y: 15.4, cr: 4.7, ct: 1, sweep: 29, kink: 0.25, teIn: 1, tip: 'winglet', tipW: 0.45, tracks: 2 },
  ht: { y: 33.2, cr: 2.3, ct: 1, span: 8.54, sweep: 31, tTail: true },
  fin: { y: 28.6, len: 7.2, t: 0.3 },
  rear: [{ x: 2.65, y: 25.8, len: 3.8, d: 1.45 }],
};

const E145 = {
  L: 29.87, S: 20.04, W: 2.28,
  nose: { len: 4, a: 1.55, b: 1.85 }, tailLen: 9, tailEnd: 0.18,
  wing: { y: 12.4, cr: 4, ct: 1, sweep: 24, kink: 0, tip: 'none', tracks: 2 },
  ht: { y: 27.3, cr: 2, ct: 0.95, span: 7.55, sweep: 28, tTail: true },
  fin: { y: 23.6, len: 6, t: 0.26 },
  rear: [{ x: 2.2, y: 20.2, len: 3.5, d: 1.25 }],
};

const MD82 = {
  L: 45.06, S: 32.87, W: 3.34,
  nose: { len: 5.4, a: 1.6, b: 1.9 }, tailLen: 12.5, tailEnd: 0.2,
  wing: { y: 18.4, cr: 7.3, ct: 1.3, sweep: 27, kink: 0.25, teIn: 1, tip: 'none', tracks: 3 },
  ht: { y: 41.2, cr: 3.3, ct: 1.25, span: 12.24, sweep: 32, tTail: true },
  fin: { y: 36.2, len: 8.6, t: 0.32 },
  rear: [{ x: 3.15, y: 32, len: 5.8, d: 1.6 }],
};

const A333 = {
  L: 63.69, S: 60.3, W: 5.64,
  nose: { len: 6.4, a: 2.05, b: 2 }, tailLen: 16, tailEnd: 0.16,
  wing: { y: 23.2, cr: 11, ct: 2.4, sweep: 32, kink: 0.32, teIn: 1, tip: 'winglet', tipW: 1, tracks: 4 },
  ht: { y: 53, cr: 6.3, ct: 2, span: 19.45, sweep: 33 },
  fin: { y: 48.6, len: 14.3, t: 0.5 },
  fans: [{ x: 9.65, len: 6.2, d: 3.15, lead: 0.6 }],
};
const A339 = merge(A333, { S: 64, wing: { tip: 'sharklet', tipW: 1.6 }, fans: [{ x: 9.9, len: 6.6, d: 3.45, lead: 0.6 }] });
const A343 = merge(A333, {
  fans: [
    { x: 9.75, len: 4.9, d: 2.1, lead: 0.68 },
    { x: 18, len: 4.9, d: 2.1, lead: 0.68 },
  ],
});
const A346 = stretch(A343, 75.36, {
  S: 63.45,
  fans: [
    { x: 10.4, len: 6, d: 2.85, lead: 0.62 },
    { x: 19.4, len: 6, d: 2.85, lead: 0.62 },
  ],
});

const A359 = {
  L: 66.8, S: 64.75, W: 5.96,
  nose: { len: 6.7, a: 2.15, b: 2 }, tailLen: 16.5, tailEnd: 0.15,
  wing: { y: 24.4, cr: 11.8, ct: 2.1, sweep: 33, kink: 0.3, teIn: 1, tip: 'blended', tipW: 2.4, tracks: 4 },
  ht: { y: 56, cr: 6.1, ct: 2, span: 18.96, sweep: 34 },
  fin: { y: 51, len: 15, t: 0.5 },
  fans: [{ x: 10.35, len: 6.7, d: 3.5, lead: 0.58 }],
};

const B77W = {
  L: 73.86, S: 64.8, W: 6.19,
  nose: { len: 7.3, a: 1.8, b: 1.9 }, tailLen: 18, tailEnd: 0.15,
  wing: { y: 27.6, cr: 12.4, ct: 2.3, sweep: 34, kink: 0.32, teIn: 1, tip: 'raked', tipW: 3.6, tracks: 4 },
  ht: { y: 62.4, cr: 7, ct: 2.2, span: 21.51, sweep: 35 },
  fin: { y: 57.2, len: 16, t: 0.55 },
  fans: [{ x: 9.7, len: 7.4, d: 4.05, lead: 0.58 }],
};
const B772 = stretch(B77W, 63.73, { S: 60.93, wing: { tip: 'none' }, fans: [{ x: 9.6, len: 6.8, d: 3.6, lead: 0.6 }] });
const B778 = stretch(B77W, 69.8, { S: 71.75, wing: { tipW: 3.2 }, fans: [{ x: 10.2, len: 7.8, d: 4.4, lead: 0.58 }] });

const B789 = {
  L: 62.81, S: 60.12, W: 5.77,
  nose: { len: 7.2, a: 1.75, b: 1.75 }, tailLen: 15.8, tailEnd: 0.14,
  wing: { y: 23.6, cr: 10.8, ct: 1.6, sweep: 34, kink: 0.3, teIn: 1, tip: 'raked', tipW: 3.2, tracks: 4 },
  ht: { y: 52.6, cr: 5.8, ct: 1.8, span: 19.4, sweep: 35 },
  fin: { y: 48, len: 14, t: 0.5 },
  fans: [{ x: 9.45, len: 6.8, d: 3.65, lead: 0.6, chevrons: true }],
};

const B763 = {
  L: 54.94, S: 47.57, W: 5.03,
  nose: { len: 6, a: 1.8, b: 1.9 }, tailLen: 14, tailEnd: 0.15,
  wing: { y: 20.4, cr: 9.6, ct: 2, sweep: 34, kink: 0.3, teIn: 1, tip: 'none', tracks: 3 },
  ht: { y: 45.6, cr: 5.6, ct: 1.75, span: 18.62, sweep: 34 },
  fin: { y: 41.6, len: 12.6, t: 0.45 },
  fans: [{ x: 7.6, len: 5.6, d: 2.9, lead: 0.62 }],
};

const B744 = {
  L: 70.66, S: 64.44, W: 6.5,
  nose: { len: 8, a: 1.85, b: 2.05 }, tailLen: 15.5, tailEnd: 0.15,
  wing: { y: 25.6, cr: 14.4, ct: 4, sweep: 40, kink: 0.3, teIn: 1, tip: 'winglet', tipW: 1.3, tracks: 4 },
  ht: { y: 60.2, cr: 7.6, ct: 2.4, span: 22.17, sweep: 38 },
  fin: { y: 55.5, len: 14.5, t: 0.6 },
  fans: [
    { x: 11.9, len: 6, d: 2.95, lead: 0.62 },
    { x: 21.1, len: 6, d: 2.95, lead: 0.62 },
  ],
  deck: 24.5,
};
const B748 = stretch(B744, 76.25, {
  S: 68.4,
  wing: { tip: 'raked', tipW: 3 },
  fans: [
    { x: 12.6, len: 6.4, d: 3.25, lead: 0.6 },
    { x: 22.3, len: 6.4, d: 3.25, lead: 0.6 },
  ],
  deck: 31,
});
const B742 = merge(B744, { S: 59.64, wing: { tip: 'none' }, deck: 15 });

const A388 = {
  L: 72.72, S: 79.75, W: 7.14,
  nose: { len: 8.2, a: 2.2, b: 2 }, tailLen: 16.5, tailEnd: 0.15,
  wing: { y: 23.6, cr: 18, ct: 4, sweep: 36, kink: 0.28, teIn: 1, tip: 'fence', tipW: 0.55, tracks: 5 },
  ht: { y: 59.4, cr: 9.8, ct: 3, span: 30.37, sweep: 37 },
  fin: { y: 55, len: 17, t: 0.65 },
  fans: [
    { x: 14.8, len: 6.9, d: 3.6, lead: 0.56 },
    { x: 25.6, len: 6.9, d: 3.6, lead: 0.56 },
  ],
};

const K35R = {
  L: 41.53, S: 39.88, W: 3.76,
  nose: { len: 5, a: 1.6, b: 1.9 }, tailLen: 11.5, tailEnd: 0.16,
  wing: { y: 14.6, cr: 8.5, ct: 2, sweep: 37, kink: 0.28, teIn: 1, tip: 'none', tracks: 3 },
  ht: { y: 34, cr: 4.2, ct: 1.3, span: 13.95, sweep: 36 },
  fin: { y: 30.6, len: 10, t: 0.34 },
  fans: [
    { x: 7.2, len: 4.6, d: 2.1, lead: 0.7 },
    { x: 12.9, len: 4.6, d: 2.1, lead: 0.7 },
  ],
  military: true,
};

const C17 = {
  L: 53.04, S: 51.75, W: 6.85,
  nose: { len: 5.6, a: 2, b: 2 }, tailLen: 13, tailEnd: 0.22,
  wing: { y: 20, cr: 9.6, ct: 3, sweep: 29, kink: 0, tip: 'winglet', tipW: 1, tracks: 4 },
  ht: { y: 47.6, cr: 5.6, ct: 2.4, span: 19.81, sweep: 32, tTail: true },
  fin: { y: 42.5, len: 10, t: 0.55 },
  fans: [
    { x: 8.6, len: 5.5, d: 2.65, lead: 0.68 },
    { x: 15.4, len: 5.5, d: 2.65, lead: 0.68 },
  ],
  fairing: { y: 18.5, len: 15, w: 1.22 },
  military: true,
};

// ── Propeller aircraft ───────────────────────────────────────────────────

const C130 = {
  L: 29.79, S: 40.41, W: 4.3,
  nose: { len: 3.1, a: 2.3, b: 2 }, tailLen: 10, tailEnd: 0.24,
  wing: { y: 10.8, cr: 4.9, ct: 2.7, sweep: 3, kink: 0.22, teIn: 0, tip: 'none' },
  ht: { y: 25.6, cr: 3.6, ct: 1.8, span: 16.05, sweep: 7 },
  fin: { y: 22, len: 7.6, t: 0.45 },
  props: [
    { x: 5, d: 4.11, blades: 6, front: 7, len: 7.2, w: 1.25 },
    { x: 9.7, d: 4.11, blades: 6, front: 7.4, len: 6.9, w: 1.25 },
  ],
  fairing: { y: 10.5, len: 7.5, w: 1.25 },
  military: true,
};

const A400 = {
  L: 45.1, S: 42.4, W: 5.64,
  nose: { len: 4.8, a: 2.2, b: 2 }, tailLen: 13.5, tailEnd: 0.22,
  wing: { y: 16.6, cr: 6.6, ct: 2.8, sweep: 15, kink: 0.2, teIn: 0, tip: 'none' },
  ht: { y: 38.6, cr: 4.4, ct: 2, span: 19.5, sweep: 30, tTail: true },
  fin: { y: 33.5, len: 10, t: 0.5 },
  props: [
    { x: 7.1, d: 5.33, blades: 8, front: 12.5, len: 8, w: 1.5 },
    { x: 13.2, d: 5.33, blades: 8, front: 14.2, len: 7.6, w: 1.5 },
  ],
  fairing: { y: 16, len: 11, w: 1.2 },
  military: true,
};

const AT76 = {
  L: 27.17, S: 27.05, W: 2.57,
  nose: { len: 3.3, a: 1.85, b: 1.95 }, tailLen: 8.2, tailEnd: 0.2,
  wing: { y: 10.9, cr: 2.6, ct: 1.45, sweep: 2, kink: 0.36, teIn: 0, tip: 'none' },
  ht: { y: 24.1, cr: 1.85, ct: 1, span: 7.31, sweep: 12, tTail: true },
  fin: { y: 19.4, len: 6.6, t: 0.3 },
  props: [{ x: 4.1, d: 3.93, blades: 6, front: 7.1, len: 7.3, w: 1 }],
  fairing: { y: 10.2, len: 7.2, w: 1.3 },
};

const DH8D = {
  L: 32.83, S: 28.42, W: 2.69,
  nose: { len: 3.9, a: 1.6, b: 1.9 }, tailLen: 9.2, tailEnd: 0.18,
  wing: { y: 13.2, cr: 2.95, ct: 1.3, sweep: 2, kink: 0.42, teIn: 0, tip: 'none' },
  ht: { y: 29.6, cr: 2, ct: 1.2, span: 8.79, sweep: 25, tTail: true },
  fin: { y: 24.2, len: 7.6, t: 0.32 },
  props: [{ x: 4.27, d: 4.11, blades: 6, front: 9, len: 9, w: 1.15 }],
};

const SF34 = {
  L: 19.73, S: 21.44, W: 2.31,
  nose: { len: 2.9, a: 1.8, b: 1.9 }, tailLen: 7, tailEnd: 0.18,
  wing: { y: 7.7, cr: 2.6, ct: 1, sweep: 3, kink: 0.3, teIn: 0, tip: 'none' },
  ht: { y: 16.6, cr: 1.85, ct: 0.95, span: 9, sweep: 14 },
  fin: { y: 14, len: 5.6, t: 0.28 },
  props: [{ x: 3.85, d: 3.35, blades: 4, front: 5, len: 5.6, w: 0.9 }],
};

const B190 = {
  L: 17.63, S: 17.67, W: 1.6,
  nose: { len: 2.7, a: 1.7, b: 1.9 }, tailLen: 6.2, tailEnd: 0.2,
  wing: { y: 6.6, cr: 2.2, ct: 1, sweep: 3, kink: 0.25, teIn: 0, tip: 'none' },
  ht: { y: 15.2, cr: 1.45, ct: 0.8, span: 7, sweep: 22, tTail: true },
  fin: { y: 12.6, len: 4.8, t: 0.24 },
  props: [{ x: 2.95, d: 2.79, blades: 4, front: 4.4, len: 4.8, w: 0.78 }],
};

const B350 = {
  L: 14.22, S: 17.65, W: 1.4,
  nose: { len: 2.4, a: 1.8, b: 1.9 }, tailLen: 5, tailEnd: 0.2,
  wing: { y: 5.5, cr: 2.15, ct: 0.95, sweep: 2, kink: 0.25, teIn: 0, tip: 'winglet', tipW: 0.3 },
  ht: { y: 12.4, cr: 1.3, ct: 0.75, span: 5.6, sweep: 22, tTail: true },
  fin: { y: 10.2, len: 4, t: 0.2 },
  props: [{ x: 2.6, d: 2.67, blades: 4, front: 3.4, len: 4.2, w: 0.7 }],
};

const BE58 = {
  L: 9.09, S: 11.53, W: 1.25,
  nose: { len: 1.7, a: 2, b: 2 }, tailLen: 4, tailEnd: 0.18,
  wing: { y: 3.3, cr: 1.9, ct: 1, sweep: 2, kink: 0.3, teIn: 0, tip: 'none' },
  ht: { y: 7.8, cr: 1, ct: 0.65, span: 4.85, sweep: 8 },
  fin: { y: 6.9, len: 2.2, t: 0.14 },
  props: [{ x: 2, d: 1.98, blades: 3, front: 2, len: 3, w: 0.6 }],
};

const PC12 = {
  L: 14.4, S: 16.28, W: 1.6,
  nose: { len: 2.7, a: 2, b: 2 }, tailLen: 5.6, tailEnd: 0.2,
  wing: { y: 5.4, cr: 2.35, ct: 1.15, sweep: 2, kink: 0.15, teIn: 0, tip: 'winglet', tipW: 0.3 },
  ht: { y: 12.75, cr: 1.35, ct: 0.8, span: 5.2, sweep: 20, tTail: true },
  fin: { y: 10.6, len: 3.9, t: 0.24 },
  noseProp: { d: 2.67, blades: 5 },
};

const C208 = {
  L: 11.46, S: 15.88, W: 1.62,
  nose: { len: 1.9, a: 2.3, b: 2 }, tailLen: 4.6, tailEnd: 0.18,
  wing: { y: 3.6, cr: 1.98, ct: 1.25, sweep: 0, kink: 0.32, teIn: 0, tip: 'none' },
  ht: { y: 9.65, cr: 1.3, ct: 0.9, span: 6.25, sweep: 6 },
  fin: { y: 8.3, len: 3.1, t: 0.2 },
  noseProp: { d: 2.69, blades: 3 },
};

const TBM9 = {
  L: 10.74, S: 12.83, W: 1.3,
  nose: { len: 2.2, a: 2, b: 2 }, tailLen: 4.2, tailEnd: 0.18,
  wing: { y: 3.6, cr: 1.95, ct: 0.9, sweep: 3, kink: 0.2, teIn: 0, tip: 'winglet', tipW: 0.25 },
  ht: { y: 9, cr: 1.05, ct: 0.6, span: 4.6, sweep: 15 },
  fin: { y: 8, len: 2.7, t: 0.16 },
  noseProp: { d: 2.31, blades: 5 },
};

const C172 = {
  L: 8.28, S: 11, W: 1.12,
  nose: { len: 1.4, a: 2.4, b: 2 }, tailLen: 3.9, tailEnd: 0.18,
  wing: { y: 2.25, cr: 1.63, ct: 1.13, sweep: 0, kink: 0.45, teIn: 0, tip: 'none' },
  ht: { y: 6.75, cr: 1.2, ct: 0.75, span: 3.45, sweep: 6 },
  fin: { y: 6.2, len: 2, t: 0.12 },
  noseProp: { d: 1.93, blades: 2 },
  light: true,
};

const SR22 = {
  L: 7.92, S: 11.68, W: 1.27,
  nose: { len: 1.5, a: 2.2, b: 2 }, tailLen: 3.6, tailEnd: 0.18,
  wing: { y: 2.6, cr: 1.55, ct: 0.85, sweep: 1, kink: 0, teIn: 0, tip: 'none' },
  ht: { y: 6.55, cr: 0.95, ct: 0.6, span: 3.96, sweep: 6 },
  fin: { y: 5.9, len: 1.9, t: 0.12 },
  noseProp: { d: 1.98, blades: 3 },
  light: true,
};

const P28A = merge(C172, {
  L: 7.25, S: 10.67, W: 1.1,
  wing: { y: 2.35, cr: 1.6, ct: 1.6, kink: 0, sweep: 0 },
  ht: { y: 6.1, cr: 0.8, ct: 0.8, span: 3.92, sweep: 0 },
  fin: { y: 5.5, len: 1.7, t: 0.12 },
  tailLen: 3.4,
  noseProp: { d: 1.88, blades: 2 },
});

const DA42 = merge(SR22, {
  L: 8.56, S: 13.42, W: 1.15,
  wing: { y: 2.9, cr: 1.5, ct: 0.8, sweep: 1, kink: 0, tip: 'winglet', tipW: 0.2 },
  ht: { y: 7.4, cr: 0.75, ct: 0.55, span: 3, sweep: 10, tTail: true },
  fin: { y: 6.6, len: 1.9, t: 0.12 },
  noseProp: null,
  props: [{ x: 1.65, d: 1.9, blades: 3, front: 1.7, len: 2.6, w: 0.55 }],
});

// ── Business jets (proportions derived from length, span and wing sweep) ─

function bizjet(L, S, sweep, extra) {
  const W = Math.min(2.8, Math.max(1.55, L * 0.087));
  const d = Math.max(0.95, L * 0.052);
  const base = {
    L, S, W,
    nose: { len: L * 0.15, a: 1.55, b: 1.85 }, tailLen: L * 0.3, tailEnd: 0.2,
    wing: { y: L * 0.395, cr: L * 0.19, ct: L * 0.045, sweep, kink: 0.25, teIn: 1, tip: 'winglet', tipW: S * 0.022, tracks: 0 },
    ht: { y: L * 0.84, cr: L * 0.085, ct: L * 0.04, span: S * 0.34, sweep: sweep + 4, tTail: true },
    fin: { y: L * 0.71, len: L * 0.26, t: W * 0.12 },
    rear: [{ x: W / 2 + d * 0.62 + 0.25, y: L * 0.665, len: L * 0.135, d }],
    biz: true,
  };
  return merge(base, extra);
}
function trijet(L, S, sweep) {
  const m = bizjet(L, S, sweep, { ht: { tTail: false, y: L * 0.86 } });
  m.center = { y: L * 0.64, len: L * 0.14, d: m.rear[0].d };
  return m;
}

// ── Helicopters, fighters and others ─────────────────────────────────────

const heli = (R, Lf, Wc, blades, opts = {}) => ({ kind: 'heli', R, Lf, Wc, blades, tail: 'rotor', skids: false, ...opts });
const fighter = (L, S, W, opts) => ({ kind: 'fighter', L, S, W, sweep: 40, ...opts, military: true });

const GLIDER = {
  kind: 'glider',
  L: 7, S: 18, W: 0.66,
  nose: { len: 1.1, a: 2.2, b: 2 }, tailLen: 4.2, tailEnd: 0.18,
  wing: { y: 2.4, cr: 0.95, ct: 0.36, sweep: 1, kink: 0.35, teIn: 0, tip: 'none' },
  ht: { y: 6.3, cr: 0.55, ct: 0.32, span: 2.6, sweep: 6, tTail: true },
  fin: { y: 5.6, len: 1.4, t: 0.08 },
};

// ── The catalogue ────────────────────────────────────────────────────────

export const MODELS = {
  a318: stretch(A320, 31.44, { fans: [{ x: 5.75, len: 4.4, d: 2.15, lead: 0.62 }] }),
  a319: stretch(A320, 33.84),
  a320: A320,
  a321: stretch(A320, 44.51),
  a19n: stretch(merge(A320, NEO), 33.84),
  a20n: merge(A320, NEO),
  a21n: stretch(merge(A320, NEO), 44.51),
  b736: stretch(B738, 31.24),
  b737: stretch(B738, 33.63),
  b738: B738,
  b739: stretch(B738, 42.11),
  b733: B733,
  b734: stretch(B733, 36.45),
  b735: stretch(B733, 31),
  b37m: stretch(merge(B738, MAX), 35.56),
  b38m: merge(B738, MAX),
  b39m: stretch(merge(B738, MAX), 42.16),
  b3xm: stretch(merge(B738, MAX), 43.8),
  b752: B752,
  b753: stretch(B752, 54.43),
  bcs1: stretch(BCS3, 35),
  bcs3: BCS3,
  e170: stretch(E190, 29.9, { S: 26 }),
  e175: stretch(E190, 31.68, { S: 26 }),
  e190: E190,
  e195: stretch(E190, 38.65),
  e290: E290,
  e295: stretch(E290, 41.5, { S: 35.12 }),
  crj2: stretch(CRJ9, 26.77, { S: 21.21, wing: { tip: 'none' } }),
  crj7: stretch(CRJ9, 32.3, { S: 23.24 }),
  crj9: CRJ9,
  crjx: stretch(CRJ9, 39.1, { S: 26.18 }),
  e135: stretch(E145, 26.33),
  e145: E145,
  md82: MD82,
  md87: stretch(MD82, 39.75),
  md90: stretch(MD82, 46.5, { rear: [{ x: 3.3, y: 33.4, len: 5.9, d: 1.9 }] }),
  b712: stretch(MD82, 37.81, { S: 28.45, rear: [{ x: 3.1, y: 26.8, len: 4.6, d: 1.75 }] }),
  dc9: stretch(MD82, 36.4, { S: 28.47 }),
  a332: stretch(A333, 58.82),
  a333: A333,
  a338: stretch(A339, 58.82),
  a339: A339,
  a343: A343,
  a346: A346,
  a359: A359,
  a35k: stretch(A359, 73.79),
  b772: B772,
  b77l: stretch(B77W, 63.73),
  b77w: B77W,
  b778: B778,
  b779: stretch(B778, 76.72),
  b788: stretch(B789, 56.72),
  b789: B789,
  b78x: stretch(B789, 68.28),
  b762: stretch(B763, 48.51),
  b763: B763,
  b764: stretch(B763, 61.37, { S: 51.92, wing: { tip: 'raked', tipW: 2.2 } }),
  b742: B742,
  b744: B744,
  b748: B748,
  a388: A388,
  k35r: K35R,
  e3: stretch(K35R, 46.61, { rotodome: { y: 30.5, d: 9.14 } }),
  c17: C17,
  c130: C130,
  a400: A400,
  at76: AT76,
  at45: stretch(AT76, 22.67, { S: 24.57 }),
  dh8d: DH8D,
  dh8c: stretch(DH8D, 25.68, { S: 27.43, props: [{ x: 3.95, d: 3.96, blades: 4, front: 5.9, len: 7.4, w: 1.05 }] }),
  dh8a: stretch(DH8D, 22.25, { S: 25.89, props: [{ x: 3.85, d: 3.96, blades: 4, front: 4.3, len: 7.2, w: 1.05 }] }),
  sf34: SF34,
  sb20: stretch(SF34, 27.28, { S: 24.76, props: [{ x: 4.4, d: 3.81, blades: 6, front: 8.4, len: 6.4, w: 1 }] }),
  b190: B190,
  b350: B350,
  be20: stretch(B350, 13.34, { S: 16.61, props: [{ x: 2.5, d: 2.5, blades: 3, front: 3, len: 4, w: 0.66 }] }),
  be58: BE58,
  pc12: PC12,
  c208: C208,
  tbm9: TBM9,
  c172: C172,
  c182: stretch(C172, 8.84, { S: 10.97, noseProp: { d: 2.08, blades: 3 } }),
  c152: stretch(C172, 7.34, { S: 10.11, noseProp: { d: 1.75, blades: 2 } }),
  sr22: SR22,
  p28a: P28A,
  da40: merge(SR22, { L: 8.06, S: 11.94, ht: { y: 7.15, cr: 0.75, ct: 0.55, span: 3, sweep: 10, tTail: true } }),
  da42: DA42,
  glf6: bizjet(30.41, 30.36, 36),
  glf5: bizjet(29.39, 28.5, 30),
  glf4: bizjet(26.92, 23.72, 28),
  gl7t: bizjet(33.8, 31.7, 35),
  glex: bizjet(30.3, 28.65, 35),
  cl35: bizjet(20.92, 21, 27),
  cl60: bizjet(20.85, 19.61, 25),
  c68a: bizjet(18.97, 22.05, 16),
  c700: bizjet(22.3, 20.6, 28),
  c750: bizjet(22.04, 19.48, 37),
  c56x: bizjet(15.79, 17.17, 6, { ht: { tTail: false } }),
  c25a: bizjet(14.5, 15.5, 4, { wing: { tip: 'none' } }),
  c510: bizjet(12.37, 13.16, 3, { wing: { tip: 'none' } }),
  e55p: bizjet(15.9, 16.2, 26),
  e50p: bizjet(12.82, 12.3, 10),
  pc24: bizjet(16.85, 17, 10),
  lj45: bizjet(17.68, 14.58, 13),
  h25b: bizjet(15.6, 15.66, 20, { ht: { tTail: false } }),
  f2th: bizjet(20.23, 19.33, 24, { ht: { tTail: false, y: 20.23 * 0.86 } }),
  fa7x: trijet(23.19, 26.21, 30),
  f900: trijet(20.21, 19.33, 24),
  hdjt: bizjet(12.99, 12.12, 5, { rear: [], otw: [{ x: 2.3, y: 4.6, len: 2.6, d: 0.78 }], wing: { tip: 'none' } }),
  h145: heli(5.5, 11.6, 1.75, 4, { tail: 'fenestron', skids: true }),
  h135: heli(5.1, 10.2, 1.55, 4, { tail: 'fenestron', skids: true }),
  h130: heli(5.35, 10.68, 1.85, 3, { tail: 'fenestron', skids: true }),
  h125: heli(5.35, 10.93, 1.8, 3, { skids: true }),
  h160: heli(6.6, 13, 2, 5, { tail: 'fenestron' }),
  a139: heli(6.9, 13.8, 2.2, 5),
  a109: heli(5.5, 11.45, 1.6, 4),
  b06: heli(5.08, 9.5, 1.3, 2, { skids: true }),
  b407: heli(5.33, 10.6, 1.5, 4, { skids: true }),
  b412: heli(7, 13, 2.6, 4, { skids: true }),
  r44: heli(5.03, 8.96, 1.28, 2, { skids: true }),
  r22: heli(3.84, 6.3, 1.12, 2, { skids: true }),
  s76: heli(6.7, 13.2, 2.1, 4),
  s92: heli(8.58, 17.1, 2.9, 4),
  h60: heli(8.18, 15.26, 2.4, 4, { military: true }),
  mi8: heli(10.65, 18.4, 2.5, 5, { military: true }),
  ch47: heli(9.15, 15.9, 3.8, 3, { tandem: true, military: true }),
  f16: fighter(15.06, 9.96, 1.25, { sweep: 40 }),
  f35: fighter(15.67, 10.7, 1.7, { sweep: 33, twin: true }),
  f18: fighter(17.07, 13.62, 1.6, { sweep: 28, twin: true }),
  f15: fighter(19.43, 13.05, 1.9, { sweep: 45, twin: true }),
  eufi: fighter(15.96, 10.95, 1.3, { delta: true, sweep: 53, canard: true }),
  rfal: fighter(15.27, 10.8, 1.25, { delta: true, sweep: 48, canard: true }),
  glider: GLIDER,
  balloon: { kind: 'balloon', D: 17 },
  ground: { kind: 'ground', L: 5.6, W: 2.3 },
};

// ICAO type designator → model.
const TYPES = {
  a318: 'A318', a319: 'A319', a320: 'A320', a321: 'A321', a19n: 'A19N', a20n: 'A20N', a21n: 'A21N',
  b736: 'B736', b737: 'B737', b738: 'B738 B38F', b739: 'B739', b733: 'B733 B732', b734: 'B734', b735: 'B735',
  b37m: 'B37M', b38m: 'B38M', b39m: 'B39M', b3xm: 'B3XM', b752: 'B752', b753: 'B753',
  bcs1: 'BCS1', bcs3: 'BCS3', e170: 'E170', e175: 'E175', e190: 'E190', e195: 'E195', e290: 'E290', e295: 'E295',
  crj2: 'CRJ1 CRJ2', crj7: 'CRJ7', crj9: 'CRJ9', crjx: 'CRJX', e135: 'E135 E35L', e145: 'E145 E45X',
  md82: 'MD81 MD82 MD83 MD88', md87: 'MD87', md90: 'MD90', b712: 'B712', dc9: 'DC91 DC92 DC93 DC94 DC95 DC9',
  a332: 'A332 A330 MRTT', a333: 'A333', a338: 'A338', a339: 'A339', a343: 'A342 A343', a346: 'A345 A346',
  a359: 'A359', a35k: 'A35K', b772: 'B772 B773', b77l: 'B77L', b77w: 'B77W', b778: 'B778', b779: 'B779',
  b788: 'B788', b789: 'B789', b78x: 'B78X', b762: 'B762', b763: 'B763 KC46', b764: 'B764',
  b742: 'B741 B742 B743 B74S B74R', b744: 'B744 BLCF VC25', b748: 'B748', a388: 'A388',
  k35r: 'K35R K35E B703 B701 C135 E6 KC35', e3: 'E3CF E3TF', c17: 'C17', c130: 'C130 C30J L100 P3', a400: 'A400',
  at76: 'AT72 AT73 AT75 AT76', at45: 'AT43 AT44 AT45 AT46', dh8d: 'DH8D', dh8c: 'DH8C', dh8a: 'DH8A DH8B',
  sf34: 'SF34 JS41 E120 D328 F50 F27', sb20: 'SB20 J328', b190: 'B190 JS31 JS32 SW4 C212', b350: 'B350 BE30',
  be20: 'BE20 BE9L BE99 P180 L410 DHC6', be58: 'BE58 BE55 BE76 PA34 PA44 PA31 PA23 C310 C340 C414 C421 DA62',
  pc12: 'PC12 PC21 C27J', c208: 'C208 PC6', tbm9: 'TBM7 TBM8 TBM9 P46T PA46 M600',
  c172: 'C172 C170 C175 C177 C150 C162', c182: 'C182 C180 C185 C206 C207 C210 PA32 P32R', c152: 'C152 EV97 ULAC',
  sr22: 'SR22 SR20 S22T BE33 BE35 BE36 M20P M20T TB20 TOBA', p28a: 'P28A P28B P28R P28T PA28 PA18 PA22 PA24', da40: 'DA40 DA20 DA50', da42: 'DA42',
  glf6: 'GLF6 GA6C', glf5: 'GLF5 GA5C', glf4: 'GLF4 GLF3 GLF2', gl7t: 'GL7T', glex: 'GLEX GL5T GL6T',
  cl35: 'CL30 CL35 G280', cl60: 'CL60 CL64 CRJ', c68a: 'C68A C680', c700: 'C700', c750: 'C750',
  c56x: 'C56X C560 C550 C551 C55B C650', c25a: 'C25A C25B C25C C25M C525 C526 C500 C501', c510: 'C510 SF50',
  e55p: 'E55P E545 E550', e50p: 'E50P', pc24: 'PC24', lj45: 'LJ40 LJ45 LJ60 LJ75 LJ35 LJ31 LJ55',
  h25b: 'H25B H25C HA4T BE40 PRM1 ASTR WW24 G150', f2th: 'F2TH FA10 FA20', fa7x: 'FA7X FA8X', f900: 'F900 FA50',
  hdjt: 'HDJT',
  h145: 'H145 EC45 BK17', h135: 'H135 EC35', h130: 'H130 EC30 EC20', h125: 'H125 AS50 AS55 AS35 EC25 AS65 AS32 H215 H225',
  h160: 'H160 EC55 H155 EC75 H175', a139: 'A139 A149 A169 A189 AW09', a109: 'A109 A119', b06: 'B06 B206 B505 H500',
  b407: 'B407 B427 B429 B430', b412: 'B412 B212 UH1 B222 B230', r44: 'R44 R66', r22: 'R22', s76: 'S76', s92: 'S92 S61 NH90 EH10',
  h60: 'H60 UH60 S70 MH60 HH60', mi8: 'MI8 MI17 MI24', ch47: 'CH47 H47',
  f16: 'F16 HAWK T38 M2000 GRIF A10 MIG29 L159 T6', f35: 'F35 F22', f18: 'F18 FA18', f15: 'F15 F14 SU27 SU30 SU35',
  eufi: 'EUFI TYPH', rfal: 'RFAL',
};
const BY_TYPE = new Map();
for (const [id, list] of Object.entries(TYPES)) for (const t of list.split(' ')) BY_TYPE.set(t, id);

/** The model to draw for an aircraft: from its type designator, else its ADS-B category. */
export function modelIdFor(ac) {
  const t = (ac.type || '').toUpperCase();
  if (BY_TYPE.has(t)) return BY_TYPE.get(t);
  switch (ac.category) {
    case 'A1':
    case 'B4':
    case 'B6':
      return 'c172';
    case 'A2':
      return 'cl35';
    case 'A4':
      return 'b752';
    case 'A5':
      return 'b789';
    case 'A6':
      return 'f16';
    case 'A7':
      return 'h145';
    case 'B1':
      return 'glider';
    case 'B2':
      return 'balloon';
    case 'C1':
    case 'C2':
    case 'C3':
      return 'ground';
    default:
      return 'a320';
  }
}
