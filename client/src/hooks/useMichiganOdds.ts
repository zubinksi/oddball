import { useEffect, useState } from 'react';
import type { MichiganGame, OddsResponse } from '../types';

const POLL_INTERVAL_MS = 30_000;
const STORAGE_KEY = 'michiganOddsHistory';
const MAX_AGE_SECS = 4 * 60 * 60; // keep up to 4 hours of history

export interface GameHistory {
  game: MichiganGame;
  history: { time: number; value: number }[];
}

export type FetchStatus = 'loading' | 'ok' | 'no_games' | 'error';

function loadStoredHistories(): Map<string, GameHistory> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const entries: [string, GameHistory][] = JSON.parse(raw);
    const cutoff = Date.now() / 1000 - MAX_AGE_SECS;
    const map = new Map<string, GameHistory>();
    for (const [id, entry] of entries) {
      const trimmed = entry.history.filter((p) => p.time >= cutoff);
      if (trimmed.length > 0) map.set(id, { ...entry, history: trimmed });
    }
    return map;
  } catch {
    return new Map();
  }
}

function saveHistories(map: Map<string, GameHistory>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(map.entries())));
  } catch {
    // storage full or unavailable
  }
}

export function useMichiganOdds() {
  const [status, setStatus] = useState<FetchStatus>('loading');
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [gameHistories, setGameHistories] = useState<Map<string, GameHistory>>(loadStoredHistories);

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
          // Don't clear history — completed games from localStorage stay visible
        } else {
          setStatus('ok');
          setErrorMessage(null);
          setGameHistories((prev) => {
            const next = new Map(prev);
            for (const game of data.games) {
              const existing = next.get(game.id);
              const now = Date.now() / 1000;
              const point = { time: now, value: game.impliedProbability };

              if (game.completed && existing) {
                // Game just finished: only append the final point once
                const lastVal = existing.history[existing.history.length - 1]?.value;
                const history =
                  lastVal === game.impliedProbability
                    ? existing.history
                    : [...existing.history, point];
                next.set(game.id, { game, history });
              } else {
                next.set(game.id, {
                  game,
                  history: existing ? [...existing.history, point] : [point],
                });
              }
            }
            saveHistories(next);
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
