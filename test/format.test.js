import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatVRate, formatAlt, shortAlt, formatType } from '../public/js/format.js';

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

test('aircraft type names read naturally on the flight card', () => {
  assert.equal(formatType('AIRBUS A-350-1000', 'A35K'), 'Airbus A-350-1000');
  assert.equal(formatType('DE HAVILLAND CANADA DHC-8-400', 'DH8D'), 'De Havilland Canada DHC-8-400');
  assert.equal(formatType('ATR 72-600', 'AT76'), 'ATR 72-600');
  assert.equal(formatType('Cessna 172 Skyhawk', 'C172'), 'Cessna 172 Skyhawk');
  assert.equal(formatType('', 'B738'), 'B738');
  assert.equal(formatType(undefined, undefined), '');
});
