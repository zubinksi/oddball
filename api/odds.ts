import type { IncomingMessage, ServerResponse } from 'http';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ODDS_API_KEY = process.env.ODDS_API_KEY ?? 'f24a1c721e290d637ca7ab2988a7b401';
const SPORT_KEY = 'basketball_ncaab';
const MICHIGAN_TEAM = 'Michigan Wolverines';
const HISTORY_TTL_SECS = 24 * 60 * 60; // 24 hours
const HISTORY_MAX_AGE_MS = HISTORY_TTL_SECS * 1000;

// ── History storage ───────────────────────────────────────────────────────────
// Priority:
//   1. Vercel KV  – when KV_REST_API_URL + KV_REST_API_TOKEN are set
//   2. Local JSON file – .odds-history.json in the project root (local dev)
//   3. In-memory Map  – last resort, lost on process restart

export interface HistoryPoint { time: number; value: number }

const memStore = new Map<string, HistoryPoint[]>();

// ── Local file store ──────────────────────────────────────────────────────────

const LOCAL_STORE_PATH = resolve(process.cwd(), '.odds-history.json');

function fileStoreRead(): Record<string, HistoryPoint[]> {
  try {
    return JSON.parse(readFileSync(LOCAL_STORE_PATH, 'utf8')) as Record<string, HistoryPoint[]>;
  } catch {
    return {};
  }
}

function fileStoreWrite(data: Record<string, HistoryPoint[]>): void {
  try {
    writeFileSync(LOCAL_STORE_PATH, JSON.stringify(data), 'utf8');
  } catch { /* best-effort */ }
}

function useKv(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function kvHeaders() {
  return {
    Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

async function getHistory(gameId: string): Promise<HistoryPoint[]> {
  if (useKv()) {
    try {
      const res = await fetch(`${process.env.KV_REST_API_URL}/get/game:${gameId}`, { headers: kvHeaders() });
      if (res.ok) {
        const { result } = await res.json() as { result: string | null };
        if (result) return JSON.parse(result) as HistoryPoint[];
      }
    } catch { /* fallthrough */ }
    return [];
  }

  // Local file store
  const data = fileStoreRead();
  return data[gameId] ?? memStore.get(gameId) ?? [];
}

async function saveHistory(gameId: string, points: HistoryPoint[]): Promise<void> {
  memStore.set(gameId, points);

  if (useKv()) {
    try {
      // SETEX key seconds value
      await fetch(`${process.env.KV_REST_API_URL}/pipeline`, {
        method: 'POST',
        headers: kvHeaders(),
        body: JSON.stringify([['SETEX', `game:${gameId}`, HISTORY_TTL_SECS, JSON.stringify(points)]]),
      });
    } catch { /* best-effort */ }
    return;
  }

  // Local file store
  const data = fileStoreRead();
  data[gameId] = points;
  fileStoreWrite(data);
}

async function appendPoint(gameId: string, point: HistoryPoint, completed: boolean): Promise<HistoryPoint[]> {
  const existing = await getHistory(gameId);
  const cutoff = Date.now() - HISTORY_MAX_AGE_MS;
  const trimmed = existing.filter((p) => p.time * 1000 >= cutoff);

  // For completed games only append if the last value differs (final point once)
  const lastVal = trimmed[trimmed.length - 1]?.value;
  if (completed && lastVal === point.value) return trimmed;

  const next = [...trimmed, point];
  await saveHistory(gameId, next);
  return next;
}

// ── Odds API types ────────────────────────────────────────────────────────────

interface OddsOutcome { name: string; price: number }
interface OddsMarket  { key: string; outcomes: OddsOutcome[] }
interface OddsBookmaker { key: string; title: string; markets: OddsMarket[] }
interface OddsGame {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
}

interface ScoreEntry { name: string; score: string }
interface ScoreGame {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  completed: boolean;
  scores: ScoreEntry[] | null;
  description?: string;
}

// ── Response types (mirrored in client/src/types.ts) ─────────────────────────

export interface MichiganGame {
  id: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  isMichiganHome: boolean;
  impliedProbability: number;
  completed: boolean;
  score: { michigan: number; opponent: number } | null;
  gameTime: string | null;
  history: HistoryPoint[];
  bookmakers: {
    key: string;
    title: string;
    americanOdds: number;
    impliedProbability: number;
  }[];
}

export type OddsResponse =
  | { games: MichiganGame[] }
  | { noGames: true }
  | { error: string };

// ── Logic ─────────────────────────────────────────────────────────────────────

function americanToImplied(odds: number): number {
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

async function getMichiganOdds(): Promise<OddsResponse> {
  // Fetch recent scores (last 3 days) — covers completed and in-progress games
  const scoresUrl = new URL(`https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/scores`);
  scoresUrl.searchParams.set('apiKey', ODDS_API_KEY);
  scoresUrl.searchParams.set('daysFrom', '3');

  const scoreMap = new Map<string, ScoreGame>();
  try {
    const res = await fetch(scoresUrl.toString());
    if (res.ok) {
      const all: ScoreGame[] = await res.json();
      for (const sg of all) {
        if (sg.home_team === MICHIGAN_TEAM || sg.away_team === MICHIGAN_TEAM) {
          scoreMap.set(sg.id, sg);
        }
      }
    }
  } catch { /* best-effort */ }

  // Fetch current odds — only active/upcoming games appear here
  const oddsUrl = new URL(`https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/odds`);
  oddsUrl.searchParams.set('apiKey', ODDS_API_KEY);
  oddsUrl.searchParams.set('regions', 'us');
  oddsUrl.searchParams.set('markets', 'h2h');
  oddsUrl.searchParams.set('oddsFormat', 'american');

  const oddsMap = new Map<string, OddsGame>();
  try {
    const res = await fetch(oddsUrl.toString());
    if (res.ok) {
      const all: OddsGame[] = await res.json();
      for (const g of all) {
        if (g.home_team === MICHIGAN_TEAM || g.away_team === MICHIGAN_TEAM) {
          oddsMap.set(g.id, g);
        }
      }
    }
  } catch { /* best-effort */ }

  const allIds = new Set([...scoreMap.keys(), ...oddsMap.keys()]);
  if (allIds.size === 0) return { noGames: true };

  const now = Date.now() / 1000;
  const games = await Promise.all(
    Array.from(allIds).map(async (id) => {
      const sg = scoreMap.get(id);
      const og = oddsMap.get(id);

      const homeTeam = sg?.home_team ?? og?.home_team ?? '';
      const awayTeam = sg?.away_team ?? og?.away_team ?? '';
      const commenceTime = sg?.commence_time ?? og?.commence_time ?? '';
      const isMichiganHome = homeTeam === MICHIGAN_TEAM;
      const completed = sg?.completed ?? false;

      const bms = og
        ? og.bookmakers.flatMap((bm) => {
            const h2h = bm.markets.find((m) => m.key === 'h2h');
            const outcome = h2h?.outcomes.find((o) => o.name === MICHIGAN_TEAM);
            if (!outcome) return [];
            return [{
              key: bm.key,
              title: bm.title,
              americanOdds: outcome.price,
              impliedProbability: americanToImplied(outcome.price),
            }];
          })
        : [];

      let impliedProbability: number;
      if (bms.length > 0) {
        impliedProbability = bms.reduce((s, b) => s + b.impliedProbability, 0) / bms.length;
      } else if (completed && sg?.scores) {
        const mPts = parseInt(sg.scores.find((s) => s.name === MICHIGAN_TEAM)?.score ?? '0', 10);
        const oPts = parseInt(sg.scores.find((s) => s.name !== MICHIGAN_TEAM)?.score ?? '0', 10);
        impliedProbability = mPts > oPts ? 1 : 0;
      } else {
        impliedProbability = 0.5;
      }

      let score: { michigan: number; opponent: number } | null = null;
      let gameTime: string | null = null;
      if (sg?.scores) {
        const mEntry = sg.scores.find((s) => s.name === MICHIGAN_TEAM);
        const oEntry = sg.scores.find((s) => s.name !== MICHIGAN_TEAM);
        if (mEntry && oEntry) {
          score = { michigan: parseInt(mEntry.score, 10), opponent: parseInt(oEntry.score, 10) };
        }
        if (!completed && sg.description) gameTime = sg.description;
      }

      const history = await appendPoint(id, { time: now, value: impliedProbability }, completed);

      return {
        id,
        commenceTime,
        homeTeam,
        awayTeam,
        isMichiganHome,
        impliedProbability,
        completed,
        score,
        gameTime,
        history,
        bookmakers: bms,
      } satisfies MichiganGame;
    })
  );

  games.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime();
  });

  return { games };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  try {
    const data = await getMichiganOdds();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    res.end(JSON.stringify(data));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  }
}
