// Display formatting for aircraft values, in aviation (ft/kt) or metric units.

import { NM_TO_KM } from './shared/geo.js';

const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

export function formatAlt(ac, metric) {
  if (ac.onGround) return 'On ground';
  if (ac.alt == null) return '—';
  return metric ? `${nf0.format(ac.alt * 0.3048)} m` : `${nf0.format(ac.alt)} ft`;
}

/** Compact altitude for map labels, e.g. "FL350" or "4,500". */
export function shortAlt(ac, metric) {
  if (ac.onGround) return 'GND';
  if (ac.alt == null) return '';
  if (metric) return `${nf0.format(ac.alt * 0.3048)}m`;
  return ac.alt >= 18000 ? `FL${String(Math.round(ac.alt / 100)).padStart(3, '0')}` : nf0.format(ac.alt);
}

export function formatSpeed(kt, metric) {
  if (kt == null) return '—';
  return metric ? `${nf0.format(kt * NM_TO_KM)} km/h` : `${nf0.format(kt)} kt`;
}

export function formatVRate(fpm, metric) {
  if (fpm == null) return '—';
  const arrow = fpm > 250 ? '↑ ' : fpm < -250 ? '↓ ' : '';
  return metric
    ? `${arrow}${nf0.format(fpm * 0.00508)} m/s`
    : `${arrow}${nf0.format(fpm)} ft/min`;
}

export function formatTrack(deg) {
  if (deg == null) return '—';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return `${Math.round(deg) % 360}° ${dirs[Math.round(deg / 45) % 8]}`;
}

export function formatDistance(nm, metric) {
  if (nm == null || !Number.isFinite(nm)) return '—';
  return metric ? `${nf0.format(nm * NM_TO_KM)} km` : `${nf0.format(nm)} nm`;
}

export function formatCoord(lat, lon) {
  const f = (v, pos, neg) => `${Math.abs(v).toFixed(4)}°${v >= 0 ? pos : neg}`;
  return `${f(lat, 'N', 'S')} ${f(lon, 'E', 'W')}`;
}

export function formatAgo(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 2) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

export const EMERGENCY_SQUAWKS = { 7500: 'Hijack', 7600: 'Radio failure', 7700: 'Emergency' };

export function isEmergency(ac) {
  return Boolean(ac.emergency) || ac.squawk in EMERGENCY_SQUAWKS;
}
