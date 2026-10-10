// Flight radar app: map, live polling, selection, search, filters and settings.

import { AircraftStore } from './store.js';
import { AircraftLayer } from './aircraft-layer.js?v=20';
import { Panel } from './panel.js?v=17';
import { createDataSource } from './datasource.js?v=8';
import { SimSource } from './sim.js';
import { loadSettings, saveSettings, makeFilter, DEFAULTS } from './settings.js';
import { svgIcon, shapeFor, CLASSIC_FILL } from './icons.js?v=14';
import { shortAlt } from './format.js?v=2';
import { distanceNm, normalizeLon } from './shared/geo.js';
import { PROVIDERS } from './shared/providers.js';
import { vectorStyle, airportBadge, LAND } from './map-style.js?v=1';

const L = window.L;
const $ = (id) => document.getElementById(id);

// Map backgrounds, all usable without an API key. Each style lists backup tile servers,
// tried in order when the current one fails to load.
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const STREET_TILES = [
  { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: OSM_ATTRIBUTION },
  { url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png', attribution: OSM_ATTRIBUTION },
  {
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: `${OSM_ATTRIBUTION}, tiles by HOT / OSM France`,
    subdomains: 'abc',
  },
];
// Each style also sets the app's appearance (`theme`) and the colour of the route and selection
// marks drawn over the map (`ink`): satellite imagery is dark, but its menus are white.
// `vector` names the Apple Maps-style vector map drawn for the style where it is available; the
// raster `tiles` are the fallback (no WebGL, or the vector tiles cannot be reached).
const MAP_STYLES = {
  dark: { vector: 'dark', tiles: STREET_TILES, dark: true, theme: 'dark', ink: 'dark' }, // raster darkened with a CSS filter
  light: { vector: 'light', tiles: STREET_TILES, theme: 'light', ink: 'light' },
  satellite: {
    theme: 'light',
    ink: 'dark',
    tiles: [
      {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
      },
      ...STREET_TILES,
    ],
  },
};

const DEFAULT_VIEW = { lat: 51.47, lon: -0.45, zoom: 8 }; // London
// The Apple Maps-style vector map, being previewed: on with ?map=apple.
const VECTOR_MAP = new URLSearchParams(location.search).get('map') === 'apple';
const FAILURES_BEFORE_BANNER = 3;
const DATA_SOURCE = 'auto'; // the best available network, switching automatically if one fails

// ── State ────────────────────────────────────────────────────────────────

const settings = loadSettings();
// Older saved choices: "osm" is now the light style.
if (!Object.hasOwn(MAP_STYLES, settings.mapStyle)) settings.mapStyle = settings.mapStyle === 'osm' ? 'light' : 'dark';
const urlDemo = new URLSearchParams(location.search).get('demo') === '1';
const store = new AircraftStore();
let filter = makeFilter(settings.filters);
let liveSource = null;
let source = null; // the active data source (live or demo)
let route = null; // route of the selected flight, if known
let coverage = null; // area actually covered when the view is wider than the source allows
let following = false;
let enrichedCallsign = null;
const status = { lastUpdate: 0, sourceName: '', sourceId: '', error: null, failures: 0 };

// ── Map ──────────────────────────────────────────────────────────────────

const initial = parseHash() || DEFAULT_VIEW;
const map = L.map('map', {
  center: [initial.lat, initial.lon],
  zoom: initial.zoom,
  minZoom: 2,
  maxZoom: 18,
  zoomControl: false,
  worldCopyJump: true,
});
L.control.zoom({ position: 'bottomright' }).addTo(map);
map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');

let tileLayer = null;
let tileIndex = 0;
/** Dark or light colours for the whole app, including the phone's status bar. */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#ffffff' : '#0e1420';
}

let glLayer = null; // the vector map, drawn by MapLibre GL inside Leaflet
let glTheme = null;
let vectorFailed = false;
let vectorLib = null;

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** MapLibre GL and its Leaflet bridge, loaded only when the vector map is first shown. */
function loadVectorLib() {
  const add = (tag, attrs) =>
    new Promise((resolve, reject) => {
      const el = Object.assign(document.createElement(tag), attrs);
      el.onload = resolve;
      el.onerror = reject;
      document.head.append(el);
    });
  vectorLib ??= Promise.all([
    add('link', { rel: 'stylesheet', href: 'vendor/maplibre-gl/maplibre-gl.css' }),
    add('script', { src: 'vendor/maplibre-gl/maplibre-gl.js' }).then(() => add('script', { src: 'vendor/maplibre-gl/leaflet-maplibre-gl.js' })),
  ]);
  return vectorLib;
}

function removeBaseMap() {
  if (tileLayer) map.removeLayer(tileLayer);
  if (glLayer) map.removeLayer(glLayer);
  tileLayer = glLayer = glTheme = null;
}

async function showVectorMap(theme) {
  $('map').classList.remove('map-dark');
  $('map').style.background = LAND[theme];
  if (glLayer) {
    if (glTheme !== theme) {
      glTheme = theme;
      glLayer.getMaplibreMap().setStyle(vectorStyle(theme));
    }
    return;
  }
  try {
    if (!webglAvailable()) throw new Error('WebGL is not available');
    await loadVectorLib();
  } catch {
    vectorFailed = true;
    return applyMapStyle();
  }
  // The choice may have changed while the library loaded; the newer call has handled it.
  if (MAP_STYLES[settings.mapStyle].vector !== theme || glLayer) return;
  removeBaseMap();
  glTheme = theme;
  glLayer = L.maplibreGL({
    style: vectorStyle(theme),
    pixelRatio: Math.min(2, window.devicePixelRatio || 1), // crisp enough, and far lighter than 3×
    updateInterval: 16,
    fadeDuration: 200,
  });
  glLayer.addTo(map);
  const gl = glLayer.getMaplibreMap();
  gl.on('styleimagemissing', (e) => {
    const m = /^airport-badge-(light|dark)$/.exec(e.id);
    if (!m || gl.hasImage(e.id)) return;
    const badge = airportBadge(m[1]);
    gl.addImage(e.id, badge.image, { pixelRatio: badge.pixelRatio });
  });
  // Vector tiles that cannot be reached (the tile index fails, tiles keep failing, or nothing has
  // arrived after a while) mean the server is down or blocked: use the raster tiles instead.
  let loaded = 0;
  let errors = 0;
  const fallBack = () => {
    if (loaded > 0 || vectorFailed || gl !== glLayer?.getMaplibreMap()) return;
    vectorFailed = true;
    applyMapStyle();
  };
  gl.on('sourcedata', (e) => {
    if (e.tile) loaded++;
  });
  gl.on('error', (e) => {
    if ((e.sourceId && !e.tile) || ++errors >= 4) fallBack();
  });
  setTimeout(fallBack, 15000);
}

function applyMapStyle(nextServer = false) {
  const style = MAP_STYLES[settings.mapStyle];
  applyTheme(style.theme);
  if (style.vector && VECTOR_MAP && !vectorFailed) {
    showVectorMap(style.vector);
    return;
  }
  tileIndex = nextServer ? tileIndex + 1 : 0;
  const t = style.tiles[tileIndex];
  removeBaseMap();
  $('map').style.background = '';
  $('map').classList.toggle('map-dark', Boolean(style.dark));
  let loaded = 0;
  let failed = 0;
  tileLayer = L.tileLayer(t.url, {
    attribution: t.attribution,
    subdomains: t.subdomains || 'abc',
    maxZoom: 18,
    maxNativeZoom: 18,
  });
  tileLayer.on('tileload', () => loaded++);
  // A server that keeps failing before any tile has loaded is down or blocked: use the next one.
  tileLayer.on('tileerror', () => {
    if (++failed >= 6 && loaded === 0 && tileIndex < style.tiles.length - 1) applyMapStyle(true);
  });
  tileLayer.addTo(map);
}
applyMapStyle();

const layer = new AircraftLayer(store, () => ({
  ink: MAP_STYLES[settings.mapStyle].ink,
  allTrails: settings.allTrails,
  filter,
  route,
  coverage,
}));
layer.addTo(map);

const panel = new Panel({
  onClose: () => deselect(),
  onFollow: () => setFollowing(!following),
  onZoom: () => {
    const ac = selectedAircraft();
    if (ac) flyToVisible(store.positionAt(ac, Date.now()), Math.max(map.getZoom(), 10));
  },
});

/** Pixel offset from the map centre to the centre of the area not covered by the panel. */
function panelOffset() {
  if (!panel.open) return L.point(0, 0);
  const p = $('panel').getBoundingClientRect();
  const m = $('map').getBoundingClientRect();
  if (p.width >= m.width * 0.9) return L.point(0, -Math.max(0, m.bottom - p.top) / 2); // bottom sheet
  return L.point(Math.max(0, p.right - m.left) / 2, 0);
}

let flyingUntil = 0;
function flyToVisible(latlng, zoom) {
  const target = map.unproject(map.project(latlng, zoom).subtract(panelOffset()), zoom);
  flyingUntil = Date.now() + 1000;
  map.flyTo(target, zoom, { duration: 0.9 });
}

// ── Data polling ─────────────────────────────────────────────────────────

let pollTimer = null;
let moveTimer = null;
let inflight = false;
let pending = false;
let lastFetch = 0;

function viewQuery() {
  const c = map.getCenter();
  const b = map.getBounds();
  const corners = [b.getNorthWest(), b.getNorthEast(), b.getSouthWest(), b.getSouthEast()];
  const lat = c.lat;
  const lon = normalizeLon(c.lng);
  const radius = Math.max(...corners.map((p) => distanceNm(lat, lon, p.lat, normalizeLon(p.lng))));
  return { lat, lon, radius: Math.max(5, radius * 1.05) };
}

async function refresh() {
  clearTimeout(pollTimer);
  if (!source) return;
  if (inflight) {
    pending = true;
    return;
  }
  if (document.hidden) return; // resumes on visibilitychange
  inflight = true;
  lastFetch = Date.now();
  const src = source;
  const q = viewQuery();
  try {
    const res = await src.area(q.lat, q.lon, q.radius, DATA_SOURCE);
    if (src !== source) return;
    const seen = store.ingest(res.aircraft, {
      t: Date.now(),
      age: res.age || 0,
      area: { lat: q.lat, lon: q.lon, radius: res.radius ?? q.radius },
    });
    coverage = res.capped ? { lat: q.lat, lon: q.lon, radius: res.radius } : null;
    Object.assign(status, { lastUpdate: Date.now(), sourceName: res.sourceName, sourceId: res.source, error: null, failures: 0 });
    // Keep tracking the selected aircraft even when it is outside the loaded area.
    const sel = store.selectedHex;
    if (sel && !seen.has(sel) && !sel.startsWith('~')) {
      const found = await src.find('hex', sel, DATA_SOURCE).catch(() => null);
      if (found && src === source) store.ingest(found.aircraft, { t: Date.now(), age: found.age || 0 });
    }
  } catch (err) {
    if (src !== source) return;
    status.error = err.message;
    status.failures++;
  } finally {
    if (src === source) {
      inflight = false;
      const delay = pending ? 0 : source.pollMs(status.sourceId || DATA_SOURCE);
      pending = false;
      pollTimer = setTimeout(refresh, delay);
    }
    renderStatus();
  }
}

function refreshSoon() {
  clearTimeout(moveTimer);
  moveTimer = setTimeout(refresh, Math.max(200, 1000 - (Date.now() - lastFetch)));
}

function useSource(next) {
  source = next;
  clearTimeout(pollTimer);
  inflight = false;
  pending = false;
  store.clear();
  deselect();
  coverage = null;
  Object.assign(status, { lastUpdate: 0, sourceName: '', sourceId: '', error: null, failures: 0 });
  $('demo-badge').hidden = source.mode !== 'demo';
  renderStatus();
  refresh();
}

async function setDemo(on) {
  if (on) return useSource(new SimSource());
  if (!liveSource) liveSource = await createDataSource();
  useSource(liveSource);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh();
});

// ── Selection ────────────────────────────────────────────────────────────

const routeCache = new Map();
const detailCache = new Map();

function cached(cache, key, load) {
  if (!cache.has(key)) {
    const p = load().catch(() => {
      cache.delete(key); // allow a retry later
      return null;
    });
    cache.set(key, p);
  }
  return cache.get(key);
}

function selectedAircraft() {
  return store.selectedHex ? store.get(store.selectedHex) : null;
}

function select(hex, { fly = false } = {}) {
  const ac = store.get(hex);
  if (!ac) return;
  store.selectedHex = hex;
  route = null;
  enrichedCallsign = null;
  setFollowing(false);
  panel.show(ac, { demo: source.mode === 'demo' });
  tickPanel();
  loadDetails(ac);
  if (fly) flyToVisible(store.positionAt(ac, Date.now()), Math.max(map.getZoom(), 9));
  writeHash();
}

function deselect() {
  if (!store.selectedHex && !panel.open) return;
  store.selectedHex = null;
  route = null;
  setFollowing(false);
  panel.hide();
  writeHash();
}

async function loadDetails(ac) {
  if (source.mode === 'demo') return;
  const hex = ac.hex;
  if (/^[0-9a-f]{6}$/.test(hex)) {
    const d = await cached(detailCache, hex, () => source.details(hex));
    if (d && store.selectedHex === hex) panel.setDetails(d);
  }
}

async function loadRoute(ac) {
  const cs = ac.callsign;
  enrichedCallsign = cs;
  if (source.mode === 'demo' || !/^[A-Z0-9]{2,8}$/.test(cs)) return;
  const r = await cached(routeCache, cs, () => source.route(cs));
  if (store.selectedHex === ac.hex && enrichedCallsign === cs) {
    route = r;
    panel.setRoute(r);
  }
}

function setFollowing(on) {
  following = on && Boolean(selectedAircraft());
  panel.setFollowing(following);
  if (following) flyToVisible(store.positionAt(selectedAircraft(), Date.now()), map.getZoom());
}

let lostToastFor = null;
function tickPanel() {
  const ac = selectedAircraft();
  if (!ac) {
    if (store.selectedHex) {
      if (lostToastFor !== store.selectedHex) toast('Lost contact with the selected aircraft');
      lostToastFor = store.selectedHex;
      deselect();
    }
    return;
  }
  if (ac.callsign && ac.callsign !== enrichedCallsign) loadRoute(ac);
  panel.update(ac, store.positionAt(ac, Date.now()), { now: Date.now() });
}
setInterval(tickPanel, 500);

// Keep the followed aircraft centred, every frame.
(function followLoop() {
  requestAnimationFrame(followLoop);
  if (!following || layer._animating) return;
  const ac = selectedAircraft();
  if (!ac) return;
  if (Date.now() < flyingUntil) return; // let the fly-in animation finish first
  const p = map.latLngToContainerPoint(store.positionAt(ac, Date.now()));
  const want = map.getSize().divideBy(2).add(panelOffset());
  const dx = p.x - want.x;
  const dy = p.y - want.y;
  if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) map.panBy([dx, dy], { animate: false });
})();

// ── Map interaction ──────────────────────────────────────────────────────

const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

map.on('click', (e) => {
  const ac = layer.hitTest(e.containerPoint, coarsePointer ? 24 : 15);
  if (ac) select(ac.hex);
  else deselect();
  closeSheets();
});

map.on('mousemove', (e) => {
  const ac = coarsePointer ? null : layer.hitTest(e.containerPoint);
  $('map').classList.toggle('hovering', Boolean(ac));
});

map.on('dragstart', () => setFollowing(false));
map.on('moveend', () => {
  writeHash();
  refreshSoon();
});

// ── Problems, notices and data credit ────────────────────────────────────

const nf = new Intl.NumberFormat();
let credit = ''; // the live data source's credit, shown with the map credits

function renderStatus() {
  const demo = source?.mode === 'demo';
  const provider = PROVIDERS[status.sourceId];
  const next = provider ? `Flight data: <a href="${provider.home}" target="_blank" rel="noopener">${provider.name}</a>` : '';
  if (next !== credit) {
    if (credit) map.attributionControl.removeAttribution(credit);
    if (next) map.attributionControl.addAttribution(next);
    credit = next;
  }

  // Before anything has loaded, explain a failure straight away; later, ride out brief hiccups.
  $('banner').hidden = demo || status.failures < (status.lastUpdate ? FAILURES_BEFORE_BANNER : 1);
  if (!$('banner').hidden) $('banner-text').textContent = 'Live flight data is unavailable right now.';
  $('banner-detail').textContent = status.error || '';

  const notice = $('notice');
  notice.hidden = !coverage;
  if (coverage) {
    notice.textContent = `Showing traffic within ${coverage.radius} nm of the map centre · zoom in to see everything`;
  }
}

$('banner-retry').addEventListener('click', () => {
  status.failures = 0;
  renderStatus();
  refresh();
});
$('banner-demo').addEventListener('click', () => setDemo(true));
$('demo-exit').addEventListener('click', () => setDemo(false));

// ── Search ───────────────────────────────────────────────────────────────

const searchInput = $('search');
if (window.matchMedia('(max-width: 760px)').matches) searchInput.placeholder = 'Search flights';
const resultsEl = $('search-results');
let results = [];
let activeIndex = -1;

function renderResults() {
  resultsEl.textContent = '';
  const q = searchInput.value.trim();
  if (!q) {
    resultsEl.hidden = true;
    return;
  }
  if (!results.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Press Enter to search worldwide';
    resultsEl.append(li);
  }
  results.forEach((ac, i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(i === activeIndex));
    const icon = document.createElement('span');
    icon.className = 'sr-icon';
    icon.innerHTML = svgIcon(shapeFor(ac), CLASSIC_FILL);
    const main = document.createElement('span');
    main.className = 'sr-main';
    const title = document.createElement('strong');
    title.textContent = ac.callsign || ac.reg || ac.hex.toUpperCase();
    const sub = document.createElement('span');
    sub.textContent = [ac.type, ac.reg, ac.hex.toUpperCase()].filter(Boolean).join(' · ');
    main.append(title, sub);
    const alt = document.createElement('span');
    alt.className = 'sr-alt';
    alt.textContent = shortAlt(ac);
    li.append(icon, main, alt);
    li.addEventListener('mousedown', (e) => {
      e.preventDefault();
      pickResult(ac);
    });
    resultsEl.append(li);
  });
  resultsEl.hidden = false;
}

function pickResult(ac) {
  searchInput.value = '';
  results = [];
  renderResults();
  searchInput.blur();
  select(ac.hex, { fly: true });
}

async function searchWorldwide(q) {
  const v = q.trim();
  const kinds = /^[0-9a-f]{6}$/i.test(v) ? ['callsign', 'hex', 'reg'] : v.includes('-') ? ['reg'] : ['callsign', 'reg'];
  toast(`Searching for “${v}”…`);
  for (const kind of kinds) {
    try {
      const res = await source.find(kind, kind === 'hex' ? v.toLowerCase() : v.toUpperCase(), DATA_SOURCE);
      if (res.aircraft?.length) {
        store.ingest(res.aircraft, { t: Date.now(), age: res.age || 0 });
        toast(null);
        searchInput.value = '';
        renderResults();
        searchInput.blur();
        select(res.aircraft[0].hex, { fly: true });
        return;
      }
    } catch {
      // Try the next kind of lookup.
    }
  }
  toast(`No live flight found for “${v}”`);
}

searchInput.addEventListener('input', () => {
  results = store.search(searchInput.value);
  activeIndex = results.length ? 0 : -1;
  renderResults();
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!results.length) return;
    activeIndex = (activeIndex + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
    renderResults();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (results[activeIndex]) pickResult(results[activeIndex]);
    else if (searchInput.value.trim().length >= 2) searchWorldwide(searchInput.value);
  } else if (e.key === 'Escape') {
    searchInput.value = '';
    results = [];
    renderResults();
    searchInput.blur();
  }
});
searchInput.addEventListener('blur', () => {
  resultsEl.hidden = true;
});
searchInput.addEventListener('focus', () => {
  if (searchInput.value.trim()) renderResults();
});

// ── Pages: map, filters & settings (opened from the round side buttons) ───

const sheetButtons = [...document.querySelectorAll('.fab[data-sheet]')];

function closeSheets() {
  for (const btn of sheetButtons) {
    $(btn.dataset.sheet).hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }
  $('sheet-backdrop').hidden = true;
}

for (const btn of sheetButtons) {
  btn.addEventListener('click', () => {
    const wasOpen = !$(btn.dataset.sheet).hidden;
    closeSheets();
    if (wasOpen) return;
    $(btn.dataset.sheet).hidden = false;
    $('sheet-backdrop').hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  });
}
$('sheet-backdrop').addEventListener('click', closeSheets);
for (const btn of document.querySelectorAll('.sheet-close')) btn.addEventListener('click', closeSheets);

/** A group of role="radio" buttons: mark `value` as chosen and call `onPick` on taps. */
function bindChoice(group, value, onPick) {
  const buttons = [...group.querySelectorAll('[role="radio"]')];
  const mark = (v) => buttons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === v)));
  mark(value);
  for (const b of buttons) {
    b.addEventListener('click', () => {
      mark(b.dataset.value);
      onPick(b.dataset.value);
    });
  }
}

function persist() {
  saveSettings(settings);
}

function bindFilters() {
  const f = settings.filters;
  const text = $('f-text');
  const min = $('f-alt-min');
  const max = $('f-alt-max');
  const ground = $('f-ground');
  const mil = $('f-military');

  const sync = () => {
    text.value = f.text;
    min.value = f.altMin;
    max.value = f.altMax;
    for (const r of [min, max]) r.style.setProperty('--progress', `${(r.value / r.max) * 100}%`);
    ground.checked = f.hideGround;
    mil.checked = f.militaryOnly;
    const fmt = (v) => `${nf.format(v)} ft`;
    const anyAlt = f.altMin === 0 && f.altMax === DEFAULTS.filters.altMax;
    $('f-alt-out').textContent = anyAlt ? 'any' : `${fmt(f.altMin)} – ${f.altMax === DEFAULTS.filters.altMax ? 'max' : fmt(f.altMax)}`;
    const active = Boolean(f.text.trim()) || !anyAlt || f.hideGround || f.militaryOnly;
    $('filter-badge').hidden = !active;
  };
  const apply = () => {
    filter = makeFilter(f);
    sync();
    persist();
  };

  text.addEventListener('input', () => {
    f.text = text.value;
    apply();
  });
  min.addEventListener('input', () => {
    f.altMin = Math.min(Number(min.value), f.altMax);
    apply();
  });
  max.addEventListener('input', () => {
    f.altMax = Math.max(Number(max.value), f.altMin);
    apply();
  });
  ground.addEventListener('change', () => {
    f.hideGround = ground.checked;
    apply();
  });
  mil.addEventListener('change', () => {
    f.militaryOnly = mil.checked;
    apply();
  });
  $('f-reset').addEventListener('click', () => {
    Object.assign(f, DEFAULTS.filters);
    apply();
  });
  sync();
}
bindFilters();

function bindSettings() {
  const trails = $('s-trails');
  trails.checked = settings.allTrails;

  bindChoice($('s-map'), settings.mapStyle, (v) => {
    settings.mapStyle = v;
    applyMapStyle();
    persist();
  });
  trails.addEventListener('change', () => {
    settings.allTrails = trails.checked;
    persist();
  });
}
bindSettings();

// ── Liquid Glass touch ───────────────────────────────────────────────────
// Pressed glass lights up under the finger and swells, then springs back (see .pressed in CSS).

const PRESSABLE = '.fab, .btn, .btn-secondary, .icon-btn';
let pressedEl = null;

document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest?.(PRESSABLE);
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--px', `${((e.clientX - r.left) / r.width) * 100}%`);
  el.style.setProperty('--py', `${((e.clientY - r.top) / r.height) * 100}%`);
  el.classList.add('pressed');
  pressedEl = el;
});
for (const type of ['pointerup', 'pointercancel']) {
  document.addEventListener(type, () => {
    pressedEl?.classList.remove('pressed');
    pressedEl = null;
  });
}

// ── Misc controls ────────────────────────────────────────────────────────

$('btn-locate').addEventListener('click', () => {
  if (!navigator.geolocation) return toast('Location is not available in this browser');
  toast('Finding your location…');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      toast(null);
      setFollowing(false);
      map.flyTo([pos.coords.latitude, pos.coords.longitude], 9, { duration: 1.2 });
    },
    () => toast('Could not get your location'),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
  );
});

document.addEventListener('keydown', (e) => {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
  if (e.key === 'Escape') {
    const sheetOpen = sheetButtons.some((b) => !$(b.dataset.sheet).hidden);
    closeSheets();
    if (!typing && !sheetOpen) deselect();
  } else if (typing || e.metaKey || e.ctrlKey || e.altKey) {
    return;
  } else if (e.key === '/') {
    e.preventDefault();
    searchInput.focus();
  } else if (e.key === 'f' || e.key === 'F') {
    setFollowing(!following);
  }
});

let toastTimer = null;
function toast(message) {
  const el = $('toast');
  clearTimeout(toastTimer);
  el.hidden = !message;
  if (!message) return;
  el.textContent = message;
  toastTimer = setTimeout(() => (el.hidden = true), 4000);
}

// ── URL hash: #zoom/lat/lon[/hex] ────────────────────────────────────────

function parseHash() {
  const m = location.hash.match(/^#(\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)(?:\/(~?[0-9a-f]{6}))?$/i);
  if (!m) return null;
  const [zoom, lat, lon] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (Math.abs(lat) > 85 || Math.abs(lon) > 180 || zoom < 2 || zoom > 18) return null;
  return { zoom, lat, lon, hex: m[4]?.toLowerCase() };
}

let hashTimer = null;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const c = map.getCenter();
    const hash = `#${map.getZoom()}/${c.lat.toFixed(4)}/${normalizeLon(c.lng).toFixed(4)}${store.selectedHex ? `/${store.selectedHex}` : ''}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }, 300);
}

// ── Start ────────────────────────────────────────────────────────────────

(async function start() {
  renderStatus();
  if (urlDemo) {
    await setDemo(true);
  } else {
    liveSource = await createDataSource();
    useSource(liveSource);
  }
  if (initial.hex) selectFromLink(initial.hex);
})();

// Re-select the aircraft from a shared link once traffic has loaded, looking it up if needed.
async function selectFromLink(hex) {
  for (let attempt = 0; attempt < 10; attempt++) {
    if (store.get(hex)) return select(hex);
    if (attempt === 3 && !hex.startsWith('~')) {
      const res = await source.find('hex', hex, DATA_SOURCE).catch(() => null);
      if (res?.aircraft?.length) {
        store.ingest(res.aircraft, { t: Date.now(), age: res.age || 0 });
        return select(hex, { fly: true });
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// Expose for debugging in the browser console.
window.tracker = { map, store, settings, get source() { return source; } };
