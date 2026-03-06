import { useState } from 'react';
import { useMichiganOdds } from './hooks/useMichiganOdds';
import { GameOddsChart } from './components/GameOddsChart';
import { StatusBar } from './components/StatusBar';
import type { GameHistory } from './hooks/useMichiganOdds';
import type { TrackedGame } from './types';

const ACCENT = '#fbcf9a';

function isLive(game: TrackedGame): boolean {
  return !game.completed && (game.gameTime !== null || game.score !== null);
}

function CollapsedGame({ entry }: { entry: GameHistory }) {
  const [expanded, setExpanded] = useState(false);
  const { game } = entry;
  const opponent = game.isTrackedTeamHome ? game.awayTeam : game.homeTeam;
  const venue = game.isTrackedTeamHome ? 'vs' : '@';
  const trackedScore = game.score
    ? (game.isTrackedTeamHome ? game.score.home : game.score.away)
    : null;
  const opponentScore = game.score
    ? (game.isTrackedTeamHome ? game.score.away : game.score.home)
    : null;

  return (
    <div style={collapsedStyles.wrapper}>
      <button
        onClick={() => setExpanded((e) => !e)}
        style={collapsedStyles.header}
        aria-expanded={expanded}
      >
        <div style={collapsedStyles.matchup}>
          <span style={collapsedStyles.tracked}>{game.trackedTeam}</span>
          <span style={collapsedStyles.venue}>{venue}</span>
          <span style={collapsedStyles.opponent}>{opponent}</span>
        </div>
        <div style={collapsedStyles.right}>
          {trackedScore !== null && (
            <div style={collapsedStyles.score}>
              <span style={collapsedStyles.scoreVal}>{trackedScore}</span>
              <span style={collapsedStyles.scoreDash}>–</span>
              <span style={collapsedStyles.scoreVal}>{opponentScore}</span>
              {game.gameTime && (
                <span style={collapsedStyles.gameTime}>{game.gameTime}</span>
              )}
            </div>
          )}
          <span style={collapsedStyles.chevron}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>
      {expanded && (
        <div style={collapsedStyles.body}>
          <GameOddsChart entry={entry} />
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { status, lastUpdate, errorMessage, gameHistories } = useMichiganOdds();

  const allGames = [...gameHistories.values()].sort((a, b) => {
    const aLive = isLive(a.game);
    const bLive = isLive(b.game);
    if (aLive !== bLive) return aLive ? -1 : 1;
    if (a.game.completed !== b.game.completed) return a.game.completed ? 1 : -1;
    return new Date(a.game.commenceTime).getTime() - new Date(b.game.commenceTime).getTime();
  });

  const liveGames = allGames.filter((e) => isLive(e.game));
  const otherGames = allGames.filter((e) => !isLive(e.game));

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Page header */}
        <header style={styles.header}>
          <StatusBar status={status} lastUpdate={lastUpdate} />
        </header>

        {/* Content */}
        <main style={styles.main}>
          {errorMessage && (
            <div style={styles.notice}>
              <strong>API error:</strong> {errorMessage}
            </div>
          )}

          {status === 'loading' && allGames.length === 0 && (
            <div style={styles.placeholder}>
              <p style={styles.placeholderText}>Fetching odds…</p>
            </div>
          )}

          {status === 'no_games' && (
            <div style={styles.placeholder}>
              <p style={styles.placeholderText}>No games with active odds right now.</p>
              <p style={styles.placeholderSub}>See you at tipoff.</p>
            </div>
          )}

          {allGames.length > 0 && (
            <div style={styles.grid}>
              {/* Live games: first shown in full, the rest collapsed */}
              {liveGames.map((entry, i) =>
                i === 0 ? (
                  <GameOddsChart key={entry.game.id} entry={entry} />
                ) : (
                  <CollapsedGame key={entry.game.id} entry={entry} />
                )
              )}

              {/* Divider between live and other games when both are present */}
              {liveGames.length > 0 && otherGames.length > 0 && (
                <div style={styles.divider} />
              )}

              {otherGames.map((entry) => (
                <GameOddsChart key={entry.game.id} entry={entry} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    padding: '24px 16px',
    background: '#111111',
  },
  container: {
    maxWidth: 900,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  header: {
    borderBottom: '1px solid #6b7280',
    paddingBottom: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  main: { display: 'flex', flexDirection: 'column', gap: 16 },
  grid: { display: 'flex', flexDirection: 'column', gap: 20 },
  divider: {
    borderTop: '1px solid #1f2937',
    margin: '4px 0',
  },
  notice: {
    background: '#1f0a0a',
    border: '1px solid #7f1d1d',
    borderRadius: 8,
    padding: '12px 16px',
    color: '#fca5a5',
    fontSize: 14,
  },
  placeholder: {
    textAlign: 'center',
    padding: '64px 0',
  },
  placeholderText: {
    fontSize: 18,
    color: '#6b7280',
    fontWeight: 600,
  },
  placeholderSub: {
    fontSize: 14,
    color: '#5d636f',
    marginTop: 8,
  },
};

const collapsedStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    borderRadius: 10,
    background: '#181818',
    overflow: 'hidden',
  },
  header: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    gap: 12,
    textAlign: 'left',
  },
  matchup: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    fontSize: 16,
    fontWeight: 700,
    flexWrap: 'wrap',
  },
  tracked: { color: ACCENT },
  venue: { color: '#6b7280', fontWeight: 400 },
  opponent: { color: '#e5e7eb' },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    flexShrink: 0,
  },
  score: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  },
  scoreVal: {
    color: '#e5e7eb',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    fontSize: 16,
  },
  scoreDash: { color: '#6b7280' },
  gameTime: { color: '#9ca3af', fontSize: 12 },
  chevron: { color: '#6b7280', fontSize: 12 },
  body: {
    padding: '0 16px 16px',
    borderTop: '1px solid #1f2937',
    paddingTop: 16,
  },
};
