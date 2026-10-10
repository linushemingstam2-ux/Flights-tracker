import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatVRate, formatAlt, shortAlt } from '../public/js/format.js';

test('climb and descent rates show an arrow instead of a sign', () => {
  assert.equal(formatVRate(1490), '↑ 1,490 ft/min');
  assert.equal(formatVRate(-791), '↓ 791 ft/min');
  assert.equal(formatVRate(-100), '-100 ft/min'); // level flight: too small for an arrow
  assert.equal(formatVRate(null), '—');
});

test('altitudes read in feet, flight levels above 18,000 ft on the map', () => {
  assert.equal(formatAlt({ alt: 35000 }), '35,000 ft');
  assert.equal(formatAlt({ onGround: true }), 'On ground');
  assert.equal(shortAlt({ alt: 35000 }), 'FL350');
  assert.equal(shortAlt({ alt: 4500 }), '4,500');
});
