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
        } else {
          setStatus('ok');
          setErrorMessage(null);
          setGameHistories((prev) => {
            const next = new Map<string, GameHistory>();
            const cutoff = Date.now() - 24 * 60 * 60 * 1000;

            // Carry forward completed games that are no longer in the API response
            // (they drop out of the scores endpoint after ~24h)
            for (const [id, entry] of prev) {
              if (
                entry.game.completed &&
                new Date(entry.game.commenceTime).getTime() >= cutoff
              ) {
                next.set(id, entry);
              }
            }

            // Overlay with latest from API (always wins)
            for (const game of data.games) {
              next.set(game.id, { game, history: game.history });
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
