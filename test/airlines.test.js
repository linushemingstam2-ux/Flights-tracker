import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { airlineCode } from '../public/js/airline-logos.js';
import { LOGO_CODES } from '../public/js/airline-logo-codes.js';

test('an airline callsign picks its logo by ICAO code', () => {
  assert.equal(airlineCode('BAW283'), 'BAW');
  assert.equal(airlineCode('DLH4CK'), 'DLH');
  assert.equal(airlineCode('SAS1416'), 'SAS');
});

test('registrations, private callsigns and unknown codes get no logo', () => {
  assert.equal(airlineCode('N123AB'), null);
  assert.equal(airlineCode('GABCD'), null);
  assert.equal(airlineCode('SEABC'), null);
  assert.equal(airlineCode('QQQ123'), null);
  assert.equal(airlineCode(''), null);
  assert.equal(airlineCode(undefined), null);
});

test('every listed logo exists, and every logo is listed', () => {
  const files = new Set(readdirSync(new URL('../public/logos/', import.meta.url)).map((f) => f.replace(/\.png$/, '')));
  assert.equal(files.size, LOGO_CODES.size);
  for (const code of LOGO_CODES) assert.ok(files.has(code), code);
});
