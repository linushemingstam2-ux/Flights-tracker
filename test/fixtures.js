// Sample upstream responses in the documented formats of each service.

export const READSB_SAMPLE = {
  ac: [
    {
      hex: '4007f1',
      type: 'adsb_icao',
      flight: 'BAW283  ',
      r: 'G-XWBA',
      t: 'A35K',
      desc: 'AIRBUS A-350-1000',
      ownOp: 'British Airways',
      alt_baro: 38000,
      alt_geom: 38575,
      gs: 487.3,
      track: 281.6,
      baro_rate: -64,
      squawk: '6421',
      emergency: 'none',
      category: 'A5',
      lat: 51.3876,
      lon: -1.2101,
      nic: 8,
      seen_pos: 0.4,
      seen: 0.1,
      rssi: -18.2,
      dbFlags: 0,
    },
    {
      hex: '4CA2D6',
      type: 'mlat',
      flight: 'RYR4AB ',
      r: 'EI-DCL',
      t: 'B738',
      alt_baro: 'ground',
      gs: 12,
      true_heading: 92,
      category: 'A3',
      lat: 51.1537,
      lon: -0.1821,
      seen_pos: 3.2,
    },
    {
      hex: 'ae1234',
      type: 'adsb_icao',
      flight: 'RCH123',
      t: 'C17',
      alt_baro: 24000,
      gs: 410,
      track: 45,
      squawk: '7700',
      emergency: 'general',
      lat: 52.1,
      lon: 0.5,
      seen_pos: 1,
      dbFlags: 1,
    },
    { hex: '400abc', type: 'mode_s', flight: 'NOPOS', alt_baro: 12000, seen: 1 },
    { hex: '400def', type: 'adsb_icao', lat: 51, lon: 0, seen_pos: 300 },
  ],
  msg: 'No error',
  now: 1760050000000,
  total: 5,
  ctime: 1760050000000,
  ptime: 3,
};

export const OPENSKY_SAMPLE = {
  time: 1760050000,
  states: [
    ['3c6444', 'DLH9LF  ', 'Germany', 1760049998, 1760049999, 8.5622, 50.0379, 11277.6, false, 236.5, 75.2, 0, null, 11468.1, '1000', false, 0, 4],
    ['4b1805', 'SWR7GN  ', 'Switzerland', 1760049999, 1760049999, 8.5492, 47.4581, null, true, 0, 280, null, null, null, null, false, 0, 0],
    ['abc123', 'NOPOS', 'United States', null, 1760049999, null, null, 1000, false, 100, 0, 0, null, null, null, false, 0, 0],
  ],
};

export const ADSBDB_ROUTE = {
  response: {
    flightroute: {
      callsign: 'BAW283',
      callsign_icao: 'BAW283',
      callsign_iata: 'BA283',
      airline: { name: 'British Airways', icao: 'BAW', iata: 'BA', country: 'United Kingdom', country_iso: 'GB', callsign: 'SPEEDBIRD' },
      origin: {
        country_iso_name: 'GB',
        country_name: 'United Kingdom',
        elevation: 83,
        iata_code: 'LHR',
        icao_code: 'EGLL',
        latitude: 51.4706,
        longitude: -0.461941,
        municipality: 'London',
        name: 'London Heathrow Airport',
      },
      destination: {
        country_iso_name: 'US',
        country_name: 'United States',
        elevation: 13,
        iata_code: 'JFK',
        icao_code: 'KJFK',
        latitude: 40.639801,
        longitude: -73.7789,
        municipality: 'New York',
        name: 'John F Kennedy International Airport',
      },
    },
  },
};

export const PLANESPOTTERS = {
  photos: [
    {
      id: '1234567',
      thumbnail: { src: 'https://t.plnspttrs.net/12345/1234567_abc_t.jpg', size: { width: 200, height: 133 } },
      thumbnail_large: { src: 'https://t.plnspttrs.net/12345/1234567_abc_280.jpg', size: { width: 420, height: 280 } },
      link: 'https://www.planespotters.net/photo/1234567/g-xwba-british-airways-airbus-a350-1041',
      photographer: 'Jane Spotter',
    },
  ],
};
