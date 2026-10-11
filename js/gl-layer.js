// The vector map (MapLibre GL) as a Leaflet layer, moved the way Leaflet moves its own tiles.
// Drawing the map is slow on phones (tens of milliseconds in Safari), far too slow to do while a
// finger moves it. So the map is drawn with a wide margin all round, and while it is dragged,
// flung or pinched, that picture simply moves and scales with the finger, which the browser does
// by itself, smoothly, at the screen's full rate. MapLibre draws again during a gesture only if
// the finger nears the edge of the margin (and then further ahead, in the direction the map is
// going) or a zoom stretches the picture too far. Everything else waits until the map is still:
// map data arriving, and centring the picture in its margin again. A new picture and its new
// place on screen always arrive together, in the same frame, so the map never jumps, or lags
// behind the finger and the aircraft over it.
// After the approach of @maplibre/maplibre-gl-leaflet (ISC licence).

const L = window.L;

/** The margin drawn beyond each edge of the screen, in CSS px: more than a usual swipe. */
const margin = (length) => Math.round(Math.min(360, Math.max(160, length * 0.4)));

/** Credits of every source in a style, for Leaflet's credits line. */
const attributionOf = (style) =>
  Object.values(style?.sources || {})
    .map((s) => s.attribution)
    .filter(Boolean)
    .join(', ');

export const GLLayer = L.Layer.extend({
  options: { pane: 'tilePane' }, // and any MapLibre map options: style, pixelRatio, ...

  initialize(options) {
    L.setOptions(this, options);
    this._attribution = attributionOf(this.options.style);
  },

  onAdd(map) {
    const el = (this._container = L.DomUtil.create('div', 'leaflet-gl-layer leaflet-zoom-animated'));
    Object.assign(el.style, { position: 'absolute', left: '0', top: '0' });
    map.getPane(this.options.pane).appendChild(el);
    this._setSize();
    const { pane, ...options } = this.options;
    const c = map.getCenter();
    const gl = (this._gl = new window.maplibregl.Map({
      ...options,
      container: el,
      center: [c.lng, c.lat],
      zoom: map.getZoom() - 1, // MapLibre's tiles are 512 px, Leaflet's 256
      interactive: false,
      attributionControl: false,
    }));
    // Leaflet decides where the map may go; MapLibre shows exactly the same place.
    gl.setTransformConstrain?.((center, zoom) => ({ center, zoom }));
    // Repaints MapLibre wants for itself (map data arriving) wait while the map moves.
    const repaint = gl.triggerRepaint.bind(gl);
    gl.triggerRepaint = () => {
      if (!this._busy()) return repaint();
      this._wanted = true;
      if (!this._wait) this._waitForStill();
    };
    this._moving = false;
    this._lastMove = 0;
    this._wanted = false;
    this._wait = 0;
    this._settle = 0;
    this._velocity = L.point(0, 0);
    this._last = null;
    this._at = null;
    this._placed = null;
    this._draw();
  },

  onRemove() {
    clearTimeout(this._wait);
    clearTimeout(this._settle);
    this._wait = this._settle = 0;
    this._gl.remove();
    this._gl = null;
    L.DomUtil.remove(this._container);
    this._container = null;
  },

  getEvents() {
    return {
      movestart: this._onMoveStart,
      move: this._onMove,
      moveend: this._onMoveEnd,
      zoomanim: this._onZoomAnim,
      resize: this._onResize,
    };
  },

  getAttribution() {
    return this._attribution;
  },

  getMaplibreMap() {
    return this._gl;
  },

  /** Switch to another style, with its credits. */
  setStyle(style) {
    const next = attributionOf(style);
    const control = this._map?.attributionControl;
    if (control && next !== this._attribution) {
      control.removeAttribution(this._attribution);
      control.addAttribution(next);
    }
    this._attribution = next;
    this._gl?.setStyle(style);
  },

  /**
   * The map is moving. A finger resting for a moment counts as still, and so does a move that
   * never reported its end.
   */
  _busy() {
    return this._moving && performance.now() - this._lastMove < 300;
  },

  /** Draws what MapLibre asked for once the map is still. */
  _waitForStill() {
    this._wait = setTimeout(() => {
      this._wait = 0;
      if (!this._wanted || !this._map) return;
      if (this._busy()) this._waitForStill();
      else this._draw();
    }, 300);
  },

  _setSize() {
    const size = this._map.getSize();
    this._pad = L.point(margin(size.x), margin(size.y));
    this._container.style.width = `${size.x + 2 * this._pad.x}px`;
    this._container.style.height = `${size.y + 2 * this._pad.y}px`;
  },

  _place(pos, scale) {
    const p = this._placed;
    if (p && p.x === pos.x && p.y === pos.y && p.scale === scale) return;
    this._placed = { x: pos.x, y: pos.y, scale };
    L.DomUtil.setTransform(this._container, pos, scale === 1 ? undefined : scale);
  },

  /** Draws the map as it is now and puts the picture in its place, both in this same frame. */
  _draw() {
    const map = this._map;
    const gl = this._gl;
    if (!map || !gl) return;
    clearTimeout(this._settle);
    this._settle = 0;
    const zoom = map.getZoom();
    // During a gesture, half the margin goes ahead of the moving map (about half a second of travel).
    const pad = this._pad;
    const v = this._busy() ? this._velocity : L.point(0, 0);
    const ahead = (speed, room) => Math.max(-0.5, Math.min(0.5, (speed * 500) / room)) * room;
    const topLeft = map.containerPointToLayerPoint([0, 0]).subtract(pad).add(L.point(ahead(v.x, pad.x), ahead(v.y, pad.y))).round();
    // The picture's top left corner in world pixels at this zoom: where it belongs as the map moves.
    this._at = { zoom, origin: map.getPixelOrigin().add(topLeft), time: performance.now() };
    this._place(topLeft, 1);
    const size = map.getSize().add(pad.multiplyBy(2));
    const center = map.layerPointToLatLng(topLeft.add(size.divideBy(2)));
    gl.jumpTo({ center: [center.lng, center.lat], zoom: zoom - 1 }); // asks for a repaint, done right here:
    this._wanted = false;
    gl.redraw(); // now, not at the next frame
  },

  /** Where the last picture belongs for a view at `zoom` whose world pixel origin is `origin`. */
  _follow(zoom, origin) {
    const scale = this._map.getZoomScale(zoom, this._at.zoom);
    const pos = this._at.origin.multiplyBy(scale).subtract(origin);
    return { scale, pos: scale === 1 ? pos.round() : pos };
  },

  _onMoveStart() {
    clearTimeout(this._settle);
    this._settle = 0;
    this._moving = true;
    this._lastMove = performance.now();
    this._last = null;
    this._velocity = L.point(0, 0);
  },

  _onMove() {
    if (!this._at) return;
    const map = this._map;
    const now = performance.now();
    this._lastMove = now;
    const zoom = map.getZoom();
    const view = map.containerPointToLayerPoint([0, 0]);
    // How fast the view travels (px per ms), smoothed; reset by any zoom.
    const last = this._last;
    if (last && last.zoom === zoom && now > last.time) {
      const k = Math.min(1, (now - last.time) / 80);
      this._velocity = this._velocity.multiplyBy(1 - k).add(view.subtract(last.view).divideBy(now - last.time).multiplyBy(k));
    } else if (last) {
      this._velocity = L.point(0, 0);
    }
    this._last = { view, zoom, time: now };

    const { scale, pos } = this._follow(zoom, map.getPixelOrigin());
    // How much of the margin is left on each side of the screen.
    const size = map.getSize();
    const pad = this._pad;
    const right = pos.x + (size.x + 2 * pad.x) * scale - (view.x + size.x);
    const bottom = pos.y + (size.y + 2 * pad.y) * scale - (view.y + size.y);
    const nearEdge = Math.min(view.x - pos.x, right) < pad.x * 0.2 || Math.min(view.y - pos.y, bottom) < pad.y * 0.2;
    // A zoom stretches the picture: draw again when it gets blurry, and now and then.
    const stretched = scale > 1.4 || scale < 0.6 || (scale !== 1 && now - this._at.time > 300);
    if (nearEdge || stretched) this._draw();
    else this._place(pos, scale);
  },

  _onMoveEnd() {
    this._moving = false;
    const map = this._map;
    if (this._at && map.getZoom() !== this._at.zoom) return this._draw(); // still stretched: at once
    // Centre the picture in its margin again (and show map data that arrived), a moment later so
    // that a quick next swipe starts smoothly; if it comes first, that waits for its end.
    clearTimeout(this._settle);
    this._settle = setTimeout(() => {
      this._settle = 0;
      if (this._moving || !this._map) return;
      const topLeft = map.containerPointToLayerPoint([0, 0]).subtract(this._pad).round();
      const moved = !this._at || map.getZoom() !== this._at.zoom || !map.getPixelOrigin().add(topLeft).equals(this._at.origin);
      if (moved || this._wanted) this._draw();
    }, 150);
  },

  // Leaflet's zoom animation: the picture is moved and scaled to where it belongs at the end, and
  // the browser animates it there, as it does Leaflet's tiles. It is drawn afresh at the end.
  _onZoomAnim(e) {
    if (!this._at) return;
    const { scale, pos } = this._follow(e.zoom, this._map._getNewPixelOrigin(e.center, e.zoom));
    this._place(pos, scale);
  },

  _onResize() {
    this._setSize();
    this._gl.resize();
    this._draw();
  },
});
