import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROVIDERS,
  parseReadsb,
  parseOpensky,
  validLookup,
  effectiveRadius,
} from '../public/js/shared/providers.js';
import { parseRoute, parsePhoto, parseAircraftInfo } from '../public/js/shared/enrich.js';
import { countryForHex, flagEmoji } from '../public/js/shared/countries.js';
import { distanceNm, destinationPoint, circleBounds, greatCirclePoints } from '../public/js/shared/geo.js';
import { READSB_SAMPLE, OPENSKY_SAMPLE, ADSBDB_ROUTE, PLANESPOTTERS } from './fixtures.js';

test('parseReadsb normalizes a readsb v2 response', () => {
  const list = parseReadsb(READSB_SAMPLE);
  assert.equal(list.length, 3, 'drops aircraft without a position or with a stale one');
  const [baw, ground, mil] = list;
  assert.deepEqual(baw, {
    hex: '4007f1',
    callsign: 'BAW283',
    reg: 'G-XWBA',
    type: 'A35K',
    desc: 'AIRBUS A-350-1000',
    operator: 'British Airways',
    lat: 51.3876,
    lon: -1.2101,
    posAge: 0.4,
    alt: 38000,
    onGround: false,
    gs: 487.3,
    track: 281.6,
    vrate: -64,
    squawk: '6421',
    emergency: '',
    category: 'A5',
    military: false,
    source: 'ADS-B',
    country: '',
  });
  assert.equal(ground.onGround, true);
  assert.equal(ground.alt, 0);
  assert.equal(ground.track, 92, 'falls back to true heading when track is missing');
  assert.equal(ground.source, 'MLAT');
  assert.equal(mil.military, true);
  assert.equal(mil.emergency, 'general');
});

test('parseReadsb accepts the "aircraft" key and empty lists, rejects errors', () => {
  assert.equal(parseReadsb({ aircraft: [READSB_SAMPLE.ac[0]] }).length, 1);
  assert.deepEqual(parseReadsb({ ac: [], msg: 'No error' }), []);
  assert.deepEqual(parseReadsb({ ac: null }), []);
  assert.throws(() => parseReadsb({ msg: 'Invalid radius' }), /Invalid radius/);
  assert.throws(() => parseReadsb('nope'));
});

test('parseOpensky converts state vectors to feet and knots', () => {
  const [a, b] = parseOpensky(OPENSKY_SAMPLE);
  assert.equal(a.hex, '3c6444');
  assert.equal(a.callsign, 'DLH9LF');
  assert.equal(a.country, 'Germany');
  assert.equal(a.alt, Math.round(11277.6 * 3.28084));
  assert.equal(a.gs, Number((236.5 * 1.943844).toFixed(1)));
  assert.equal(a.vrate, 0);
  assert.equal(a.posAge, 2);
  assert.equal(a.category, 'A3');
  assert.equal(a.source, 'ADS-B');
  assert.equal(b.onGround, true);
  assert.equal(b.alt, 0);
  assert.equal(parseOpensky(OPENSKY_SAMPLE).length, 2, 'drops states without a position');
  assert.deepEqual(parseOpensky({ time: 1, states: null }), []);
});

test('provider URLs', () => {
  assert.equal(PROVIDERS.adsblol.areaUrl(51.47, -0.45, 120), 'https://api.adsb.lol/v2/point/51.4700/-0.4500/120');
  assert.equal(PROVIDERS.adsblol.lookupUrl('callsign', 'BAW1'), 'https://api.adsb.lol/v2/callsign/BAW1');
  assert.equal(PROVIDERS.adsbfi.areaUrl(1, 2, 3), 'https://opendata.adsb.fi/api/v3/lat/1.0000/lon/2.0000/dist/3');
  assert.equal(PROVIDERS.adsbfi.lookupUrl('reg', 'G-XWBA'), 'https://opendata.adsb.fi/api/v2/registration/G-XWBA');
  assert.match(PROVIDERS.opensky.areaUrl(50, 10, 60), /lamin=49\.0000&lomin=8\.4\d+&lamax=51\.0000&lomax=11\.5\d+/);
  assert.equal(PROVIDERS.opensky.lookupUrl('callsign', 'X'), null);
  assert.equal(effectiveRadius(PROVIDERS.adsblol, 900), 250);
  assert.equal(effectiveRadius(PROVIDERS.adsblol, 12.2), 13);
});

test('validLookup', () => {
  assert.equal(validLookup('hex', '4CA7B5'), '4ca7b5');
  assert.equal(validLookup('hex', '~2b3c4d'), '~2b3c4d');
  assert.equal(validLookup('hex', 'xyz'), null);
  assert.equal(validLookup('callsign', 'baw283'), 'BAW283');
  assert.equal(validLookup('callsign', 'BAW 283'), null);
  assert.equal(validLookup('reg', 'g-xwba'), 'G-XWBA');
  assert.equal(validLookup('reg', '../etc'), null);
  assert.equal(validLookup('squawk', '7700'), null);
});

test('enrichment parsers', () => {
  const r = parseRoute(ADSBDB_ROUTE);
  assert.equal(r.origin.iata, 'LHR');
  assert.equal(r.destination.iata, 'JFK');
  assert.equal(r.airline.name, 'British Airways');
  assert.equal(parseRoute({ response: 'unknown callsign' }), null);

  const p = parsePhoto(PLANESPOTTERS);
  assert.equal(p.photographer, 'Jane Spotter');
  assert.match(p.thumb, /^https:/);
  assert.equal(parsePhoto({ photos: [] }), null);
  assert.equal(parsePhoto({ photos: [{ thumbnail: { src: 'javascript:alert(1)' } }] }), null, 'only https URLs');

  const info = parseAircraftInfo({ response: { aircraft: { registered_owner: 'British Airways', url_photo: null } } });
  assert.equal(info.owner, 'British Airways');
  assert.equal(info.photo, null);
});

test('countries and geo helpers', () => {
  assert.deepEqual(countryForHex('4007f1'), { name: 'United Kingdom', code: 'GB' });
  assert.deepEqual(countryForHex('a12345'), { name: 'United States', code: 'US' });
  assert.equal(countryForHex('~123456'), null);
  assert.equal(flagEmoji('SE'), '🇸🇪');

  // London Heathrow → New York JFK is about 2,990 nm.
  assert.ok(Math.abs(distanceNm(51.47, -0.4543, 40.6413, -73.7781) - 2990) < 15);
  const [lat, lon] = destinationPoint(0, 0, 90, 60);
  assert.ok(Math.abs(lat) < 1e-9 && Math.abs(lon - 1) < 0.01);
  const b = circleBounds(89.5, 0, 120);
  assert.equal(b.north, 90);
  const gc = greatCirclePoints(10, 170, 10, -170, 8);
  assert.ok(gc.every(([, lo], i) => i === 0 || Math.abs(lo - gc[i - 1][1]) < 10), 'continuous across the antimeridian');
});
