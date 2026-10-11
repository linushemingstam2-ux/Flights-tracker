import { test } from 'node:test';
import assert from 'node:assert/strict';
import { radarTileUrl, parseCurrent, describeWeather, windArrow, weatherIcon } from '../public/js/weather.js';

test('rain radar uses the newest frame RainViewer lists', () => {
  const index = {
    host: 'https://tilecache.rainviewer.com',
    radar: { past: [{ time: 1, path: '/v2/radar/old' }, { time: 2, path: '/v2/radar/abc123' }] },
  };
  assert.equal(radarTileUrl(index), 'https://tilecache.rainviewer.com/v2/radar/abc123/256/{z}/{x}/{y}/2/1_1.png');
  assert.equal(radarTileUrl({ host: 'x', radar: { past: [] } }), null);
  assert.equal(radarTileUrl(null), null);
});

test("Open-Meteo's current weather is read in the app's terms", () => {
  const w = parseCurrent({
    current: {
      temperature_2m: 14.6,
      weather_code: 2,
      is_day: 0,
      cloud_cover: 63,
      wind_speed_10m: 11.2,
      wind_direction_10m: 240,
      wind_gusts_10m: 19.8,
    },
  });
  assert.deepEqual(w, { temp: 14.6, code: 2, isDay: false, cloud: 63, wind: 11.2, windDir: 240, gusts: 19.8 });
  assert.throws(() => parseCurrent({ error: true, reason: 'bad' }));
});

test('weather codes get plain words and the right symbol, by day and by night', () => {
  assert.deepEqual(describeWeather(0, true), { text: 'Clear', icon: 'sun' });
  assert.deepEqual(describeWeather(0, false), { text: 'Clear', icon: 'moon' });
  assert.deepEqual(describeWeather(2, false), { text: 'Partly cloudy', icon: 'cloud-moon' });
  assert.equal(describeWeather(45).icon, 'fog');
  assert.equal(describeWeather(63).text, 'Rain');
  assert.equal(describeWeather(73).icon, 'snow');
  assert.equal(describeWeather(95).icon, 'thunder');
  assert.match(weatherIcon('sun'), /^<svg class="wx-svg"/);
});

test('the wind arrow points where the wind blows to', () => {
  assert.match(windArrow(270), /rotate\(90deg\)/); // a westerly blows towards the east
  assert.match(windArrow(0), /rotate\(180deg\)/);
});
