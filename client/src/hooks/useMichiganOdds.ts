import { useEffect, useState } from 'react';
import type { TrackedGame, OddsResponse } from '../types';

const POLL_INTERVAL_MS = 30_000;
const STORAGE_KEY = 'trackedCompletedGames';
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export interface GameHistory {
  game: TrackedGame;
  history: { time: number; value: number }[];
}

export type FetchStatus = 'loading' | 'ok' | 'no_games' | 'error';

function loadCompletedGames(): Map<string, GameHistory> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const entries: [string, GameHistory][] = JSON.parse(raw);
    const cutoff = Date.now() - MAX_AGE_MS;
    const map = new Map<string, GameHistory>();
    for (const [id, entry] of entries) {
      if (new Date(entry.game.commenceTime).getTime() >= cutoff) {
        map.set(id, entry);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

function saveCompletedGames(map: Map<string, GameHistory>) {
  try {
    const completed = [...map.entries()].filter(([, e]) => e.game.completed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completed));
  } catch { /* storage full or unavailable */ }
}

export function useMichiganOdds() {
  const [status, setStatus] = useState<FetchStatus>('loading');
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [gameHistories, setGameHistories] = useState<Map<string, GameHistory>>(loadCompletedGames);

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
            // Start from previously known completed games (localStorage-backed)
            const next = new Map(prev);

            // Overlay with latest from API (always wins)
            for (const game of data.games) {
              next.set(game.id, { game, history: game.history });
            }

            saveCompletedGames(next);
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
