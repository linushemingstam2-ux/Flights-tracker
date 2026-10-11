// The vector map (MapLibre GL) as a Leaflet layer, moved the way Leaflet moves its own tiles.
// While the map is dragged, flung or pinched, the picture already drawn simply moves and scales
// with it, which the browser does by itself, smoothly, at the screen's full rate. MapLibre draws
// a new picture only when the edge of the old one comes near (pictures are drawn with a margin
// all round for this), when a zoom has stretched it too far, and when the map comes to rest.
// A new picture and its new place on screen always arrive together, in the same frame, so the
// map never jumps, or lags behind the finger and the aircraft drawn over it.
// After the approach of @maplibre/maplibre-gl-leaflet (ISC licence).

const L = window.L;

/** The margin drawn beyond each edge of the screen, in CSS px. */
const margin = (length) => Math.round(Math.min(320, Math.max(120, length * 0.25)));

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
    this._gl = new window.maplibregl.Map({
      ...options,
      container: el,
      center: [c.lng, c.lat],
      zoom: map.getZoom() - 1, // MapLibre's tiles are 512 px, Leaflet's 256
      interactive: false,
      attributionControl: false,
    });
    // Leaflet decides where the map may go; MapLibre shows exactly the same place.
    this._gl.setTransformConstrain?.((center, zoom) => ({ center, zoom }));
    this._at = null;
    this._placed = null;
    this._draw();
  },

  onRemove() {
    this._gl.remove();
    this._gl = null;
    L.DomUtil.remove(this._container);
    this._container = null;
  },

  getEvents() {
    return { move: this._onMove, moveend: this._onMoveEnd, zoomanim: this._onZoomAnim, resize: this._onResize };
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
    const zoom = map.getZoom();
    const topLeft = map.containerPointToLayerPoint([0, 0]).subtract(this._pad).round();
    // The picture's top left corner in world pixels at this zoom: where it belongs as the map moves.
    this._at = { zoom, origin: map.getPixelOrigin().add(topLeft), time: performance.now() };
    this._place(topLeft, 1);
    const size = map.getSize().add(this._pad.multiplyBy(2));
    const center = map.layerPointToLatLng(topLeft.add(size.divideBy(2)));
    gl.jumpTo({ center: [center.lng, center.lat], zoom: zoom - 1 });
    gl.redraw(); // now, not at the next frame
  },

  /** Where the last picture belongs for a view at `zoom` whose world pixel origin is `origin`. */
  _follow(zoom, origin) {
    const scale = this._map.getZoomScale(zoom, this._at.zoom);
    const pos = this._at.origin.multiplyBy(scale).subtract(origin);
    return { scale, pos: scale === 1 ? pos.round() : pos };
  },

  _onMove() {
    if (!this._at) return;
    const map = this._map;
    const { scale, pos } = this._follow(map.getZoom(), map.getPixelOrigin());
    // How much of the margin is left on each side of the screen.
    const view = map.containerPointToLayerPoint([0, 0]);
    const size = map.getSize();
    const pad = this._pad;
    const right = pos.x + (size.x + 2 * pad.x) * scale - (view.x + size.x);
    const bottom = pos.y + (size.y + 2 * pad.y) * scale - (view.y + size.y);
    const nearEdge = Math.min(view.x - pos.x, right) < pad.x * 0.4 || Math.min(view.y - pos.y, bottom) < pad.y * 0.4;
    // A zoom stretches the picture: keep it sharp by drawing again now and then.
    const stretched = scale > 1.3 || scale < 0.8 || (scale !== 1 && performance.now() - this._at.time > 150);
    if (nearEdge || stretched) this._draw();
    else this._place(pos, scale);
  },

  _onMoveEnd() {
    const map = this._map;
    const topLeft = map.containerPointToLayerPoint([0, 0]).subtract(this._pad).round();
    if (!this._at || map.getZoom() !== this._at.zoom || !map.getPixelOrigin().add(topLeft).equals(this._at.origin)) this._draw();
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
