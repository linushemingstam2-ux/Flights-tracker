import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SimSource, altitudeAt } from '../public/js/sim.js';
import { AIRPORTS, AIRLINES, TYPES, LOCAL_TYPES, LOCAL_REG } from '../public/js/sim-data.js';
import { countryForHex, hexRangeFor } from '../public/js/shared/countries.js';
import { distanceNm } from '../public/js/shared/geo.js';
import { modelIdFor } from '../public/js/aircraft-models.js';

const sim = new SimSource();
// A type with its own symbol draws the same whatever its category says (else the category picks).
const hasModel = (type) => modelIdFor({ type, category: 'A1' }) === modelIdFor({ type, category: 'A5' });

test('demo reference data is consistent', () => {
  const airports = new Set(AIRPORTS.map((a) => a[0]));
  assert.equal(airports.size, AIRPORTS.length, 'no duplicate airports');
  for (const [iata, icao, , , cc, lat, lon, size] of AIRPORTS) {
    assert.match(iata, /^[A-Z]{3}$/);
    assert.match(icao, /^[A-Z]{4}$/);
    assert.match(cc, /^[A-Z]{2}$/);
    assert.ok(Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && size >= 1 && size <= 3, iata);
  }
  const types = new Set(TYPES.map((t) => t[0]));
  for (const [type, , category, kt, ft, min, max] of TYPES) {
    assert.ok(kt > 200 && ft > 20000 && min < max, type);
    assert.ok(hasModel(type), `${type} has its own symbol`);
  }
  for (const [type] of LOCAL_TYPES) assert.ok(hasModel(type), `${type} has its own symbol`);
  for (const a of AIRLINES) {
    assert.match(a.icao, /^[A-Z]{3}$/);
    assert.ok(hexRangeFor(a.country), `${a.icao}: addresses for ${a.country}`);
    for (const hub of a.hubs.split(' ')) assert.ok(airports.has(hub), `${a.icao}: hub ${hub}`);
    for (const type of a.fleet.split(' ')) assert.ok(types.has(type), `${a.icao}: type ${type}`);
  }
  for (const cc of Object.keys(LOCAL_REG)) assert.ok(hexRangeFor(cc), `addresses for ${cc}`);
});

test('flights climb out, cruise and descend to land', () => {
  const f = { dist: 600, cruise: 37000 };
  assert.ok(altitudeAt(f, 1) < 2000, 'just after take-off');
  assert.equal(altitudeAt(f, 300), 37000, 'cruising');
  assert.ok(altitudeAt(f, 590) < 3500, 'on final approach');
  assert.equal(altitudeAt(f, 600), 0, 'landed');
  let prev = 0;
  for (let d = 0; d <= 200; d += 5) {
    const alt = altitudeAt(f, d);
    assert.ok(alt >= prev && alt <= 37000, `climbing at ${d} nm`);
    prev = alt;
  }
});

test('every airliner flies a real route for its airline', async () => {
  const { aircraft } = await sim.area(50, 5, 600);
  assert.ok(aircraft.length > 500, `busy over Europe (${aircraft.length})`);
  const airliners = aircraft.filter((a) => a.callsign);
  for (const ac of airliners.slice(0, 300)) {
    const route = await sim.route(ac.callsign);
    assert.ok(route, ac.callsign);
    assert.ok(ac.callsign.startsWith(route.airline.icao));
    assert.equal(ac.operator, route.airline.name);
    const { origin: o, destination: d } = route;
    const airline = AIRLINES.find((a) => a.icao === route.airline.icao);
    assert.ok(airline.hubs.includes(o.iata) || airline.hubs.includes(d.iata), `${ac.callsign} touches a hub`);
    // On the great circle between the two airports.
    const total = distanceNm(o.lat, o.lon, d.lat, d.lon);
    const via = distanceNm(o.lat, o.lon, ac.lat, ac.lon) + distanceNm(ac.lat, ac.lon, d.lat, d.lon);
    assert.ok(via - total < 2, `${ac.callsign} on its route`);
    assert.equal(countryForHex(ac.hex)?.code, airline.country, `${ac.callsign} registered in the airline's country`);
  }
  assert.equal(await sim.route('NONE123'), null);
});

test('landed flights are replaced by new departures', () => {
  const s = new SimSource();
  const size = s.flights.size;
  const start = s.last;
  for (let i = 1; i <= 120; i++) s._advance(start + i * 5000); // ten minutes
  assert.equal(s.flights.size, size);
  const departed = [...s.flights.values()].filter((f) => f.kind === 'airliner' && f.d < 40 && !f.landed);
  assert.ok(departed.length > 0, 'some flights have just taken off');
  for (const f of s.flights.values()) {
    if (f.kind !== 'airliner') continue;
    if (f.landed) assert.ok(f.alt === 0 && f.d >= f.dist, `${f.callsign} on the runway`);
    else assert.ok(f.d < f.dist && f.alt > 0, `${f.callsign} in the air`);
  }
});

test('a flight’s trail runs from its origin airport to where it is now', async () => {
  const { aircraft } = await sim.area(51.47, -0.45, 200);
  const ac = aircraft.find((a) => a.callsign && a.alt > 20000);
  const [trail, route] = await Promise.all([sim.trail(ac.hex), sim.route(ac.callsign)]);
  const first = trail[0];
  const last = trail[trail.length - 1];
  assert.ok(distanceNm(first.lat, first.lon, route.origin.lat, route.origin.lon) < 0.1);
  assert.equal(first.alt, 0);
  assert.ok(distanceNm(last.lat, last.lon, ac.lat, ac.lon) < 0.1);
  for (let i = 1; i < trail.length; i++) assert.ok(trail[i].t > trail[i - 1].t);
});

test('finds flights by callsign, registration and hex', async () => {
  const { aircraft } = await sim.area(40.7, -73.9, 200);
  const ac = aircraft.find((a) => a.callsign);
  for (const [kind, value] of [['callsign', ac.callsign], ['reg', ac.reg], ['hex', ac.hex]]) {
    const res = await sim.find(kind, value);
    assert.equal(res.aircraft[0]?.hex, ac.hex, kind);
    assert.equal(res.source, 'demo');
  }
});
