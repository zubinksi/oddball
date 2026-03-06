export interface MichiganGame {
  id: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  isMichiganHome: boolean;
  impliedProbability: number;
  score: { michigan: number; opponent: number } | null;
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
