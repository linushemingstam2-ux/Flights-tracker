// A Leaflet layer that draws every aircraft (plus trails and the selected flight's route)
// onto one canvas, redrawn each animation frame.

import {
  sprite,
  shadowSprite,
  rotorFor,
  rotorSprite,
  SHADOW_PAD,
  shapeFor,
  shapeScale,
  altitudeColor,
  CLASSIC_FILL,
  SELECTED_FILL,
  EMERGENCY_FILL,
  GROUND_FILL,
} from './icons.js?v=13';
import { destinationPoint, greatCirclePoints } from './shared/geo.js';
import { isEmergency } from './format.js';

const L = window.L;

// Colours for what is drawn over the map, to suit the dark or light appearance.
const INK = {
  dark: {
    lensTop: 'rgba(255, 255, 255, 0.05)',
    lensEdge: 'rgba(255, 255, 255, 0.22)',
    route: 'rgba(255, 255, 255, 0.55)',
    dot: '#0d1520',
    dotEdge: '#ffffff',
    text: '#ffffff',
    halo: 'rgba(8, 12, 18, 0.9)',
    coverage: 'rgba(255, 199, 44, 0.45)',
  },
  light: {
    lensTop: 'rgba(255, 255, 255, 0.3)',
    lensEdge: 'rgba(255, 255, 255, 0.6)',
    route: 'rgba(15, 23, 42, 0.5)',
    dot: '#ffffff',
    dotEdge: '#0f172a',
    text: '#0f172a',
    halo: 'rgba(255, 255, 255, 0.95)',
    coverage: 'rgba(190, 132, 0, 0.6)',
  },
};

export const AircraftLayer = L.Layer.extend({
  initialize(store, getOptions) {
    this.store = store;
    this.getOptions = getOptions; // () => { ink, allTrails, filter, route, coverage }
    this._hits = [];
    this._frame = this._frame.bind(this);
    this._selScale = 1.15;
  },

  onAdd(map) {
    const pane = map.getPane('aircraft') || map.createPane('aircraft');
    pane.style.zIndex = 450;
    pane.style.pointerEvents = 'none';
    this._canvas = L.DomUtil.create('canvas', 'aircraft-canvas leaflet-zoom-animated', pane);
    this._ctx = this._canvas.getContext('2d');
    this._animating = false;
    map.on('zoomanim', this._onZoomAnim, this);
    map.on('zoomend', this._onZoomEnd, this);
    this._raf = requestAnimationFrame(this._frame);
  },

  onRemove(map) {
    cancelAnimationFrame(this._raf);
    map.off('zoomanim', this._onZoomAnim, this);
    map.off('zoomend', this._onZoomEnd, this);
    L.DomUtil.remove(this._canvas);
    this._canvas = null;
  },

  // Scale the existing frame with the map's zoom animation, as Leaflet's own renderers do.
  _onZoomAnim(e) {
    if (!this._center) return;
    this._animating = true;
    const map = this._map;
    const scale = map.getZoomScale(e.zoom, this._zoom);
    const offset = map
      .getSize()
      .multiplyBy(-0.5 * scale)
      .add(map.project(this._center, e.zoom))
      .subtract(map._getNewPixelOrigin(e.center, e.zoom));
    L.DomUtil.setTransform(this._canvas, offset, scale);
  },

  _onZoomEnd() {
    this._animating = false;
  },

  _frame() {
    this._raf = requestAnimationFrame(this._frame);
    if (!this._map || this._animating) return;
    this.draw(Date.now());
  },

  /** The aircraft drawn nearest to a container point, within `radius` px. */
  hitTest(point, radius = 15) {
    let best = null;
    let bestD = radius * radius;
    for (const h of this._hits) {
      const d = (h.x - point.x) ** 2 + (h.y - point.y) ** 2;
      if (d <= bestD) {
        bestD = d;
        best = h.ac;
      }
    }
    return best;
  },

  /** Current on-screen position of an aircraft, if drawn. */
  screenPosition(hex) {
    return this._hits.find((h) => h.ac.hex === hex) || null;
  },

  draw(t) {
    const map = this._map;
    const canvas = this._canvas;
    const ctx = this._ctx;
    const size = map.getSize();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(size.x * dpr);
    const h = Math.round(size.y * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
    }
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
    this._center = map.getCenter();
    this._zoom = map.getZoom();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const o = this.getOptions();
    this._ink = INK[o.ink] || INK.dark;
    const store = this.store;
    const zoom = this._zoom;
    const iconPx = zoom >= 9 ? 32 : zoom >= 7 ? 28 : zoom >= 5 ? 24 : 20;
    const pad = 40;
    const project = (lat, lon) => map.latLngToContainerPoint([lat, lon]);
    const selected = store.selectedHex ? store.get(store.selectedHex) : null;
    // A newly selected aircraft pops up on a spring, as places do in Apple Maps.
    const selHex = selected?.hex ?? null;
    if (selHex !== this._selHex) {
      this._selHex = selHex;
      this._selAt = t;
    }
    const dt = t - (this._selAt ?? -1e9);
    this._selScale = 1.15 * (1 - 0.4 * Math.exp(-dt / 110) * Math.cos(dt / 55));

    if (o.coverage) this._drawCoverage(ctx, o.coverage, project);

    // Work out what is on screen once, then draw in layers: trails, shadows, planes.
    const hits = [];
    for (const ac of store.sorted) {
      if (ac !== selected && !o.filter(ac)) continue;
      const [lat, lon] = store.positionAt(ac, t);
      const p = project(lat, lon);
      const onScreen = p.x >= -pad && p.y >= -pad && p.x <= size.x + pad && p.y <= size.y + pad;
      if (!onScreen && ac !== selected) continue;
      hits.push({ ac, x: p.x, y: p.y });
    }
    this._hits = hits;

    if (o.allTrails && hits.length < 1500) {
      for (const hit of hits) {
        if (hit.ac !== selected) this._drawTrail(ctx, hit.ac, hit, project, 1.5, 0.55, 80);
      }
    }
    const selHit = selected && hits.find((hit) => hit.ac === selected);
    if (selHit) {
      if (o.route) this._drawRoute(ctx, o.route, selected, project, t);
      this._drawTrail(ctx, selected, selHit, project, 3, 0.95, Infinity);
    }

    // Shadows first, so they always fall on the ground and never across another aircraft.
    for (const hit of hits) this._drawShadow(ctx, hit, iconPx, dpr, hit.ac === selected);
    for (const hit of hits) {
      if (hit.ac !== selected) this._drawPlane(ctx, hit, iconPx, dpr, t, false);
    }
    if (selHit) this._drawPlane(ctx, selHit, iconPx, dpr, t, true);
    this._drawLife(ctx, hits, selected, iconPx, dpr, t);
  },

  _color(ac, isSelected) {
    if (isEmergency(ac)) return EMERGENCY_FILL;
    if (isSelected) return SELECTED_FILL;
    return ac.onGround ? GROUND_FILL : CLASSIC_FILL;
  },

  // Icon size in CSS px for this aircraft (and caches its silhouette choice).
  _size(ac, iconPx, isSelected) {
    if (ac._shapeKey !== ac.type + ac.category) {
      ac._shapeKey = ac.type + ac.category;
      ac._shape = shapeFor(ac);
    }
    return Math.round(iconPx * shapeScale(ac._shape) * (isSelected ? this._selScale : 1));
  },

  _rotate(ctx, ac, x, y, dpr) {
    const rot = ((ac.track ?? 0) * Math.PI) / 180;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    ctx.setTransform(c * dpr, s * dpr, -s * dpr, c * dpr, x * dpr, y * dpr);
  },

  // Spinning helicopter rotors. Each aircraft has its own phase so they don't turn in step.
  _drawLife(ctx, hits, selected, iconPx, dpr, t) {
    for (const hit of hits) {
      const { ac, x, y } = hit;
      const rotor = rotorFor(ac._shape);
      if (!rotor) continue;
      const px = this._size(ac, iconPx, ac === selected);
      if (ac._phase == null) ac._phase = (parseInt(ac.hex.replace(/[^0-9a-f]/g, '').slice(-4) || '0', 16) % 997) / 997;
      const img = rotorSprite(ac._shape, px, dpr);
      const d = img.width / dpr;
      const spin = -(t / 1000) * Math.PI * 2 * 1.8 + ac._phase * 6.28;
      rotor.hubs.forEach(([hx, hy], i) => {
        this._rotate(ctx, ac, x, y, dpr);
        ctx.translate(hx * px, hy * px);
        ctx.rotate(i % 2 ? -spin : spin);
        ctx.drawImage(img, -d / 2, -d / 2, d, d);
      });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  },

  // Soft shadow offset towards the lower right; higher aircraft float further above the map.
  _drawShadow(ctx, hit, iconPx, dpr, isSelected) {
    const { ac, x, y } = hit;
    const px = this._size(ac, iconPx, isSelected);
    const lift = ac.onGround ? 0.6 : 1.2 + 2.4 * Math.min(1, Math.max(0, (ac.alt ?? 0) / 40000));
    const off = lift * (px / 28);
    const img = shadowSprite(ac._shape, px, dpr);
    const full = px + SHADOW_PAD * 2;
    this._rotate(ctx, ac, x + off, y + off, dpr);
    ctx.drawImage(img, -full / 2, -full / 2, full, full);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  _drawPlane(ctx, hit, iconPx, dpr, t, isSelected) {
    const { ac, x, y } = hit;
    const px = this._size(ac, iconPx, isSelected);
    const img = sprite(ac._shape, this._color(ac, isSelected), px, dpr);

    if (isEmergency(ac)) {
      const pulse = (Math.sin(t / 220) + 1) / 2;
      ctx.beginPath();
      ctx.arc(x, y, px * 0.7 + pulse * 6, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 45, 85, ${0.35 + pulse * 0.5})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (isSelected) {
      // A glass lens under the selected aircraft: clear in the middle, brighter towards the rim,
      // edged with a fine white line that floats on a soft shadow.
      const r = px * 0.74;
      const lens = ctx.createRadialGradient(x, y - r * 0.35, r * 0.15, x, y, r);
      lens.addColorStop(0, this._ink.lensTop);
      lens.addColorStop(1, this._ink.lensEdge);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = lens;
      ctx.fill();
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    this._rotate(ctx, ac, x, y, dpr);
    ctx.drawImage(img, -px / 2, -px / 2, px, px);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  _drawTrail(ctx, ac, hit, project, width, alpha, maxPoints) {
    const pts = ac.trail;
    if (!pts.length) return;
    const start = Math.max(0, pts.length - maxPoints);
    ctx.save();
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha;
    let p = project(pts[start].lat, pts[start].lon);
    let color = altitudeColor(pts[start].alt, false);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    for (let i = start + 1; i < pts.length; i++) {
      p = project(pts[i].lat, pts[i].lon);
      ctx.lineTo(p.x, p.y);
      const next = altitudeColor(pts[i].alt, false);
      if (next !== color) {
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        color = next;
      }
    }
    ctx.lineTo(hit.x, hit.y);
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  },

  // Dashed great-circle line from the aircraft to its destination.
  _drawRoute(ctx, route, ac, project, t) {
    const [lat, lon] = this.store.positionAt(ac, t);
    const d = route.destination;
    const pts = greatCirclePoints(lat, lon, d.lat, d.lon, 48);
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = this._ink.route;
    ctx.beginPath();
    pts.forEach(([la, lo], i) => {
      const p = project(la, lo);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    for (const ap of [route.origin, route.destination]) {
      const p = project(ap.lat, ap.lon);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = this._ink.dot;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = this._ink.dotEdge;
      ctx.stroke();
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = this._ink.halo;
      ctx.strokeText(ap.iata || ap.icao, p.x + 9, p.y);
      ctx.fillStyle = this._ink.text;
      ctx.fillText(ap.iata || ap.icao, p.x + 9, p.y);
    }
    ctx.restore();
  },

  // Outline of the area the data source covers when the view is wider than it can serve.
  _drawCoverage(ctx, cov, project) {
    const c = project(cov.lat, cov.lon);
    const [nLat, nLon] = destinationPoint(cov.lat, cov.lon, 0, cov.radius);
    const n = project(nLat, nLon);
    const r = Math.hypot(n.x - c.x, n.y - c.y);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.setLineDash([4, 8]);
    ctx.strokeStyle = this._ink.coverage;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  },
});
