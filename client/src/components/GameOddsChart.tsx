import { Liveline } from 'liveline';
import type { GameHistory } from '../hooks/useMichiganOdds';

interface Props {
  entry: GameHistory;
}

const ACCENT = '#FFE3C4';

function formatPct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

export function GameOddsChart({ entry }: Props) {
  const { game, history } = entry;
  const opponent = game.isMichiganHome ? game.awayTeam : game.homeTeam;
  const venue = game.isMichiganHome ? 'vs' : '@';
  const pct = game.impliedProbability;

  const gameDate = new Date(game.commenceTime);
  const isUpcoming = gameDate > new Date();
  const dateLabel = gameDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return (
    <div style={styles.card}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.matchup}>
            <span style={styles.michigan}>Michigan</span>
            <span style={styles.venue}>{venue}</span>
            <span style={styles.opponent}>{opponent}</span>
          </div>
          {game.score && (
            <div style={styles.score}>
              <span style={styles.scoreValue}>{game.score.michigan}</span>
              <span style={styles.scoreDash}>–</span>
              <span style={styles.scoreValue}>{game.score.opponent}</span>
              {game.gameTime && (
                <span style={styles.gameTime}>{game.gameTime}</span>
              )}
            </div>
          )}
        </div>
        <div style={styles.dateBadge}>
          {isUpcoming ? '⏳ ' : '🏀 '}
          {dateLabel}
        </div>
      </div>

      {/* Probability headline */}
      <div style={styles.probSection}>
        <span style={styles.probLabel}>WIN PROBABILITY</span>
        <div style={styles.probRow}>
          <div style={styles.probTeam}>
            <span style={{ ...styles.probValue, color: pct >= 0.5 ? ACCENT : '#ef4444' }}>
              {formatPct(pct)}
            </span>
            <span style={styles.probTeamLabel}>Michigan</span>
          </div>
          <div style={{ ...styles.probTeam, alignItems: 'flex-end' }}>
            <span style={{ ...styles.probValue, color: pct < 0.5 ? '#ef4444' : '#6b7280' }}>
              {formatPct(1 - pct)}
            </span>
            <span style={styles.probTeamLabel}>{opponent}</span>
          </div>
        </div>
      </div>

      {/* Liveline chart */}
      <div style={styles.chartWrap}>
        <Liveline
          data={history}
          value={pct}
          color={ACCENT}
          theme="dark"
          formatValue={formatPct}
          window={300}
          windows={[
            { label: '5m', secs: 300 },
            { label: '30m', secs: 1800 },
            { label: '1h', secs: 3600 },
          ]}
          loading={history.length === 0}
          showValue={false}
          referenceLine={{ value: 0.5, label: '50%' }}
          grid
          fill
          pulse
          momentum
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    border: '0px solid #1f2937',
    borderRadius: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 8,
  },
  matchup: {
    fontSize: 20,
    fontWeight: 700,
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  michigan: { color: ACCENT },
  venue: { color: '#6b7280', fontWeight: 400 },
  opponent: { color: '#e5e7eb' },
  score: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    fontSize: 14,
  },
  scoreTeam: { color: '#9ca3af', fontSize: 12 },
  scoreValue: { color: '#e5e7eb', fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: 18 },
  scoreDash: { color: '#6b7280' },
  gameTime: { color: '#9ca3af', fontSize: 12, marginLeft: 4 },
  dateBadge: {
    fontSize: 12,
    color: '#9ca3af',
    background: '#1f2937',
    borderRadius: 6,
    padding: '4px 10px',
  },
  probSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  probRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  probTeam: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  probTeamLabel: { fontSize: 12, color: '#6b7280' },
  probLabel: { fontSize: 13, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' },
  probValue: { fontSize: 32, fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
  chartWrap: { height: 220 },
};
