# Flights tracker – live flight radar

A Flightradar24-style map of the aircraft flying right now, using free community ADS-B networks
(adsb.lol, adsb.fi, OpenSky). Tap any plane to see its details.

- **Website:** <https://linushemingstam2-ux.github.io/Flights-tracker/>. It runs entirely in the
  browser, and live data can be unreliable there because it depends on free public relays.
- **Reliable version:** deploy this repository on Vercel (free). The flight data is then fetched by
  your own small server:
  1. Go to <https://vercel.com/new> and choose **Continue with GitHub**.
  2. Under **Import Git Repository**, tap **Install**, and allow access to **Flights-tracker**.
  3. Tap **Import** next to Flights-tracker, then **Deploy**.
  4. Open the `https://….vercel.app` link it shows.

Developer notes: `public/` is the web app (also published on the `gh-pages` branch for GitHub Pages),
`api/` holds the Vercel functions, and `server.js` runs everything locally with `npm start`.
See `lib/` for the server code and `test/` for the tests (`npm test`).
