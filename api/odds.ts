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
  home_team: string;
  away_team: string;
  completed: boolean;
  scores: ScoreEntry[] | null;
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
  score: { michigan: number; opponent: number } | null;
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
  const oddsUrl = new URL(`https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/odds`);
  oddsUrl.searchParams.set('apiKey', ODDS_API_KEY);
  oddsUrl.searchParams.set('regions', 'us');
  oddsUrl.searchParams.set('markets', 'h2h');
  oddsUrl.searchParams.set('oddsFormat', 'american');

  const oddsRes = await fetch(oddsUrl.toString());
  if (!oddsRes.ok) throw new Error(`Odds API ${oddsRes.status}: ${await oddsRes.text()}`);

  const all: OddsGame[] = await oddsRes.json();
  const games = all.filter(
    (g) => g.home_team === MICHIGAN_TEAM || g.away_team === MICHIGAN_TEAM
  );

  if (games.length === 0) return { noGames: true };

  // Fetch live/recent scores for the Michigan games
  const scoresUrl = new URL(`https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/scores`);
  scoresUrl.searchParams.set('apiKey', ODDS_API_KEY);
  scoresUrl.searchParams.set('daysFrom', '1');
  scoresUrl.searchParams.set('eventIds', games.map((g) => g.id).join(','));

  const scoreMap = new Map<string, ScoreGame>();
  try {
    const scoresRes = await fetch(scoresUrl.toString());
    if (scoresRes.ok) {
      const scoreGames: ScoreGame[] = await scoresRes.json();
      for (const sg of scoreGames) scoreMap.set(sg.id, sg);
    }
  } catch {
    // Scores are best-effort; don't fail the whole response
  }

  return {
    games: games.map((game) => {
      const isMichiganHome = game.home_team === MICHIGAN_TEAM;
      const bms = game.bookmakers
        .flatMap((bm) => {
          const h2h = bm.markets.find((m) => m.key === 'h2h');
          const outcome = h2h?.outcomes.find((o) => o.name === MICHIGAN_TEAM);
          if (!outcome) return [];
          return [{
            key: bm.key,
            title: bm.title,
            americanOdds: outcome.price,
            impliedProbability: americanToImplied(outcome.price),
          }];
        });

      const avg = bms.length
        ? bms.reduce((s, b) => s + b.impliedProbability, 0) / bms.length
        : 0;

      const sg = scoreMap.get(game.id);
      let score: { michigan: number; opponent: number } | null = null;
      if (sg?.scores) {
        const michiganEntry = sg.scores.find((s) => s.name === MICHIGAN_TEAM);
        const opponentEntry = sg.scores.find((s) => s.name !== MICHIGAN_TEAM);
        if (michiganEntry && opponentEntry) {
          score = {
            michigan: parseInt(michiganEntry.score, 10),
            opponent: parseInt(opponentEntry.score, 10),
          };
        }
      }

      return {
        id: game.id,
        commenceTime: game.commence_time,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        isMichiganHome,
        impliedProbability: avg,
        score,
        bookmakers: bms,
      };
    }),
  };
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
