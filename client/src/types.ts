export interface TrackedGame {
  id: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  trackedTeam: string;
  isTrackedTeamHome: boolean;
  impliedProbability: number;
  completed: boolean;
  score: { home: number; away: number } | null;
  gameTime: string | null;
  history: { time: number; value: number }[];
  bookmakers: {
    key: string;
    title: string;
    americanOdds: number;
    impliedProbability: number;
  }[];
}

export type OddsResponse =
  | { games: TrackedGame[] }
  | { noGames: true }
  | { error: string };
