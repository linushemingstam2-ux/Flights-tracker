// Weather on the map. Overlays drawn between the map and the aircraft: rain radar from RainViewer
// (the newest frame of its free radar, refreshed every five minutes) or clouds from EUMETSAT's ring
// of geostationary satellites. And live conditions from Open-Meteo: for the area in view, and at a
// flight's destination.

const L = globalThis.L; // Leaflet, loaded by the page

const RAINVIEWER = 'https://api.rainviewer.com/public/weather-maps.json';
const EUMETSAT_WMS = 'https://view.eumetsat.int/geoserver/wms';
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

// ── Overlays ──────────────────────────────────────────────────────────────

/** Address of RainViewer's newest radar frame, from its index of frames. */
export function radarTileUrl(index) {
  const frames = index?.radar?.past;
  if (!index?.host || !frames?.length) return null;
  const newest = frames[frames.length - 1];
  // 256 px tiles, the "Universal Blue" colours (the free API's only scheme), smoothed, with snow.
  return `${index.host}${newest.path}/256/{z}/{x}/{y}/2/1_1.png`;
}

async function newestRadar() {
  const res = await fetch(RAINVIEWER, { cache: 'no-store' });
  if (!res.ok) throw new Error(`RainViewer answered ${res.status}`);
  const url = radarTileUrl(await res.json());
  if (!url) throw new Error('RainViewer has no radar frames');
  return url;
}

export class WeatherOverlay {
  /** `onFail(message)` is told when an overlay cannot be loaded. */
  constructor(map, { onFail }) {
    this.map = map;
    this.onFail = onFail;
    this.kind = 'off';
    this.layer = null;
    this.timer = 0;
    this.pane = map.getPane('weather') || map.createPane('weather');
    this.pane.style.zIndex = 420; // over the map, under the aircraft (450)
    this.pane.style.pointerEvents = 'none';
  }

  /** The base map's style: clouds are blended differently on the light map. */
  setMapStyle(style) {
    this.pane.dataset.map = style;
  }

  set(kind) {
    if (kind === this.kind) return;
    this.kind = kind;
    this.pane.dataset.kind = kind;
    this.clear();
    if (kind === 'rain') this.showRain();
    else if (kind === 'clouds') this.showClouds();
  }

  clear() {
    clearInterval(this.timer);
    this.timer = 0;
    if (this.layer) this.map.removeLayer(this.layer);
    this.layer = null;
  }

  async showRain() {
    let url;
    try {
      url = await newestRadar();
    } catch {
      if (this.kind === 'rain') this.onFail('Rain radar could not be loaded right now.');
      return;
    }
    if (this.kind !== 'rain' || this.layer) return;
    // The free radar goes up to zoom 7; closer in, those tiles are enlarged.
    this.layer = L.tileLayer(url, {
      pane: 'weather',
      opacity: 0.8,
      maxNativeZoom: 7,
      maxZoom: 18,
      attribution: '<a href="https://www.rainviewer.com/" target="_blank" rel="noopener">Weather data by RainViewer</a>',
    }).addTo(this.map);
    this.timer = setInterval(async () => {
      const next = await newestRadar().catch(() => null);
      if (next && this.kind === 'rain' && this.layer) this.layer.setUrl(next);
    }, 5 * 60 * 1000);
  }

  showClouds() {
    let loaded = 0;
    let failed = 0;
    // An infrared picture: cold cloud tops are white, the warm ground dark. Blending (see CSS)
    // keeps only the clouds.
    this.layer = L.tileLayer.wms(EUMETSAT_WMS, {
      layers: 'mumi:worldcloudmap_ir108',
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      pane: 'weather',
      maxNativeZoom: 7,
      maxZoom: 18,
      attribution: 'Clouds &copy; <a href="https://www.eumetsat.int" target="_blank" rel="noopener">EUMETSAT</a>',
    });
    this.layer.on('tileload', () => loaded++);
    this.layer.on('tileerror', () => {
      if (++failed === 6 && loaded === 0 && this.kind === 'clouds') this.onFail('Clouds could not be loaded right now.');
    });
    this.layer.addTo(this.map);
    // New satellite pictures arrive through the day: refresh now and then.
    this.timer = setInterval(() => this.layer?.setParams({ t: Math.floor(Date.now() / 900000) }), 15 * 60 * 1000);
  }
}

// ── Live conditions ───────────────────────────────────────────────────────

/** Open-Meteo's answer, reduced to what the app shows. Wind in knots, as everywhere in aviation. */
export function parseCurrent(json) {
  const c = json?.current;
  if (!c || typeof c.temperature_2m !== 'number') throw new Error('No current weather in the answer');
  return {
    temp: c.temperature_2m,
    code: c.weather_code,
    isDay: c.is_day !== 0,
    cloud: c.cloud_cover,
    wind: c.wind_speed_10m,
    windDir: c.wind_direction_10m,
    gusts: c.wind_gusts_10m,
  };
}

const conditions = new Map(); // ~25 km cell → { at, promise }

/** Current weather near a point, shared by nearby requests for ten minutes. */
export function currentWeather(lat, lon) {
  const cLat = Math.round(lat * 4) / 4;
  const cLon = Math.round(lon * 4) / 4;
  const key = `${cLat},${cLon}`;
  const hit = conditions.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.promise;
  const params = new URLSearchParams({
    latitude: String(cLat),
    longitude: String(cLon),
    current: 'temperature_2m,weather_code,is_day,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    wind_speed_unit: 'kn',
  });
  const promise = fetch(`${OPEN_METEO}?${params}`)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Open-Meteo answered ${res.status}`))))
    .then(parseCurrent);
  conditions.set(key, { at: Date.now(), promise });
  promise.catch(() => conditions.delete(key));
  return promise;
}

/** Words and a symbol for a WMO weather code, as Open-Meteo reports it. */
export function describeWeather(code, isDay = true) {
  const day = (d, n) => (isDay ? d : n);
  if (code === 0) return { text: 'Clear', icon: day('sun', 'moon') };
  if (code === 1) return { text: 'Mostly clear', icon: day('sun', 'moon') };
  if (code === 2) return { text: 'Partly cloudy', icon: day('cloud-sun', 'cloud-moon') };
  if (code === 3) return { text: 'Cloudy', icon: 'cloud' };
  if (code === 45 || code === 48) return { text: 'Fog', icon: 'fog' };
  if (code >= 51 && code <= 55) return { text: 'Drizzle', icon: 'drizzle' };
  if (code === 56 || code === 57) return { text: 'Freezing drizzle', icon: 'drizzle' };
  if (code === 61) return { text: 'Light rain', icon: 'rain' };
  if (code === 63) return { text: 'Rain', icon: 'rain' };
  if (code === 65) return { text: 'Heavy rain', icon: 'rain' };
  if (code === 66 || code === 67) return { text: 'Freezing rain', icon: 'rain' };
  if (code >= 71 && code <= 77) return { text: code === 75 ? 'Heavy snow' : 'Snow', icon: 'snow' };
  if (code >= 80 && code <= 82) return { text: code === 82 ? 'Heavy showers' : 'Showers', icon: 'rain' };
  if (code === 85 || code === 86) return { text: 'Snow showers', icon: 'snow' };
  if (code >= 95) return { text: code === 95 ? 'Thunderstorms' : 'Thunderstorms with hail', icon: 'thunder' };
  return { text: 'Weather', icon: 'cloud' };
}

// Weather symbols in the manner of SF Symbols' multicolour set; colours come from CSS.
const CLOUD = 'M7.3 19.2h10.4a4.2 4.2 0 0 0 .6-8.36 6 6 0 0 0-11.55-1.5A4.95 4.95 0 0 0 7.3 19.2Z';
const SUN_RAYS = 'M12 2.4v2.1M12 19.5v2.1M2.4 12h2.1M19.5 12h2.1M5.2 5.2l1.5 1.5M17.3 17.3l1.5 1.5M5.2 18.8l1.5-1.5M17.3 6.7l1.5-1.5';
const high = (d) => `<path class="wx-cloud" transform="translate(0 -3.2)" d="${d}"/>`;
const SYMBOLS = {
  sun: `<circle class="wx-sun" cx="12" cy="12" r="4.3"/><path class="wx-ray" d="${SUN_RAYS}"/>`,
  moon: '<path class="wx-moon" d="M14.6 3.4a8.7 8.7 0 1 0 6 13.7 7.1 7.1 0 0 1-6-13.7Z"/>',
  cloud: `<path class="wx-cloud" d="${CLOUD}"/>`,
  'cloud-sun':
    '<circle class="wx-sun" cx="16.4" cy="7.4" r="3.2"/><path class="wx-ray" d="M16.4 1.9v1.3M21.9 7.4h-1.3M20.3 3.5l-.9.9M12.5 3.5l.9.9"/>' +
    `<path class="wx-cloud" transform="translate(-1.6 1.6) scale(.92)" d="${CLOUD}"/>`,
  'cloud-moon':
    '<path class="wx-moon" d="M17.5 2.6a4.9 4.9 0 1 0 4.4 7.3 4 4 0 0 1-4.4-7.3Z"/>' +
    `<path class="wx-cloud" transform="translate(-1.6 1.6) scale(.92)" d="${CLOUD}"/>`,
  fog: `${high(CLOUD)}<path class="wx-fog" d="M5 19.4h14M7.5 22.2h9"/>`,
  drizzle: `${high(CLOUD)}<path class="wx-drop" d="M8.6 19.6v.1M12.4 20.6v.1M16.2 19.6v.1M10.5 22.4v.1M14.3 22.4v.1"/>`,
  rain: `${high(CLOUD)}<path class="wx-drop" d="M8.9 19.1l-1.2 3M12.7 19.1l-1.2 3M16.5 19.1l-1.2 3"/>`,
  snow: `${high(CLOUD)}<path class="wx-flake" d="M8.4 19.4v.1M12 21.6v.1M15.6 19.4v.1M10.2 23v.1M13.8 23v.1"/>`,
  thunder: `${high(CLOUD)}<path class="wx-bolt" d="M12.9 16.6 9.7 21h2.6l-1.1 3.1 3.6-4.6h-2.6l1.3-2.9Z"/>`,
};

export function weatherIcon(name) {
  return `<svg class="wx-svg" viewBox="0 0 24 24" aria-hidden="true">${SYMBOLS[name] || SYMBOLS.cloud}</svg>`;
}

/** A small arrow pointing where the wind blows to (it is reported by where it comes from). */
export function windArrow(fromDeg) {
  const to = Math.round(((fromDeg ?? 0) + 180) % 360);
  return `<svg class="wx-arrow" viewBox="0 0 24 24" aria-hidden="true" style="transform: rotate(${to}deg)"><path d="M12 20V5M6.5 10.5 12 5l5.5 5.5"/></svg>`;
}
