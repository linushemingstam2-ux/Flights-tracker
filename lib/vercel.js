// Adapter for Vercel: each file in api/ is a serverless function that runs the same request
// handler as server.js. A function instance keeps its cache for as long as it stays warm.
import { createApp } from './app.js';

const app = createApp({ log: (msg) => console.log(msg) });

export default function handler(req, res) {
  return app(req, res);
}
