// The base maps, styled after Apple Maps: warm cream land with soft relief shading, bright aqua
// water, soft green parks, motorways as solid grey ribbons (the brightest roads at night) with
// route signs, white streets with cool grey edges, and airports in Apple's blue-grey with their
// runways and taxiways drawn. Colours follow samples taken from Apple's own map. Vector tiles of
// OpenStreetMap come from OpenFreeMap, in the OpenMapTiles schema; terrain comes from the free
// elevation tiles on AWS; labels are set in Inter, served with the app (see public/fonts).

export const VECTOR_TILES = 'https://tiles.openfreemap.org/planet';
const GLYPHS = `${typeof location === 'undefined' ? 'https://localhost/' : new URL('./', location.href).href}fonts/{fontstack}/{range}.pbf`;
const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">&copy; OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

// Heights of the land, encoded in the colours of PNG tiles. Beyond zoom 11 the shading is faint
// and smooth, so closer in the same tiles are enlarged instead of downloading finer ones.
const TERRAIN = {
  type: 'raster-dem',
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium',
  tileSize: 256,
  maxzoom: 11,
  attribution: 'Terrain <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">Mapzen and others</a>',
};

const REGULAR = ['Inter-Regular'];
const MEDIUM = ['Inter-Medium'];
const SEMIBOLD = ['Inter-SemiBold'];
const BOLD = ['Inter-Bold'];
const ITALIC = ['Inter-Italic'];

const PALETTES = {
  light: {
    land: '#f6f4eb',
    builtUp: '#fdf2dc',
    park: '#c6e9a8',
    wood: '#c2e5a5',
    water: '#8ddbf6',
    medical: '#fbebe8',
    sand: '#f6edcf',
    ice: '#ffffff',
    reliefShadow: 'rgba(96, 84, 64, 0.34)',
    reliefHighlight: 'rgba(255, 255, 255, 0.55)',
    reliefAccent: 'rgba(96, 84, 64, 0.14)',
    aerodrome: '#dbe5ee',
    apron: '#d1dce7',
    runway: '#bfcbd8',
    taxiway: '#c9d4df',
    runwayMark: '#ffffff',
    building: '#e7e4dc',
    buildingEdge: '#dbd7cc',
    motorwayLow: '#b3baca',
    motorway: '#b3b5b9',
    road: '#fefefe',
    majorEdge: '#ced1d4',
    minorEdge: '#e0e3e6',
    path: '#ffffff',
    rail: '#c8cacf',
    country: '#b1a9c0',
    countryGlow: 'rgba(190, 178, 214, 0.3)',
    state: '#d0cbd9',
    label: '#1d1d1f',
    townLabel: '#36363a',
    villageLabel: '#55585e',
    countryLabel: '#5d5a6e',
    stateLabel: '#8e8a9d',
    quietLabel: '#868a90',
    roadLabel: '#5f6368',
    waterLabel: '#2f88c0',
    parkLabel: '#2b8546',
    peakLabel: '#857560',
    airportLabel: '#3e5d80',
    halo: 'rgba(246, 244, 235, 0.92)',
    roadHalo: 'rgba(255, 255, 255, 0.95)',
    badge: '#3d84e8',
    shields: {
      green: { fill: '#1c8a4e', edge: '#ffffff', text: '#ffffff' },
      blue: { fill: '#2c64c6', edge: '#ffffff', text: '#ffffff' },
      white: { fill: '#ffffff', edge: '#c3c7cd', text: '#3b3f45' },
    },
  },
  dark: {
    land: '#34445b',
    builtUp: '#41486a',
    park: '#005d5b',
    wood: '#04534f',
    water: '#1a2b5e',
    medical: '#404458',
    sand: '#46506a',
    ice: '#566a86',
    reliefShadow: 'rgba(9, 15, 30, 0.4)',
    reliefHighlight: 'rgba(160, 184, 224, 0.1)',
    reliefAccent: 'rgba(9, 15, 30, 0.15)',
    aerodrome: '#314d76',
    apron: '#38567f',
    runway: '#5372a0',
    taxiway: '#486792',
    runwayMark: '#a9bddb',
    building: '#4a5876',
    buildingEdge: '#56658a',
    motorwayLow: '#8391ab',
    motorway: '#97a3ba',
    road: '#55647f',
    majorEdge: 'rgba(52, 68, 91, 0)', // at night roads have no edges, as in Apple's dark map
    minorEdge: 'rgba(52, 68, 91, 0)',
    path: '#4d5b75',
    rail: '#5a6883',
    country: '#8290ad',
    countryGlow: 'rgba(130, 146, 184, 0.12)',
    state: '#5a6883',
    label: '#e8eef6',
    townLabel: '#d5dfeb',
    villageLabel: '#b7c3d3',
    countryLabel: '#b8c3d6',
    stateLabel: '#8d9bb2',
    quietLabel: '#a1afc2',
    roadLabel: '#aab6c7',
    waterLabel: '#86a9e8',
    parkLabel: '#79d0bb',
    peakLabel: '#b2bccb',
    airportLabel: '#bdd0ea',
    halo: 'rgba(52, 68, 91, 0.9)',
    roadHalo: 'rgba(52, 68, 91, 0.9)',
    badge: '#4a8ef0',
    shields: {
      green: { fill: '#1e7c48', edge: 'rgba(255, 255, 255, 0.85)', text: '#ffffff' },
      blue: { fill: '#2e60bd', edge: 'rgba(255, 255, 255, 0.85)', text: '#ffffff' },
      white: { fill: '#58678a', edge: 'rgba(255, 255, 255, 0.3)', text: '#eef2f8' },
    },
  },
  satellite: {
    land: '#0e1a24',
    motorway: 'rgba(255, 222, 130, 0.62)',
    road: 'rgba(255, 255, 255, 0.4)',
    country: 'rgba(255, 255, 255, 0.8)',
    countryGlow: 'rgba(0, 0, 0, 0.3)',
    state: 'rgba(255, 255, 255, 0.45)',
    label: '#ffffff',
    townLabel: '#ffffff',
    villageLabel: 'rgba(255, 255, 255, 0.92)',
    countryLabel: '#ffffff',
    stateLabel: 'rgba(255, 255, 255, 0.82)',
    quietLabel: 'rgba(255, 255, 255, 0.88)',
    roadLabel: 'rgba(255, 255, 255, 0.92)',
    waterLabel: '#cbe6ff',
    parkLabel: '#d6f4cc',
    peakLabel: 'rgba(255, 255, 255, 0.9)',
    airportLabel: '#ffffff',
    halo: 'rgba(0, 0, 0, 0.6)',
    roadHalo: 'rgba(0, 0, 0, 0.6)',
    badge: '#3d84e8',
    shields: {
      green: { fill: '#1c8a4e', edge: '#ffffff', text: '#ffffff' },
      blue: { fill: '#2c64c6', edge: '#ffffff', text: '#ffffff' },
      white: { fill: '#ffffff', edge: 'rgba(0, 0, 0, 0.25)', text: '#3b3f45' },
    },
  },
};

// Zoom curves. Line widths grow exponentially, as features do on a real map.
const grow = (...stops) => ['interpolate', ['exponential', 1.5], ['zoom'], ...stops];
const lin = (...stops) => ['interpolate', ['linear'], ['zoom'], ...stops];
const NAME = ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
const LINES = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false];
const AREAS = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false];
const POINTS = ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false];
const RANK = ['coalesce', ['get', 'rank'], 99];
const tunnelFade = ['case', ['==', ['get', 'brunnel'], 'tunnel'], 0.45, 1];
/** A different value for the most important features: `rank` at or below `top`. */
const byRank = (top, big, small) => ['case', ['<=', RANK, top], big, small];

// Road classes from the most to the least important, with their widths (CSS px) by zoom.
const ROADS = [
  { id: 'path', classes: ['path'], min: 15, width: [15, 0.6, 18, 2] },
  { id: 'service', classes: ['service', 'track'], min: 14, width: [14, 0.6, 16, 2.5, 18, 7] },
  { id: 'minor', classes: ['minor'], min: 12, width: [12, 0.5, 14, 2, 16, 5.5, 18, 15] },
  { id: 'tertiary', classes: ['tertiary'], min: 11, width: [11, 0.5, 14, 2.8, 16, 7, 18, 18] },
  { id: 'secondary', classes: ['secondary'], min: 9, width: [9, 0.5, 12, 1.6, 14, 3.6, 16, 8.5, 18, 21] },
  { id: 'primary', classes: ['primary', 'trunk'], min: 6, width: [6, 0.5, 10, 1.6, 12, 2.8, 14, 5.4, 16, 11, 18, 26] },
  { id: 'motorway', classes: ['motorway'], min: 5, width: [5, 0.5, 8, 1, 10, 1.8, 12, 3, 14, 6.2, 16, 14, 18, 32] },
];

const RAMP_WIDTH = { 5: 0.3, 8: 0.5, 10: 0.8, 12: 1, 14: 2.6, 16: 6, 18: 14 };
/** One zoom curve whose value at each stop depends on whether the motorway piece is a ramp. */
function motorwayWidth(stops) {
  const out = ['interpolate', ['exponential', 1.5], ['zoom']];
  for (let i = 0; i < stops.length; i += 2) {
    out.push(stops[i], ['case', ['==', ['get', 'ramp'], 1], RAMP_WIDTH[stops[i]], stops[i + 1]]);
  }
  return out;
}

function roadLayers(C) {
  const layers = [];
  const filterFor = (r, extra = []) => ['all', LINES, ['match', ['get', 'class'], r.classes, true, false], ...extra];
  const edge = (r) => (r.id === 'primary' ? C.majorEdge : C.minorEdge);
  // Edges first, under every road, so crossings join cleanly. Motorways have none: Apple draws
  // them as a single solid ribbon.
  for (const r of ROADS) {
    if (r.id === 'motorway' || r.id === 'path') continue;
    const stops = r.width.map((v, i) => (i % 2 ? v + (r.width[i - 1] >= 14 ? 2 : 1) : v));
    layers.push({
      id: `road-${r.id}-edge`,
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: Math.max(r.min, r.id === 'primary' || r.id === 'secondary' ? 8 : 11),
      filter: filterFor(r, [['!=', ['get', 'ramp'], 1]]),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': edge(r), 'line-width': grow(...stops), 'line-opacity': tunnelFade },
    });
  }
  for (const r of ROADS) {
    const motorway = r.id === 'motorway';
    layers.push({
      id: `road-${r.id}`,
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: r.min,
      filter: filterFor(r),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': motorway ? lin(10, C.motorwayLow, 14, C.motorway) : r.id === 'path' ? C.path : C.road,
        // Motorway ramps are drawn about as narrow as a secondary road.
        'line-width': motorway ? motorwayWidth(r.width) : grow(...r.width),
        'line-opacity': r.id === 'path' ? 0.75 : tunnelFade,
      },
    });
  }
  return layers;
}

/** The complete MapLibre style for the light, dark or satellite map. */
export function vectorStyle(theme) {
  if (theme === 'satellite') return satelliteStyle();
  const C = PALETTES[theme] || PALETTES.light;
  return {
    version: 8,
    name: `Tracker ${theme}`,
    glyphs: GLYPHS,
    sources: {
      omt: { type: 'vector', url: VECTOR_TILES, attribution: ATTRIBUTION },
      terrain: TERRAIN,
    },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': C.land } },

      // ── Ground cover ──
      {
        // Towns and cities: a warm tint that shows where people live from regional zoom.
        id: 'built-up',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landuse',
        minzoom: 5,
        filter: ['match', ['get', 'class'], ['residential', 'suburb', 'neighbourhood', 'commercial', 'retail', 'industrial', 'garages'], true, false],
        paint: { 'fill-antialias': false, 'fill-color': C.builtUp, 'fill-opacity': lin(5, 0.55, 9, 0.8, 13, 1) },
      },
      {
        id: 'wood',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landcover',
        filter: ['==', ['get', 'class'], 'wood'],
        paint: { 'fill-antialias': false, 'fill-color': C.wood, 'fill-opacity': lin(4, 0.35, 10, 0.55, 14, 0.7) },
      },
      {
        id: 'grass',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landcover',
        minzoom: 9,
        filter: ['match', ['get', 'class'], ['grass', 'wetland'], true, false],
        paint: { 'fill-antialias': false, 'fill-color': C.park, 'fill-opacity': 0.6 },
      },
      {
        id: 'park',
        type: 'fill',
        source: 'omt',
        'source-layer': 'park',
        filter: AREAS,
        paint: { 'fill-antialias': false, 'fill-color': C.park, 'fill-opacity': lin(5, 0.6, 10, 1) },
      },
      {
        id: 'green-landuse',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landuse',
        minzoom: 12,
        filter: ['match', ['get', 'class'], ['cemetery', 'pitch', 'stadium', 'playground', 'zoo'], true, false],
        paint: { 'fill-antialias': false, 'fill-color': C.park, 'fill-opacity': 0.75 },
      },
      {
        id: 'medical',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landuse',
        minzoom: 12,
        filter: ['==', ['get', 'class'], 'hospital'],
        paint: { 'fill-antialias': false, 'fill-color': C.medical },
      },
      {
        id: 'sand',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landcover',
        filter: ['match', ['get', 'class'], ['sand', 'beach'], true, false],
        paint: { 'fill-antialias': false, 'fill-color': C.sand },
      },
      {
        id: 'ice',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landcover',
        filter: ['==', ['get', 'class'], 'ice'],
        paint: { 'fill-antialias': false, 'fill-color': C.ice, 'fill-opacity': 0.9 },
      },

      // ── Relief: mountains and valleys shaded as if lit from the north-west, strongest when
      // zoomed out and fading away over the flat detail of a city ──
      {
        id: 'relief',
        type: 'hillshade',
        source: 'terrain',
        maxzoom: 16,
        paint: {
          'hillshade-method': 'combined',
          'hillshade-exaggeration': lin(0, 0.6, 6, 0.6, 10, 0.5, 13, 0.3, 15, 0.12),
          'hillshade-shadow-color': C.reliefShadow,
          'hillshade-highlight-color': C.reliefHighlight,
          'hillshade-accent-color': C.reliefAccent,
          'hillshade-illumination-direction': 315,
          'hillshade-illumination-anchor': 'viewport',
        },
      },

      // ── Airports: Apple's blue-grey ground, with aprons, runways and taxiways ──
      {
        id: 'aerodrome',
        type: 'fill',
        source: 'omt',
        'source-layer': 'aeroway',
        minzoom: 10,
        filter: ['all', AREAS, ['match', ['get', 'class'], ['aerodrome', 'heliport'], true, false]],
        paint: { 'fill-antialias': false, 'fill-color': C.aerodrome, 'fill-opacity': lin(10, 0.7, 11, 1) },
      },
      {
        id: 'apron',
        type: 'fill',
        source: 'omt',
        'source-layer': 'aeroway',
        minzoom: 12,
        filter: ['all', AREAS, ['match', ['get', 'class'], ['apron', 'helipad'], true, false]],
        paint: { 'fill-antialias': false, 'fill-color': C.apron },
      },

      // ── Water ──
      {
        id: 'water',
        type: 'fill',
        source: 'omt',
        'source-layer': 'water',
        filter: ['!=', ['get', 'brunnel'], 'tunnel'],
        paint: { 'fill-color': C.water },
      },
      {
        id: 'river',
        type: 'line',
        source: 'omt',
        'source-layer': 'waterway',
        minzoom: 8,
        filter: ['all', ['!=', ['get', 'brunnel'], 'tunnel'], ['==', ['get', 'class'], 'river']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': C.water, 'line-width': grow(8, 0.6, 12, 1.6, 14, 3, 18, 12) },
      },
      {
        id: 'stream',
        type: 'line',
        source: 'omt',
        'source-layer': 'waterway',
        minzoom: 12,
        filter: ['all', ['!=', ['get', 'brunnel'], 'tunnel'], ['!=', ['get', 'class'], 'river']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': C.water, 'line-width': grow(12, 0.4, 14, 1, 18, 4) },
      },

      {
        id: 'runway-area',
        type: 'fill',
        source: 'omt',
        'source-layer': 'aeroway',
        minzoom: 11,
        filter: ['all', AREAS, ['match', ['get', 'class'], ['runway', 'taxiway'], true, false]],
        paint: { 'fill-antialias': false, 'fill-color': C.runway },
      },
      {
        id: 'taxiway',
        type: 'line',
        source: 'omt',
        'source-layer': 'aeroway',
        minzoom: 12,
        filter: ['all', LINES, ['==', ['get', 'class'], 'taxiway']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        // About 20 m wide, to scale (MapLibre zoom levels: tiles are 512 px).
        paint: { 'line-color': C.taxiway, 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 12, 1.2, 18, 77] },
      },
      {
        id: 'runway',
        type: 'line',
        source: 'omt',
        'source-layer': 'aeroway',
        minzoom: 10,
        filter: ['all', LINES, ['==', ['get', 'class'], 'runway']],
        // About 55 m wide, to scale, but never thinner than a fine line.
        paint: { 'line-color': C.runway, 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 10, 1.4, 12, 4, 18, 256] },
      },

      {
        id: 'runway-centreline',
        type: 'line',
        source: 'omt',
        'source-layer': 'aeroway',
        minzoom: 13,
        filter: ['all', LINES, ['==', ['get', 'class'], 'runway']],
        paint: {
          'line-color': C.runwayMark,
          'line-width': ['interpolate', ['exponential', 2], ['zoom'], 13, 0.6, 18, 4],
          'line-dasharray': [5, 4],
          'line-opacity': lin(13, 0, 14, 0.9),
        },
      },

      // ── Roads and rail ──
      {
        id: 'rail',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        minzoom: 12,
        filter: ['all', LINES, ['==', ['get', 'class'], 'rail'], ['!=', ['get', 'brunnel'], 'tunnel']],
        paint: { 'line-color': C.rail, 'line-width': lin(12, 0.6, 16, 1.6) },
      },
      ...roadLayers(C),

      // ── Buildings ──
      {
        id: 'building',
        type: 'fill',
        source: 'omt',
        'source-layer': 'building',
        minzoom: 13,
        paint: { 'fill-color': C.building, 'fill-outline-color': C.buildingEdge, 'fill-opacity': lin(13, 0, 14.5, 1) },
      },

      ...overlayLayers(C, theme),
    ],
  };
}

// The sign colour of a road's number: green for the European E-roads (as on their signs), blue
// for other motorways and white for main roads. Only the first of several numbers is shown.
const REF = ['let', 'ref', ['get', 'ref'], ['let', 'cut', ['index-of', ';', ['var', 'ref']],
  ['case', ['>', ['var', 'cut'], 0], ['slice', ['var', 'ref'], 0, ['var', 'cut']], ['var', 'ref']]]];
const SHIELD = [
  'case',
  ['any', ['==', ['get', 'network'], 'e-road'], ['all', ['==', ['slice', ['get', 'ref'], 0, 1], 'E'], ['!=', ['to-number', ['slice', ['get', 'ref'], 1, 2], -1], -1]]], 'green',
  ['==', ['get', 'class'], 'motorway'], 'blue',
  'white',
];

/** Borders and every label: shared by the light, dark and satellite maps, each in its own colours. */
function overlayLayers(C, theme) {
  const halo = { 'text-halo-color': C.halo, 'text-halo-width': 1.5, 'text-halo-blur': 0.25 };
  const nationalBorder = ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]];
  return [
  // ── Borders: a soft band of colour under a fine line, dashed where disputed ──
  {
    id: 'country-border-glow',
    type: 'line',
    source: 'omt',
    'source-layer': 'boundary',
    minzoom: 2,
    filter: nationalBorder,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': C.countryGlow, 'line-width': lin(2, 2, 5, 5, 9, 9), 'line-blur': lin(2, 1, 9, 3) },
  },
  {
    id: 'state-border',
    type: 'line',
    source: 'omt',
    'source-layer': 'boundary',
    minzoom: 4,
    filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
    layout: { 'line-join': 'round' },
    paint: { 'line-color': C.state, 'line-width': lin(4, 0.5, 10, 1.2), 'line-dasharray': [3, 2] },
  },
  {
    id: 'country-border',
    type: 'line',
    source: 'omt',
    'source-layer': 'boundary',
    filter: ['all', nationalBorder, ['!=', ['get', 'disputed'], 1]],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': C.country, 'line-width': lin(1, 0.5, 5, 0.9, 10, 1.6) },
  },
  {
    id: 'disputed-border',
    type: 'line',
    source: 'omt',
    'source-layer': 'boundary',
    filter: ['all', nationalBorder, ['==', ['get', 'disputed'], 1]],
    layout: { 'line-join': 'round' },
    paint: { 'line-color': C.country, 'line-width': lin(1, 0.5, 5, 0.9, 10, 1.6), 'line-dasharray': [2, 2] },
  },

  // ── Labels ──
  {
    id: 'water-name',
    type: 'symbol',
    source: 'omt',
    'source-layer': 'water_name',
    filter: POINTS,
    layout: {
      'text-field': NAME,
      'text-font': ITALIC,
      'text-size': lin(0, ['match', ['get', 'class'], 'ocean', 12, 'sea', 12, 11.5], 4, ['match', ['get', 'class'], 'ocean', 15, 'sea', 12.5, 11.5]),
      'text-letter-spacing': ['match', ['get', 'class'], 'ocean', 0.12, 'sea', 0.08, 0.03],
      'text-max-width': ['match', ['get', 'class'], 'ocean', 6, 7],
      'text-line-height': 1.3,
    },
    paint: { 'text-color': C.waterLabel },
  },
  {
    id: 'river-name',
    type: 'symbol',
    source: 'omt',
    'source-layer': 'waterway',
    minzoom: 12,
    filter: ['==', ['get', 'class'], 'river'],
    layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': ITALIC, 'text-size': 11, 'text-letter-spacing': 0.08, 'symbol-spacing': 400 },
    paint: { 'text-color': C.waterLabel, 'text-halo-color': C.water ?? C.halo, 'text-halo-width': 0.6 },
  },
  {
    id: 'park-name',
    type: 'symbol',
    source: 'omt',
    'source-layer': 'park',
    minzoom: 13,
    filter: POINTS,
    layout: { 'text-field': NAME, 'text-font': MEDIUM, 'text-size': 11, 'text-max-width': 8 },
    paint: { 'text-color': C.parkLabel, ...halo },
  },
  {
    id: 'peak',
    type: 'symbol',
    source: 'omt',
    'source-layer': 'mountain_peak',
    minzoom: 11,
    filter: ['all', POINTS, ['has', 'name'], ['has', 'ele'], ['==', ['get', 'class'], 'peak']],
    layout: {
      'text-field': ['format', NAME, {}, '\n', {}, ['concat', ['to-string', ['get', 'ele']], ' m'], { 'font-scale': 0.85, 'text-font': ['literal', REGULAR] }],
      'text-font': MEDIUM,
      'text-size': 10.5,
      'text-max-width': 8,
      'text-line-height': 1.15,
      'symbol-sort-key': RANK,
    },
    paint: { 'text-color': C.peakLabel, ...halo },
  },
  {
    id: 'road-name',
    type: 'symbol',
    source: 'omt',
    'source-layer': 'transportation_name',
    minzoom: 13,
    filter: ['all', LINES, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor'], true, false]],
    layout: {
      'symbol-placement': 'line',
      'text-field': NAME,
      'text-font': MEDIUM,
      'text-size': lin(13, 10, 18, 13),
      'text-letter-spacing': 0.01,
      'symbol-spacing': 320,
    },
    paint: { 'text-color': C.roadLabel, 'text-halo-color': C.roadHalo, 'text-halo-width': 1.4 },
  },
  {
    // Route numbers on signs, as on the motorway itself.
    id: 'road-shield',
    type: 'symbol',
    source: 'omt',
    'source-layer': 'transportation_name',
    minzoom: 7,
    filter: ['all', LINES, ['has', 'ref'], ['<=', ['get', 'ref_length'], 6], ['match', ['get', 'class'], ['motorway', 'trunk'], true, false]],
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 360,
      'icon-image': ['concat', 'shield-', SHIELD, `-${theme}`],
      'icon-text-fit': 'both',
      'icon-text-fit-padding': [1, 3.5, 1, 3.5],
      'icon-rotation-alignment': 'viewport',
      'text-rotation-alignment': 'viewport',
      'text-field': REF,
      'text-font': BOLD,
      'text-size': lin(7, 9, 12, 10.5),
      'text-letter-spacing': 0.02,
      'symbol-sort-key': ['match', SHIELD, 'green', 0, 'blue', 1, 2],
    },
    paint: { 'text-color': ['match', SHIELD, 'green', C.shields.green.text, 'blue', C.shields.blue.text, C.shields.white.text] },
  },
  {
    id: 'airport',
    type: 'symbol',
    source: 'omt',
    'source-layer': 'aerodrome_label',
    minzoom: 6,
    // Big international airports from regional zoom, the rest once a region fills the screen.
    filter: ['all', ['has', 'iata'], ['any', ['>=', ['zoom'], 8], ['==', ['get', 'class'], 'international']]],
    layout: {
      'icon-image': `airport-badge-${theme}`,
      'icon-size': lin(6, 0.75, 12, 1),
      'text-field': ['format', NAME, {}, '\n', {}, ['get', 'iata'], { 'font-scale': 0.85, 'text-font': ['literal', MEDIUM] }],
      'text-font': SEMIBOLD,
      'text-size': lin(6, 10, 13, 12),
      'text-anchor': 'top',
      'text-offset': [0, 1.25],
      'text-max-width': 9,
      'text-line-height': 1.15,
      'text-optional': true,
      'symbol-sort-key': ['match', ['get', 'class'], 'international', 0, 1],
    },
    paint: { 'text-color': C.airportLabel, ...halo },
  },
  {
    id: 'neighbourhood',
    type: 'symbol',
    source: 'omt',
    'source-layer': 'place',
    minzoom: 12,
    filter: ['match', ['get', 'class'], ['suburb', 'quarter', 'neighbourhood'], true, false],
    layout: {
      'text-field': NAME,
      'text-font': SEMIBOLD,
      'text-size': lin(12, 9, 16, 11.5),
      'text-transform': 'uppercase',
      'text-letter-spacing': 0.1,
      'text-max-width': 8,
    },
    paint: { 'text-color': C.quietLabel, ...halo },
  },
  {
    id: 'village',
    type: 'symbol',
    source: 'omt',
    'source-layer': 'place',
    minzoom: 11,
    filter: ['match', ['get', 'class'], ['village', 'hamlet'], true, false],
    layout: {
      'text-field': NAME,
      'text-font': REGULAR,
      'text-size': lin(11, 10, 15, 12.5),
      'text-max-width': 8,
      'symbol-sort-key': RANK,
    },
    paint: { 'text-color': C.villageLabel, ...halo },
  },
  {
    id: 'town',
    type: 'symbol',
    source: 'omt',
    'source-layer': 'place',
    minzoom: 7,
    filter: ['==', ['get', 'class'], 'town'],
    layout: {
      'text-field': NAME,
      'text-font': MEDIUM,
      'text-size': lin(7, 10, 12, 13, 15, 15.5),
      'text-max-width': 8,
      'symbol-sort-key': RANK,
    },
    paint: { 'text-color': C.townLabel, ...halo },
  },
  {
    id: 'city',
    type: 'symbol',
    source: 'omt',
    'source-layer': 'place',
    minzoom: 3,
    filter: ['==', ['get', 'class'], 'city'],
    layout: {
      'text-field': NAME,
      // Capitals and the largest cities stand out in a heavier weight.
      'text-font': ['case', ['any', ['<=', RANK, 3], ['==', ['get', 'capital'], 2]], ['literal', SEMIBOLD], ['literal', MEDIUM]],
      'text-size': lin(3, byRank(3, 12, 10.5), 6, byRank(3, 14.5, 12.5), 9, byRank(3, 17.5, 15), 12, byRank(3, 21, 17)),
      'text-max-width': 8,
      'symbol-sort-key': RANK,
    },
    paint: { 'text-color': C.label, ...halo },
  },
  {
    id: 'state',
    type: 'symbol',
    source: 'omt',
    'source-layer': 'place',
    minzoom: 4,
    maxzoom: 9,
    filter: ['==', ['get', 'class'], 'state'],
    layout: {
      'text-field': NAME,
      'text-font': MEDIUM,
      'text-size': lin(4, 9, 8, 11),
      'text-transform': 'uppercase',
      'text-letter-spacing': 0.14,
      'text-max-width': 8,
      'symbol-sort-key': RANK,
    },
    paint: { 'text-color': C.stateLabel, ...halo },
  },
  {
    id: 'country',
    type: 'symbol',
    source: 'omt',
    'source-layer': 'place',
    minzoom: 1,
    maxzoom: 9,
    filter: ['==', ['get', 'class'], 'country'],
    layout: {
      'text-field': NAME,
      'text-font': SEMIBOLD,
      'text-transform': 'uppercase',
      'text-size': lin(1, byRank(2, 10, 8.5), 3, byRank(2, 12, 10), 5, byRank(2, 14.5, 12), 8, byRank(2, 17, 14)),
      'text-letter-spacing': 0.1,
      'text-max-width': 6.5,
      'symbol-sort-key': RANK,
    },
    paint: { 'text-color': C.countryLabel, ...halo },
  },
  ];
}

// Satellite: Esri World Imagery, the sharpest imagery free to use without a key. Tiles are drawn at
// half their size (128 px) so phones get one image pixel per screen pixel instead of a blurry
// enlargement. Over it, as in Apple's satellite view, borders, labels and faint main roads.
const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export function satelliteStyle() {
  const C = PALETTES.satellite;
  return {
    version: 8,
    name: 'Tracker satellite',
    glyphs: GLYPHS,
    sources: {
      imagery: {
        type: 'raster',
        tiles: [SATELLITE_TILES],
        tileSize: 128,
        maxzoom: 19,
        attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
      },
      omt: { type: 'vector', url: VECTOR_TILES, attribution: ATTRIBUTION },
    },
    layers: [
      { id: 'space', type: 'background', paint: { 'background-color': C.land } },
      { id: 'imagery', type: 'raster', source: 'imagery', paint: { 'raster-fade-duration': 0 } },
      {
        id: 'sat-motorway',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        minzoom: 6,
        filter: ['all', LINES, ['match', ['get', 'class'], ['motorway', 'trunk'], true, false], ['!=', ['get', 'brunnel'], 'tunnel']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': C.motorway, 'line-width': grow(6, 0.5, 10, 1.1, 14, 2.6, 18, 8) },
      },
      {
        id: 'sat-road',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        minzoom: 10,
        filter: ['all', LINES, ['match', ['get', 'class'], ['primary', 'secondary'], true, false], ['!=', ['get', 'brunnel'], 'tunnel']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': C.road, 'line-width': grow(10, 0.4, 14, 1.6, 18, 6) },
      },
      ...overlayLayers(C, 'satellite'),
    ],
  };
}

// ── Images the styles ask for ─────────────────────────────────────────────

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c.getContext('2d');
}

/**
 * Apple-style airport badge: a round blue badge with a white aircraft, drawn on a canvas and
 * handed to MapLibre as an image (2× for sharp edges).
 */
function airportBadge(theme) {
  const C = PALETTES[theme] || PALETTES.light;
  const scale = 2;
  const size = 22 * scale;
  const ctx = canvas(size, size);
  const r = size / 2;
  ctx.beginPath();
  ctx.arc(r, r, r - scale, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r, r, r - scale * 2.2, 0, Math.PI * 2);
  ctx.fillStyle = C.badge;
  ctx.fill();
  const plane = new Path2D(
    'M16 1C17 1 17.6 2.4 17.6 4L17.6 11 30 18.5 30 20.5 17.6 16.5 17.4 25 21.5 28.2 21.5 29.8 16.6 28.6 16 30.5 15.4 28.6 10.5 29.8 10.5 28.2 14.6 25 14.4 16.5 2 20.5 2 18.5 14.4 11 14.4 4C14.4 2.4 15 1 16 1Z',
  );
  ctx.translate(r, r);
  ctx.rotate(Math.PI / 4);
  const k = (size * 0.52) / 32;
  ctx.scale(k, k);
  ctx.translate(-16, -16);
  ctx.fillStyle = '#ffffff';
  ctx.fill(plane);
  return { image: ctx.getImageData(0, 0, size, size), options: { pixelRatio: scale } };
}

/**
 * A route-number sign: a rounded plate with a fine rim. MapLibre stretches its straight middle
 * to fit the number it carries (sizes here are in image pixels, at 2×).
 */
function shield(kind, theme) {
  const S = (PALETTES[theme] || PALETTES.light).shields[kind];
  const w = 40;
  const h = 32;
  const ctx = canvas(w, h);
  const plate = (inset, r) => {
    const [x0, y0, x1, y1] = [inset, inset, w - inset, h - inset];
    ctx.beginPath();
    ctx.moveTo(x0 + r, y0);
    ctx.arcTo(x1, y0, x1, y1, r);
    ctx.arcTo(x1, y1, x0, y1, r);
    ctx.arcTo(x0, y1, x0, y0, r);
    ctx.arcTo(x0, y0, x1, y0, r);
    ctx.closePath();
  };
  plate(1, 9);
  ctx.fillStyle = S.edge;
  ctx.fill();
  plate(3, 7);
  ctx.fillStyle = S.fill;
  ctx.fill();
  return {
    image: ctx.getImageData(0, 0, w, h),
    options: { pixelRatio: 2, stretchX: [[10, 30]], stretchY: [[10, 22]], content: [3, 3, w - 3, h - 3] },
  };
}

/** The image a style asks for by name (`airport-badge-dark`, `shield-green-light`), or null. */
export function styleImage(id) {
  let m = /^airport-badge-(light|dark|satellite)$/.exec(id);
  if (m) return airportBadge(m[1]);
  m = /^shield-(green|blue|white)-(light|dark|satellite)$/.exec(id);
  if (m) return shield(m[1], m[2]);
  return null;
}

/** Land colour of each style, shown behind the map while it loads. */
export const LAND = { light: PALETTES.light.land, dark: PALETTES.dark.land, satellite: PALETTES.satellite.land };
