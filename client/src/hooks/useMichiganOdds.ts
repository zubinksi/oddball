import { useEffect, useState } from 'react';
import type { MichiganGame, OddsResponse } from '../types';

const POLL_INTERVAL_MS = 30_000;

export interface GameHistory {
  game: MichiganGame;
  history: { time: number; value: number }[];
}

export type FetchStatus = 'loading' | 'ok' | 'no_games' | 'error';

export function useMichiganOdds() {
  const [status, setStatus] = useState<FetchStatus>('loading');
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [gameHistories, setGameHistories] = useState<Map<string, GameHistory>>(new Map());

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch('/api/odds');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: OddsResponse = await res.json();

        setLastUpdate(Date.now());

        if ('error' in data) {
          setStatus('error');
          setErrorMessage(data.error);
        } else if ('noGames' in data) {
          setStatus('no_games');
          setGameHistories(new Map());
        } else {
          setStatus('ok');
          setErrorMessage(null);
          setGameHistories((prev) => {
            const next = new Map(prev);
            for (const game of data.games) {
              const existing = next.get(game.id);
              const point = { time: Date.now() / 1000, value: game.impliedProbability };
              next.set(game.id, {
                game,
                history: existing ? [...existing.history, point] : [point],
              });
            }
            return next;
          });
        }
      } catch (err) {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : String(err));
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return { status, lastUpdate, errorMessage, gameHistories };
}
