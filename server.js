#!/usr/bin/env node
// Starts the flight radar: web app + live-traffic API on http://localhost:3000
import http from 'node:http';
import { createApp } from './lib/app.js';
import { createUpstream } from './lib/upstream.js';

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';
const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);

const server = http.createServer(createApp({ upstream: createUpstream({ log }), log }));

server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.log(`Port ${port} is already in use: the flight radar is probably already running (http://localhost:${port}).`);
  process.exit(1);
});

server.listen(port, host, () => {
  const shown = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
  console.log(`✈  Flight radar running at http://${shown}:${port}`);
  if (process.env.OPENSKY_CLIENT_ID) console.log('   OpenSky credentials configured');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
