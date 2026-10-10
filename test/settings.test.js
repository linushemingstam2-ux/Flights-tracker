import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings, DEFAULTS } from '../public/js/settings.js';

test('saved settings keep current choices and drop ones that no longer exist', (t) => {
  const saved = { mapStyle: 'light', allTrails: true, labels: false, metric: true, colorMode: 'altitude', source: 'opensky', filters: { hideGround: true } };
  globalThis.localStorage = { getItem: () => JSON.stringify(saved) };
  t.after(() => delete globalThis.localStorage);
  const s = loadSettings();
  assert.equal(s.mapStyle, 'light');
  assert.equal(s.allTrails, true);
  assert.equal(s.filters.hideGround, true);
  assert.equal(s.filters.altMax, DEFAULTS.filters.altMax);
  for (const gone of ['metric', 'colorMode', 'source', 'labels']) assert.ok(!(gone in s), gone);
});
