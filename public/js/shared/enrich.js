// Extra details for a selected aircraft: flight route, airframe info and a photo.
// Shared by the browser (direct mode) and the Node server.

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const httpsUrl = (v) => (typeof v === 'string' && /^https:\/\//i.test(v) ? v : '');

export const routeUrl = (callsign) => `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`;
export const aircraftInfoUrl = (hex) => `https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(hex)}`;
export const photoUrl = (hex) => `https://api.planespotters.net/pub/photos/hex/${encodeURIComponent(hex)}`;

function airport(a) {
  if (!a || typeof a !== 'object') return null;
  const lat = num(a.latitude);
  const lon = num(a.longitude);
  if (lat == null || lon == null) return null;
  return {
    iata: str(a.iata_code),
    icao: str(a.icao_code),
    name: str(a.name),
    city: str(a.municipality),
    country: str(a.country_name),
    countryCode: str(a.country_iso_name),
    lat,
    lon,
  };
}

/** adsbdb /v0/callsign response → { airline, origin, destination } or null. */
export function parseRoute(json) {
  const r = json?.response?.flightroute;
  if (!r || typeof r !== 'object') return null;
  const origin = airport(r.origin);
  const destination = airport(r.destination);
  if (!origin || !destination) return null;
  const al = r.airline && typeof r.airline === 'object' ? r.airline : null;
  return {
    callsign: str(r.callsign),
    flightIata: str(r.callsign_iata),
    airline: al ? { name: str(al.name), icao: str(al.icao), iata: str(al.iata), country: str(al.country) } : null,
    origin,
    destination,
  };
}

/** adsbdb /v0/aircraft response → airframe details or null. */
export function parseAircraftInfo(json) {
  const a = json?.response?.aircraft;
  if (!a || typeof a !== 'object') return null;
  return {
    type: str(a.type),
    icaoType: str(a.icao_type),
    manufacturer: str(a.manufacturer),
    reg: str(a.registration),
    owner: str(a.registered_owner),
    ownerCountry: str(a.registered_owner_country_name),
    photo: httpsUrl(a.url_photo_thumbnail) || httpsUrl(a.url_photo)
      ? { thumb: httpsUrl(a.url_photo_thumbnail) || httpsUrl(a.url_photo), large: httpsUrl(a.url_photo), link: '', photographer: '' }
      : null,
  };
}

/** planespotters.net /pub/photos response → first photo or null. */
export function parsePhoto(json) {
  const p = Array.isArray(json?.photos) ? json.photos[0] : null;
  if (!p) return null;
  const thumb = httpsUrl(p.thumbnail_large?.src) || httpsUrl(p.thumbnail?.src);
  if (!thumb) return null;
  return { thumb, large: thumb, link: httpsUrl(p.link), photographer: str(p.photographer) };
}
