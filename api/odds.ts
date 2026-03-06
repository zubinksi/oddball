import type { IncomingMessage, ServerResponse } from 'http';

const ODDS_API_KEY = process.env.ODDS_API_KEY ?? 'f24a1c721e290d637ca7ab2988a7b401';
const SPORT_KEY = 'basketball_ncaab';
const MICHIGAN_TEAM = 'Michigan Wolverines';

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
  /** Period/clock description for in-progress games, e.g. "1st Half 14:32" */
  description?: string;
  last_update?: string;
}

// ── Response types (mirrored in client/src/types.ts) ─────────────────────────

export interface MichiganGame {
  id: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  isMichiganHome: boolean;
  /** Implied win probability (0–1), averaged across bookmakers */
  impliedProbability: number;
  /** Whether the game is finished */
  completed: boolean;
  score: { michigan: number; opponent: number } | null;
  /** Game clock / period description when in-progress, e.g. "1st Half 14:32" */
  gameTime: string | null;
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

/** American odds → raw implied probability (no vig removal). */
function americanToImplied(odds: number): number {
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

async function getMichiganOdds(): Promise<OddsResponse> {
  // Fetch scores for the last 24 hours — covers completed and in-progress games
  const scoresUrl = new URL(`https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/scores`);
  scoresUrl.searchParams.set('apiKey', ODDS_API_KEY);
  scoresUrl.searchParams.set('daysFrom', '1');

  const scoreMap = new Map<string, ScoreGame>();
  try {
    const scoresRes = await fetch(scoresUrl.toString());
    if (scoresRes.ok) {
      const all: ScoreGame[] = await scoresRes.json();
      for (const sg of all) {
        if (sg.home_team === MICHIGAN_TEAM || sg.away_team === MICHIGAN_TEAM) {
          scoreMap.set(sg.id, sg);
        }
      }
    }
  } catch {
    // best-effort
  }

  // Fetch current odds — only active/upcoming games have entries here
  const oddsUrl = new URL(`https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/odds`);
  oddsUrl.searchParams.set('apiKey', ODDS_API_KEY);
  oddsUrl.searchParams.set('regions', 'us');
  oddsUrl.searchParams.set('markets', 'h2h');
  oddsUrl.searchParams.set('oddsFormat', 'american');

  const oddsMap = new Map<string, OddsGame>();
  try {
    const oddsRes = await fetch(oddsUrl.toString());
    if (oddsRes.ok) {
      const all: OddsGame[] = await oddsRes.json();
      for (const g of all) {
        if (g.home_team === MICHIGAN_TEAM || g.away_team === MICHIGAN_TEAM) {
          oddsMap.set(g.id, g);
        }
      }
    }
  } catch {
    // best-effort
  }

  // Union of all game IDs seen in either source
  const allIds = new Set([...scoreMap.keys(), ...oddsMap.keys()]);
  if (allIds.size === 0) return { noGames: true };

  const games: MichiganGame[] = [];

  for (const id of allIds) {
    const sg = scoreMap.get(id);
    const og = oddsMap.get(id);

    // Use scores data for team names / commence time when available
    const homeTeam = sg?.home_team ?? og?.home_team ?? '';
    const awayTeam = sg?.away_team ?? og?.away_team ?? '';
    const commenceTime = sg?.commence_time ?? og?.commence_time ?? '';
    const isMichiganHome = homeTeam === MICHIGAN_TEAM;
    const completed = sg?.completed ?? false;

    // Build bookmaker list from odds (empty for completed games)
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
      // Active game: average bookmaker probability
      impliedProbability = bms.reduce((s, b) => s + b.impliedProbability, 0) / bms.length;
    } else if (completed && sg?.scores) {
      // Completed game: 1.0 if Michigan won, 0.0 if lost
      const michiganScore = sg.scores.find((s) => s.name === MICHIGAN_TEAM);
      const opponentScore = sg.scores.find((s) => s.name !== MICHIGAN_TEAM);
      const mPts = michiganScore ? parseInt(michiganScore.score, 10) : 0;
      const oPts = opponentScore ? parseInt(opponentScore.score, 10) : 0;
      impliedProbability = mPts > oPts ? 1 : 0;
    } else {
      impliedProbability = 0.5;
    }

    // Score
    let score: { michigan: number; opponent: number } | null = null;
    let gameTime: string | null = null;
    if (sg?.scores) {
      const michiganEntry = sg.scores.find((s) => s.name === MICHIGAN_TEAM);
      const opponentEntry = sg.scores.find((s) => s.name !== MICHIGAN_TEAM);
      if (michiganEntry && opponentEntry) {
        score = {
          michigan: parseInt(michiganEntry.score, 10),
          opponent: parseInt(opponentEntry.score, 10),
        };
      }
      if (!completed && sg.description) gameTime = sg.description;
    }

    games.push({
      id,
      commenceTime,
      homeTeam,
      awayTeam,
      isMichiganHome,
      impliedProbability,
      completed,
      score,
      gameTime,
      bookmakers: bms,
    });
  }

  // Sort: active/upcoming first, completed last
  games.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime();
  });

  return { games };
}

// ── Handler (Vercel serverless + Express-compatible) ─────────────────────────

export default async function handler(
  _req: IncomingMessage,
  res: ServerResponse
) {
  try {
    const data = await getMichiganOdds();
    res.setHeader('Content-Type', 'application/json');
    // CDN caches for 30 s; stale responses served for up to 60 s while revalidating
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    res.end(JSON.stringify(data));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  }
}
