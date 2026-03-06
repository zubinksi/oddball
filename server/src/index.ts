import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== 'production';

const ODDS_API_KEY = 'f24a1c721e290d637ca7ab2988a7b401';
const SPORT_KEY = 'basketball_ncaab';
const MICHIGAN_TEAM = 'Michigan Wolverines';
const POLL_INTERVAL_MS = 30_000; // 30 seconds – respect API rate limits
const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ROOT = join(__dirname, '../../client');

interface OddsOutcome {
  name: string;
  price: number;
}

interface OddsMarket {
  key: string;
  last_update: string;
  outcomes: OddsOutcome[];
}

interface OddsBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: OddsMarket[];
}

interface OddsGame {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
}

export interface MichiganOddsUpdate {
  type: 'odds_update' | 'no_games' | 'error';
  timestamp: number;
  games?: MichiganGame[];
  message?: string;
}

export interface MichiganGame {
  id: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  isMichiganHome: boolean;
  /** Implied probability that Michigan wins (0–1), averaged across bookmakers */
  impliedProbability: number;
  /** Per-bookmaker breakdown */
  bookmakers: {
    key: string;
    title: string;
    impliedProbability: number;
    americanOdds: number;
  }[];
}

/** Convert American odds to implied win probability (no vig removal). */
function americanToImplied(odds: number): number {
  if (odds > 0) {
    return 100 / (odds + 100);
  }
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

async function fetchMichiganGames(): Promise<MichiganOddsUpdate> {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/odds`);
  url.searchParams.set('apiKey', ODDS_API_KEY);
  url.searchParams.set('regions', 'us');
  url.searchParams.set('markets', 'h2h');
  url.searchParams.set('oddsFormat', 'american');

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Odds API error ${res.status}: ${text}`);
  }

  const games: OddsGame[] = await res.json();

  const michiganGames = games.filter(
    (g) => g.home_team === MICHIGAN_TEAM || g.away_team === MICHIGAN_TEAM
  );

  if (michiganGames.length === 0) {
    return { type: 'no_games', timestamp: Date.now() };
  }

  const parsed: MichiganGame[] = michiganGames.map((game) => {
    const isMichiganHome = game.home_team === MICHIGAN_TEAM;

    const bookmakerResults = game.bookmakers
      .map((bm) => {
        const h2h = bm.markets.find((m) => m.key === 'h2h');
        if (!h2h) return null;
        const michiganOutcome = h2h.outcomes.find((o) => o.name === MICHIGAN_TEAM);
        if (!michiganOutcome) return null;
        return {
          key: bm.key,
          title: bm.title,
          americanOdds: michiganOutcome.price,
          impliedProbability: americanToImplied(michiganOutcome.price),
        };
      })
      .filter(Boolean) as MichiganGame['bookmakers'];

    const avgProb =
      bookmakerResults.length > 0
        ? bookmakerResults.reduce((sum, b) => sum + b.impliedProbability, 0) /
          bookmakerResults.length
        : 0;

    return {
      id: game.id,
      commenceTime: game.commence_time,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      isMichiganHome,
      impliedProbability: avgProb,
      bookmakers: bookmakerResults,
    };
  });

  return { type: 'odds_update', timestamp: Date.now(), games: parsed };
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const httpServer = createServer(app);

// ── Odds WebSocket (noServer – we route upgrade events by path) ───────────────

const wss = new WebSocketServer({ noServer: true });

let lastUpdate: MichiganOddsUpdate | null = null;

function broadcast(data: MichiganOddsUpdate) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

wss.on('connection', (ws) => {
  console.log('[ws] client connected, total:', wss.clients.size);
  if (lastUpdate) ws.send(JSON.stringify(lastUpdate));
  ws.on('close', () =>
    console.log('[ws] client disconnected, total:', wss.clients.size)
  );
});

// ── Dev: Vite middleware + HMR | Prod: static files ──────────────────────────

if (isDev) {
  // Dynamic import keeps vite out of the production bundle.
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    root: CLIENT_ROOT,
    server: {
      middlewareMode: true,
      // Attach Vite's HMR WebSocket to the same httpServer so browsers only
      // need one port open.  Vite adds its own 'upgrade' listener here.
      hmr: { server: httpServer },
    },
    appType: 'spa',
  });

  // Capture any upgrade listeners Vite just registered, then replace them
  // with a single router so /ws goes to our odds WS and everything else
  // (Vite HMR) falls through to Vite's listener.
  const viteUpgradeListeners = httpServer.rawListeners('upgrade').slice();
  httpServer.removeAllListeners('upgrade');

  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    } else {
      for (const fn of viteUpgradeListeners) {
        (fn as Function).call(httpServer, req, socket, head);
      }
    }
  });

  app.use(vite.middlewares);

  // Graceful shutdown so tsx --watch can restart cleanly.
  const shutdown = () => { vite.close(); httpServer.close(); process.exit(0); };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} else {
  // Production: serve the pre-built client.
  const { default: sirv } = await import('sirv');
  app.use(sirv(join(CLIENT_ROOT, 'dist'), { single: true }));

  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    } else {
      socket.destroy();
    }
  });
}

// ── Polling ───────────────────────────────────────────────────────────────────

async function poll() {
  try {
    console.log('[poll] fetching Michigan odds…');
    const update = await fetchMichiganGames();
    lastUpdate = update;
    broadcast(update);
    console.log(
      `[poll] broadcast type=${update.type}`,
      update.games ? `games=${update.games.length}` : ''
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[poll] error:', msg);
    const errUpdate: MichiganOddsUpdate = { type: 'error', timestamp: Date.now(), message: msg };
    lastUpdate = errUpdate;
    broadcast(errUpdate);
  }
}

poll();
setInterval(poll, POLL_INTERVAL_MS);

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] WebSocket ready at ws://localhost:${PORT}/ws`);
  if (isDev) console.log('[server] Vite HMR active on the same port');
});
