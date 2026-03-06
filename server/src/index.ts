import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';

const ODDS_API_KEY = 'f24a1c721e290d637ca7ab2988a7b401';
const SPORT_KEY = 'basketball_ncaab';
const MICHIGAN_TEAM = 'Michigan Wolverines';
const POLL_INTERVAL_MS = 30_000; // 30 seconds – respect API rate limits
const PORT = 3001;

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
    (g) =>
      g.home_team === MICHIGAN_TEAM || g.away_team === MICHIGAN_TEAM
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

        const michiganOutcome = h2h.outcomes.find(
          (o) => o.name === MICHIGAN_TEAM
        );
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

  return {
    type: 'odds_update',
    timestamp: Date.now(),
    games: parsed,
  };
}

// ── HTTP + WS server ──────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// Keep the last snapshot so new clients get data immediately on connect.
let lastUpdate: MichiganOddsUpdate | null = null;

function broadcast(data: MichiganOddsUpdate) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('[ws] client connected, total:', wss.clients.size);

  // Send the last known snapshot immediately so the chart isn't empty.
  if (lastUpdate) {
    ws.send(JSON.stringify(lastUpdate));
  }

  ws.on('close', () =>
    console.log('[ws] client disconnected, total:', wss.clients.size)
  );
});

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
    const errUpdate: MichiganOddsUpdate = {
      type: 'error',
      timestamp: Date.now(),
      message: msg,
    };
    lastUpdate = errUpdate;
    broadcast(errUpdate);
  }
}

// Kick off immediately, then repeat.
poll();
setInterval(poll, POLL_INTERVAL_MS);

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] WebSocket ready at ws://localhost:${PORT}`);
});
