import { useEffect, useRef, useState } from 'react';
import type { MichiganOddsUpdate, MichiganGame } from '../types';

// Same-origin WebSocket – works in dev (Express+Vite middleware on port 3001)
// and production with no proxy needed.
// VITE_WS_URL overrides for remote deployments (e.g. "wss://api.example.com").
const WS_URL: string =
  import.meta.env.VITE_WS_URL ??
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

const RECONNECT_DELAY_MS = 3_000;

export interface GameHistory {
  game: MichiganGame;
  /** Time-series of avg implied probability snapshots */
  history: { time: number; value: number }[];
}

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

export function useMichiganOdds() {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [noGames, setNoGames] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Map of game id → accumulated history + latest snapshot
  const [gameHistories, setGameHistories] = useState<Map<string, GameHistory>>(new Map());

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      setStatus('connecting');

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (destroyed) { ws.close(); return; }
        setStatus('connected');
        setErrorMessage(null);
      };

      ws.onmessage = (evt) => {
        if (destroyed) return;
        try {
          const update: MichiganOddsUpdate = JSON.parse(evt.data as string);
          setLastUpdate(update.timestamp);

          if (update.type === 'no_games') {
            setNoGames(true);
            setGameHistories(new Map());
          } else if (update.type === 'error') {
            setErrorMessage(update.message ?? 'Unknown error');
          } else if (update.type === 'odds_update' && update.games) {
            setNoGames(false);
            setErrorMessage(null);
            setGameHistories((prev) => {
              const next = new Map(prev);
              for (const game of update.games!) {
                const existing = next.get(game.id);
                const point = { time: Date.now() / 1000, value: game.impliedProbability };
                if (existing) {
                  next.set(game.id, {
                    game,
                    history: [...existing.history, point],
                  });
                } else {
                  next.set(game.id, { game, history: [point] });
                }
              }
              return next;
            });
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onerror = () => {
        if (destroyed) return;
        setStatus('reconnecting');
      };

      ws.onclose = () => {
        if (destroyed) return;
        setStatus('reconnecting');
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    }

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  return { status, lastUpdate, noGames, errorMessage, gameHistories };
}
