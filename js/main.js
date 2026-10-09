// Flight radar app: map, live polling, selection, search, filters and settings.

import { AircraftStore } from './store.js';
import { AircraftLayer } from './aircraft-layer.js';
import { Panel } from './panel.js';
import { createDataSource } from './datasource.js';
import { SimSource } from './sim.js';
import { loadSettings, saveSettings, makeFilter, DEFAULTS } from './settings.js';
import { svgIcon, shapeFor, altitudeHue, CLASSIC_FILL } from './icons.js';
import { formatAlt, formatSpeed, shortAlt, formatAgo } from './format.js';
import { distanceNm, normalizeLon } from './shared/geo.js';
import { PROVIDERS } from './shared/providers.js';

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
const MAP_STYLES = {
  dark: { tiles: STREET_TILES, dark: true }, // street map, darkened with a CSS filter
  light: { tiles: STREET_TILES },
  satellite: {
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
const FAILURES_BEFORE_BANNER = 3;

// ── State ────────────────────────────────────────────────────────────────

const settings = loadSettings();
// Older saved choices: "osm" is now the light style.
if (!Object.hasOwn(MAP_STYLES, settings.mapStyle)) settings.mapStyle = settings.mapStyle === 'osm' ? 'light' : 'dark';
// A saved data source that no longer exists (e.g. airplanes.live) falls back to automatic.
if (settings.source !== 'auto' && !Object.hasOwn(PROVIDERS, settings.source)) settings.source = 'auto';
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
function applyMapStyle(nextServer = false) {
  const style = MAP_STYLES[settings.mapStyle];
  tileIndex = nextServer ? tileIndex + 1 : 0;
  const t = style.tiles[tileIndex];
  if (tileLayer) map.removeLayer(tileLayer);
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
  colorMode: settings.colorMode,
  labels: settings.labels,
  allTrails: settings.allTrails,
  metric: settings.metric,
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
    const res = await src.area(q.lat, q.lon, q.radius, settings.source);
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
      const found = await src.find('hex', sel, settings.source).catch(() => null);
      if (found && src === source) store.ingest(found.aircraft, { t: Date.now(), age: found.age || 0 });
    }
  } catch (err) {
    if (src !== source) return;
    status.error = err.message;
    status.failures++;
  } finally {
    if (src === source) {
      inflight = false;
      const delay = pending ? 0 : source.pollMs(status.sourceId || settings.source);
      pending = false;
      pollTimer = setTimeout(refresh, delay);
    }
    requestAnimationFrame(renderStatus); // after the new data has been drawn
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
  $('s-demo').checked = source.mode === 'demo';
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
  panel.update(ac, store.positionAt(ac, Date.now()), { metric: settings.metric, now: Date.now() });
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
  closePopovers();
});

map.on('mousemove', (e) => {
  const ac = coarsePointer ? null : layer.hitTest(e.containerPoint);
  $('map').classList.toggle('hovering', Boolean(ac));
  const tip = $('tooltip');
  if (!ac) {
    tip.hidden = true;
    return;
  }
  $('tt-callsign').textContent = ac.callsign || ac.reg || ac.hex.toUpperCase();
  $('tt-type').textContent = [ac.type, ac.reg].filter(Boolean).join(' · ') || 'Unknown type';
  $('tt-alt').textContent = `${formatAlt(ac, settings.metric)} · ${formatSpeed(ac.gs, settings.metric)}`;
  tip.hidden = false;
  const { clientX: x, clientY: y } = e.originalEvent;
  const w = tip.offsetWidth;
  tip.style.left = `${x + 16 + w > innerWidth ? x - 16 - w : x + 16}px`;
  tip.style.top = `${y + 12}px`;
});
map.on('mouseout', () => {
  $('tooltip').hidden = true;
});

map.on('dragstart', () => setFollowing(false));
map.on('moveend', () => {
  writeHash();
  refreshSoon();
});

// ── Status bar ───────────────────────────────────────────────────────────

const nf = new Intl.NumberFormat();

function renderStatus() {
  const el = $('status');
  const demo = source?.mode === 'demo';
  const stale = status.lastUpdate && Date.now() - status.lastUpdate > 30_000;
  el.classList.toggle('live', !demo && !status.error && Boolean(status.lastUpdate) && !stale);
  el.classList.toggle('demo', demo);
  el.classList.toggle('error', Boolean(status.error) || Boolean(stale));

  let text;
  if (!source || (!status.lastUpdate && !status.error)) text = 'Connecting…';
  else if (status.error && !status.lastUpdate) text = 'No connection to flight data';
  else {
    text = `${nf.format(layer.visibleCount)} aircraft`;
    if (status.error) text += ' · retrying…';
    else text += ` · ${formatAgo(Date.now() - status.lastUpdate)}`;
  }
  $('status-text').textContent = text;
  el.title = status.error || '';

  const src = $('status-source');
  src.textContent = '';
  const provider = PROVIDERS[status.sourceId];
  if (provider) {
    const a = document.createElement('a');
    a.href = provider.home;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = provider.name;
    src.append('Data: ', a);
  } else if (demo) {
    src.textContent = 'Simulated';
  }

  $('banner').hidden = demo || status.failures < FAILURES_BEFORE_BANNER;
  if (!$('banner').hidden) $('banner-text').textContent = 'Live flight data is unavailable right now.';
  $('banner-detail').textContent = status.error || '';

  const notice = $('notice');
  notice.hidden = !coverage;
  if (coverage) {
    const r = settings.metric ? `${Math.round(coverage.radius * 1.852)} km` : `${coverage.radius} nm`;
    notice.textContent = `Showing traffic within ${r} of the map centre · zoom in to see everything`;
  }
}
setInterval(renderStatus, 1000);

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
    alt.textContent = shortAlt(ac, settings.metric);
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
      const res = await source.find(kind, kind === 'hex' ? v.toLowerCase() : v.toUpperCase(), settings.source);
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

// ── Popovers: filters & settings ─────────────────────────────────────────

const popovers = { filters: $('btn-filters'), settings: $('btn-settings') };

function closePopovers(except) {
  for (const [id, btn] of Object.entries(popovers)) {
    if (id === except) continue;
    $(id).hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }
}

for (const [id, btn] of Object.entries(popovers)) {
  btn.addEventListener('click', () => {
    const open = $(id).hidden;
    closePopovers(id);
    $(id).hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  });
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
    ground.checked = f.hideGround;
    mil.checked = f.militaryOnly;
    const fmt = (v) => (settings.metric ? `${nf.format(Math.round(v * 0.3048))} m` : `${nf.format(v)} ft`);
    const anyAlt = f.altMin === 0 && f.altMax === DEFAULTS.filters.altMax;
    $('f-alt-out').textContent = anyAlt ? 'any' : `${fmt(f.altMin)} – ${f.altMax === DEFAULTS.filters.altMax ? 'max' : fmt(f.altMax)}`;
    const active = Boolean(f.text.trim()) || !anyAlt || f.hideGround || f.militaryOnly;
    $('filter-badge').hidden = !active;
  };
  const apply = () => {
    filter = makeFilter(f);
    sync();
    persist();
    requestAnimationFrame(() => requestAnimationFrame(renderStatus)); // after the next draw
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
  return sync;
}
const syncFilters = bindFilters();

function bindSettings() {
  const mapSel = $('s-map');
  const color = $('s-color');
  const src = $('s-source');
  const labels = $('s-labels');
  const trails = $('s-trails');
  const metric = $('s-metric');
  mapSel.value = settings.mapStyle;
  color.value = settings.colorMode;
  src.value = settings.source;
  labels.checked = settings.labels;
  trails.checked = settings.allTrails;
  metric.checked = settings.metric;

  mapSel.addEventListener('change', () => {
    settings.mapStyle = mapSel.value;
    applyMapStyle();
    persist();
  });
  color.addEventListener('change', () => {
    settings.colorMode = color.value;
    renderLegend();
    persist();
  });
  src.addEventListener('change', () => {
    settings.source = src.value;
    persist();
    if (source?.mode !== 'demo') refresh();
  });
  labels.addEventListener('change', () => {
    settings.labels = labels.checked;
    persist();
  });
  trails.addEventListener('change', () => {
    settings.allTrails = trails.checked;
    persist();
  });
  metric.addEventListener('change', () => {
    settings.metric = metric.checked;
    syncFilters();
    renderStatus();
    persist();
  });
  $('s-demo').addEventListener('change', (e) => setDemo(e.target.checked));
}
bindSettings();

function renderLegend() {
  $('legend').hidden = settings.colorMode !== 'altitude';
  const stops = [];
  for (let alt = 0; alt <= 40000; alt += 2000) {
    stops.push(`hsl(${Math.round(altitudeHue(alt))} 85% 55%) ${(alt / 40000) * 100}%`);
  }
  document.querySelector('.legend-bar').style.background = `linear-gradient(to right, ${stops.join(', ')})`;
}
renderLegend();

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
    closePopovers();
    if (!typing) deselect();
  } else if (typing || e.metaKey || e.ctrlKey || e.altKey) {
    return;
  } else if (e.key === '/') {
    e.preventDefault();
    searchInput.focus();
  } else if (e.key === 'f' || e.key === 'F') {
    setFollowing(!following);
  }
});

document.addEventListener('mousedown', (e) => {
  const inside = e.target.closest('.popover, .tool');
  if (!inside) closePopovers();
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
      const res = await source.find('hex', hex, settings.source).catch(() => null);
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
