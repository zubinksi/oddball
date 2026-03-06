/**
 * Thin local dev server that wraps the Vercel API handler so you can run
 * `npm run dev` without the Vercel CLI.
 *
 * The Vite dev server (port 5173) proxies /api → this server (port 3001).
 */
import express from 'express';
import handler from './api/odds.js';

const PORT = 3001;
const app = express();

app.get('/api/odds', (req, res) => handler(req, res as any));

app.listen(PORT, () => {
  console.log(`[dev-server] API available at http://localhost:${PORT}/api/odds`);
});
