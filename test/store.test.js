import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AircraftStore } from '../public/js/store.js';
import { makeFilter, DEFAULTS } from '../public/js/settings.js';

const base = {
  hex: '4007f1', callsign: 'BAW283', reg: 'G-XWBA', type: 'A35K', desc: '', operator: '',
  lat: 51, lon: 0, posAge: 0, alt: 38000, onGround: false, gs: 480, track: 90, vrate: 0,
  squawk: '', emergency: '', category: 'A5', military: false, source: 'ADS-B', country: '',
};

test('extrapolates position along the track between updates', () => {
  const s = new AircraftStore();
  s.ingest([base], { t: 0 });
  const ac = s.get('4007f1');
  const [lat, lon] = s.positionAt(ac, 60_000); // 30 s cap → 4 nm east
  assert.ok(Math.abs(lat - 51) < 1e-6);
  const expected = 4 / (60 * Math.cos((51 * Math.PI) / 180));
  assert.ok(Math.abs(lon - expected) < 1e-4, `${lon} vs ${expected}`);
});

test('accounts for position age and smooths corrections', () => {
  const s = new AircraftStore();
  s.ingest([{ ...base, posAge: 10 }], { t: 100_000, age: 2 });
  const ac = s.get('4007f1');
  assert.equal(ac.posTime, 100_000 - 12_000);

  // A new fix slightly behind the extrapolated point should not make the icon jump.
  const before = s.positionAt(ac, 101_000);
  s.ingest([{ ...base, lon: before[1] - 0.01 }], { t: 101_000 });
  const after = s.positionAt(ac, 101_000);
  assert.ok(Math.abs(after[1] - before[1]) < 1e-9);
  assert.ok(ac.trail.length === 2);
});

test('drops aircraft missing from an area snapshot after a grace period', () => {
  const s = new AircraftStore();
  const area = { lat: 51, lon: 0, radius: 100 };
  s.ingest([base, { ...base, hex: 'aaaaaa', lat: 60 }], { t: 0 });
  s.ingest([base], { t: 1000, area });
  assert.deepEqual([...s.byHex.keys()], ['4007f1'], 'outside the area: removed immediately');
  s.ingest([], { t: 10_000, area });
  assert.equal(s.size, 1, 'kept during the grace period');
  s.ingest([], { t: 30_000, area });
  assert.equal(s.size, 0);
});

test('keeps the selected aircraft longer', () => {
  const s = new AircraftStore();
  s.ingest([base], { t: 0 });
  s.selectedHex = base.hex;
  s.ingest([], { t: 60_000, area: { lat: 0, lon: 0, radius: 10 } });
  assert.equal(s.size, 1);
});

test('search ranks exact and prefix matches', () => {
  const s = new AircraftStore();
  s.ingest([base, { ...base, hex: '400001', callsign: 'BAW28', reg: 'G-EUPT', type: 'A319' }], { t: 0 });
  assert.deepEqual(s.search('baw28').map((a) => a.hex), ['400001', '4007f1']);
  assert.deepEqual(s.search('g-xwba').map((a) => a.hex), ['4007f1']);
  assert.deepEqual(s.search('A35').map((a) => a.hex), ['4007f1']);
  assert.deepEqual(s.search(''), []);
});

test('filters', () => {
  const f = (o) => makeFilter({ ...DEFAULTS.filters, ...o });
  const ground = { ...base, onGround: true, alt: 0 };
  assert.equal(f({})(base), true);
  assert.equal(f({ hideGround: true })(ground), false);
  assert.equal(f({ militaryOnly: true })(base), false);
  assert.equal(f({ altMin: 39000 })(base), false);
  assert.equal(f({ altMax: 30000 })(base), false);
  assert.equal(f({ text: 'baw' })(base), true);
  assert.equal(f({ text: 'A35*' })(base), true);
  assert.equal(f({ text: 'B77W, A35K' })(base), true);
  assert.equal(f({ text: 'DLH' })(base), false);
  assert.equal(f({ text: '(' })(base), false, 'regex characters are escaped');
});

test('puts earlier positions in front of the trail, keeping what it already has', () => {
  const s = new AircraftStore();
  s.ingest([base], { t: 10_000 });
  s.addHistory('4007f1', [
    { lat: 50, lon: -2, alt: 0, t: 0 },
    { lat: 50.5, lon: -1, alt: 20000, t: 5_000 },
    { lat: 51, lon: 0, alt: 38000, t: 10_000 }, // the position the store already has
  ]);
  assert.deepEqual(s.get('4007f1').trail.map((p) => p.t), [0, 5_000, 10_000]);
  s.addHistory('ffffff', [{ lat: 0, lon: 0, alt: 0, t: 0 }]); // unknown aircraft: ignored
});
