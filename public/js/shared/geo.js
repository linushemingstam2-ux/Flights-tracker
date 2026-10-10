// Small spherical-geometry helpers. Shared by the browser and the Node server.

export const EARTH_RADIUS_NM = 3440.065;
export const FT_PER_M = 3.28084;
export const KT_PER_MS = 1.943844;
export const FPM_PER_MS = 196.850394;

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

export function normalizeLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/** Great-circle distance in nautical miles. */
export function distanceNm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing from point 1 to point 2, degrees clockwise from north. */
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dl = toRad(lon2 - lon1);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Point reached after travelling `distNm` from (lat, lon) on `bearing`. */
export function destinationPoint(lat, lon, bearing, distNm) {
  const d = distNm / EARTH_RADIUS_NM;
  const b = toRad(bearing);
  const p1 = toRad(lat);
  const l1 = toRad(lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 =
    l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [toDeg(p2), normalizeLon(toDeg(l2))];
}

/** Points along the great circle between two coordinates (inclusive). */
export function greatCirclePoints(lat1, lon1, lat2, lon2, segments = 64) {
  const p1 = toRad(lat1);
  const l1 = toRad(lon1);
  const p2 = toRad(lat2);
  const l2 = toRad(lon2);
  const d = distanceNm(lat1, lon1, lat2, lon2) / EARTH_RADIUS_NM;
  if (d < 1e-9) return [[lat1, lon1], [lat2, lon2]];
  const out = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    out.push([toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), toDeg(Math.atan2(y, x))]);
  }
  // Keep longitudes continuous so polylines don't streak across the map at the antimeridian.
  for (let i = 1; i < out.length; i++) {
    while (out[i][1] - out[i - 1][1] > 180) out[i][1] -= 360;
    while (out[i][1] - out[i - 1][1] < -180) out[i][1] += 360;
  }
  return out;
}

/** Lat/lon bounding box of a circle, clamped to valid coordinates. */
export function circleBounds(lat, lon, radiusNm) {
  const dLat = radiusNm / 60;
  const cosLat = Math.max(0.01, Math.cos(toRad(lat)));
  const dLon = Math.min(180, radiusNm / (60 * cosLat));
  return {
    south: clamp(lat - dLat, -90, 90),
    north: clamp(lat + dLat, -90, 90),
    west: clamp(lon - dLon, -180, 180),
    east: clamp(lon + dLon, -180, 180),
  };
}
