// The base map, styled after Apple Maps: warm cream land, bright aqua water, soft green parks,
// motorways as solid grey ribbons (the brightest roads at night), white streets with cool grey
// edges, and airports in Apple's blue-grey with their runways and taxiways drawn. Colours follow
// samples taken from Apple's own map. Vector tiles of OpenStreetMap come from OpenFreeMap, in the
// OpenMapTiles schema; labels use Noto Sans from the same server.

export const VECTOR_TILES = 'https://tiles.openfreemap.org/planet';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">&copy; OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

const REGULAR = ['Noto Sans Regular'];
const ITALIC = ['Noto Sans Italic'];

const PALETTES = {
  light: {
    land: '#f6f4eb',
    builtUp: '#fef4df',
    park: '#c6e9a8',
    wood: '#bfe5a3',
    water: '#8ddbf6',
    medical: '#fbebe8',
    sand: '#f6edcf',
    ice: '#ffffff',
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
    country: '#bcb6c8',
    state: '#d2ced9',
    label: '#222222',
    countryLabel: '#6b6f76',
    quietLabel: '#747979',
    roadLabel: '#6c7075',
    waterLabel: '#2f88c0',
    parkLabel: '#1f823d',
    airportLabel: '#3e5d80',
    halo: 'rgba(246, 244, 235, 0.92)',
    roadHalo: 'rgba(255, 255, 255, 0.95)',
    badge: '#3d84e8',
  },
  dark: {
    land: '#34445b',
    builtUp: '#45476e',
    park: '#005d5b',
    wood: '#04534f',
    water: '#1c347a',
    medical: '#404458',
    sand: '#46506a',
    ice: '#566a86',
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
    country: '#7c89a5',
    state: '#5a6883',
    label: '#dae4ed',
    countryLabel: '#b3bfcf',
    quietLabel: '#a5b4c6',
    roadLabel: '#aab6c7',
    waterLabel: '#86a9e8',
    parkLabel: '#79d0bb',
    airportLabel: '#bdd0ea',
    halo: 'rgba(52, 68, 91, 0.9)',
    roadHalo: 'rgba(52, 68, 91, 0.9)',
    badge: '#4a8ef0',
  },
};

// Zoom curves. Line widths grow exponentially, as features do on a real map.
const grow = (...stops) => ['interpolate', ['exponential', 1.5], ['zoom'], ...stops];
const lin = (...stops) => ['interpolate', ['linear'], ['zoom'], ...stops];
const NAME = ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
const LINES = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false];
const AREAS = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false];
const POINTS = ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false];
const tunnelFade = ['case', ['==', ['get', 'brunnel'], 'tunnel'], 0.45, 1];

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

/** The complete MapLibre style for the light or dark map. */
export function vectorStyle(theme) {
  const C = PALETTES[theme] || PALETTES.light;
  const halo = { 'text-halo-color': C.halo, 'text-halo-width': 1.4, 'text-halo-blur': 0.4 };
  return {
    version: 8,
    name: `Tracker ${theme}`,
    glyphs: GLYPHS,
    sources: { omt: { type: 'vector', url: VECTOR_TILES, attribution: ATTRIBUTION } },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': C.land } },

      // ── Ground cover ──
      {
        id: 'built-up',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landuse',
        minzoom: 10,
        filter: ['match', ['get', 'class'], ['residential', 'suburb', 'neighbourhood', 'commercial', 'retail', 'industrial', 'garages'], true, false],
        paint: { 'fill-color': C.builtUp, 'fill-opacity': lin(10, 0, 13, 1) },
      },
      {
        id: 'wood',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landcover',
        filter: ['==', ['get', 'class'], 'wood'],
        paint: { 'fill-color': C.wood, 'fill-opacity': lin(4, 0.35, 10, 0.55, 14, 0.7) },
      },
      {
        id: 'grass',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landcover',
        minzoom: 9,
        filter: ['match', ['get', 'class'], ['grass', 'wetland'], true, false],
        paint: { 'fill-color': C.park, 'fill-opacity': 0.6 },
      },
      {
        id: 'park',
        type: 'fill',
        source: 'omt',
        'source-layer': 'park',
        filter: AREAS,
        paint: { 'fill-color': C.park, 'fill-opacity': lin(5, 0.6, 10, 1) },
      },
      {
        id: 'green-landuse',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landuse',
        minzoom: 12,
        filter: ['match', ['get', 'class'], ['cemetery', 'pitch', 'stadium', 'playground', 'zoo'], true, false],
        paint: { 'fill-color': C.park, 'fill-opacity': 0.75 },
      },
      {
        id: 'medical',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landuse',
        minzoom: 12,
        filter: ['==', ['get', 'class'], 'hospital'],
        paint: { 'fill-color': C.medical },
      },
      {
        id: 'sand',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landcover',
        filter: ['match', ['get', 'class'], ['sand', 'beach'], true, false],
        paint: { 'fill-color': C.sand },
      },
      {
        id: 'ice',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landcover',
        filter: ['==', ['get', 'class'], 'ice'],
        paint: { 'fill-color': C.ice, 'fill-opacity': 0.9 },
      },

      // ── Airports: Apple's blue-grey ground, with aprons, runways and taxiways ──
      {
        id: 'aerodrome',
        type: 'fill',
        source: 'omt',
        'source-layer': 'aeroway',
        minzoom: 10,
        filter: ['all', AREAS, ['match', ['get', 'class'], ['aerodrome', 'heliport'], true, false]],
        paint: { 'fill-color': C.aerodrome, 'fill-opacity': lin(10, 0.7, 11, 1) },
      },
      {
        id: 'apron',
        type: 'fill',
        source: 'omt',
        'source-layer': 'aeroway',
        minzoom: 12,
        filter: ['all', AREAS, ['match', ['get', 'class'], ['apron', 'helipad'], true, false]],
        paint: { 'fill-color': C.apron },
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
        paint: { 'fill-color': C.runway },
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

      // ── Borders ──
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
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': C.country, 'line-width': lin(2, 0.6, 6, 1.1, 10, 1.8) },
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
          'text-size': ['match', ['get', 'class'], 'ocean', 15, 'sea', 13, 12],
          'text-letter-spacing': ['match', ['get', 'class'], ['ocean', 'sea'], 0.12, 0.04],
          'text-max-width': 7,
        },
        paint: { 'text-color': C.waterLabel },
      },
      {
        id: 'river-name',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'waterway',
        minzoom: 13,
        filter: ['==', ['get', 'class'], 'river'],
        layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': ITALIC, 'text-size': 11, 'text-letter-spacing': 0.06 },
        paint: { 'text-color': C.waterLabel },
      },
      {
        id: 'park-name',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'park',
        minzoom: 13,
        filter: POINTS,
        layout: { 'text-field': NAME, 'text-font': REGULAR, 'text-size': 11, 'text-max-width': 8 },
        paint: { 'text-color': C.parkLabel, ...halo },
      },
      {
        id: 'road-name',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'transportation_name',
        minzoom: 13,
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor'], true, false],
        layout: {
          'symbol-placement': 'line',
          'text-field': NAME,
          'text-font': REGULAR,
          'text-size': lin(13, 10, 18, 13),
          'text-letter-spacing': 0.02,
          'symbol-spacing': 320,
        },
        paint: { 'text-color': C.roadLabel, 'text-halo-color': C.roadHalo, 'text-halo-width': 1.4 },
      },
      {
        id: 'airport',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'aerodrome_label',
        minzoom: 8,
        filter: ['has', 'iata'],
        layout: {
          'icon-image': `airport-badge-${theme}`,
          'icon-size': lin(8, 0.8, 12, 1),
          'text-field': ['format', NAME, {}, '\n', {}, ['get', 'iata'], { 'font-scale': 0.85 }],
          'text-font': REGULAR,
          'text-size': lin(8, 10.5, 13, 12.5),
          'text-anchor': 'top',
          'text-offset': [0, 1.3],
          'text-max-width': 9,
          'text-optional': true,
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
          'text-font': REGULAR,
          'text-size': lin(12, 9.5, 16, 12),
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.12,
          'text-max-width': 8,
        },
        paint: { 'text-color': C.quietLabel, ...halo },
      },
      {
        id: 'village',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        minzoom: 12,
        filter: ['match', ['get', 'class'], ['village', 'hamlet'], true, false],
        layout: {
          'text-field': NAME,
          'text-font': REGULAR,
          'text-size': lin(12, 10, 15, 12.5),
          'text-max-width': 8,
          'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
        },
        paint: { 'text-color': C.quietLabel, ...halo },
      },
      {
        id: 'town',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        minzoom: 8,
        filter: ['==', ['get', 'class'], 'town'],
        layout: {
          'text-field': NAME,
          'text-font': REGULAR,
          'text-size': lin(8, 10.5, 12, 13, 15, 15.5),
          'text-max-width': 8,
          'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
        },
        paint: { 'text-color': C.label, ...halo },
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
          'text-font': REGULAR,
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            4, ['case', ['<=', ['coalesce', ['get', 'rank'], 99], 3], 13, 11],
            8, ['case', ['<=', ['coalesce', ['get', 'rank'], 99], 3], 17, 14],
            12, ['case', ['<=', ['coalesce', ['get', 'rank'], 99], 3], 21, 17],
          ],
          'text-max-width': 8,
          'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
        },
        paint: { 'text-color': C.label, ...halo },
      },
      {
        id: 'state',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        minzoom: 5,
        maxzoom: 9,
        filter: ['==', ['get', 'class'], 'state'],
        layout: {
          'text-field': NAME,
          'text-font': REGULAR,
          'text-size': lin(5, 9.5, 8, 11.5),
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.14,
          'text-max-width': 9,
        },
        paint: { 'text-color': C.quietLabel, ...halo },
      },
      {
        id: 'country',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        minzoom: 2,
        maxzoom: 8,
        filter: ['==', ['get', 'class'], 'country'],
        layout: {
          'text-field': NAME,
          'text-font': REGULAR,
          'text-size': lin(2, ['case', ['<=', ['coalesce', ['get', 'rank'], 9], 2], 13, 11], 6, ['case', ['<=', ['coalesce', ['get', 'rank'], 9], 2], 18, 14]),
          'text-letter-spacing': 0.06,
          'text-max-width': 7,
          'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
        },
        paint: { 'text-color': C.countryLabel, ...halo },
      },
    ],
  };
}

/**
 * Apple-style airport badge: a round blue badge with a white aircraft, drawn on a canvas and
 * handed to MapLibre as an image (2× for sharp edges).
 */
export function airportBadge(theme) {
  const C = PALETTES[theme] || PALETTES.light;
  const scale = 2;
  const size = 22 * scale;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
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
  return { image: ctx.getImageData(0, 0, size, size), pixelRatio: scale };
}

/** Land colour of each style, shown behind the map while it loads. */
export const LAND = { light: PALETTES.light.land, dark: PALETTES.dark.land };
