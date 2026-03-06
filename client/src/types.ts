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
  impliedProbability: number;
  bookmakers: {
    key: string;
    title: string;
    impliedProbability: number;
    americanOdds: number;
  }[];
}
