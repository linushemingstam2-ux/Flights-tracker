// Airline logos beside the aircraft on the map. The callsign's three-letter ICAO prefix ("BAW" in
// BAW283) picks the logo, drawn as a small white badge with rounded corners, like an app icon.

import { LOGO_CODES } from './airline-logo-codes.js';

/** The airline's ICAO code from a callsign such as "BAW283" or "DLH4CK", when it has a logo. */
export function airlineCode(callsign) {
  const m = /^([A-Z]{3})\d/.exec(callsign || '');
  return m && LOGO_CODES.has(m[1]) ? m[1] : null;
}

/** Room around a badge for its shadow, in CSS px. */
export const BADGE_PAD = 3;

const images = new Map(); // code → loading or loaded <img>, or 'failed'
const badges = new Map(); // `${code}|${size}|${dpr}` → canvas
let onReady = () => {};

/** Called whenever a logo has loaded, so the map can draw it. */
export function onLogoReady(fn) {
  onReady = fn;
}

function logoImage(code) {
  const img = images.get(code);
  if (img === 'failed') return null;
  if (img) return img.complete && img.naturalWidth ? img : null;
  const next = new Image();
  next.decoding = 'async';
  next.onload = () => onReady();
  next.onerror = () => images.set(code, 'failed');
  next.src = `logos/${code}.png`;
  images.set(code, next);
  return null;
}

function roundedRect(x, y, w, h, r) {
  const p = new Path2D();
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
  return p;
}

/** The airline's badge, `size` CSS px square plus BADGE_PAD all round, or null while it loads. */
export function logoBadge(code, size, dpr) {
  const key = `${code}|${size}|${dpr}`;
  const cached = badges.get(key);
  if (cached) return cached;
  const img = logoImage(code);
  if (!img) return null;
  const full = size + BADGE_PAD * 2;
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(full * dpr);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const shape = roundedRect(BADGE_PAD, BADGE_PAD, size, size, size * 0.27);
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 3 * dpr;
  ctx.shadowOffsetY = 1 * dpr;
  ctx.fillStyle = '#ffffff';
  ctx.fill(shape);
  ctx.restore();
  ctx.save();
  ctx.clip(shape);
  const inset = size * 0.1;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, BADGE_PAD + inset, BADGE_PAD + inset, size - inset * 2, size - inset * 2);
  ctx.restore();
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.stroke(shape);
  badges.set(key, c);
  return c;
}
