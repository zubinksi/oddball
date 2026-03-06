import { Liveline } from 'liveline';
import type { GameHistory } from '../hooks/useMichiganOdds';

interface Props {
  entry: GameHistory;
}

const MAIZE = '#FFCB05';

function formatPct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function americanOddsLabel(odds: number) {
  return odds >= 0 ? `+${odds}` : `${odds}`;
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
        <div style={styles.matchup}>
          <span style={styles.michigan}>Michigan</span>
          <span style={styles.venue}>{venue}</span>
          <span style={styles.opponent}>{opponent}</span>
        </div>
        <div style={styles.dateBadge}>
          {isUpcoming ? '⏳ ' : '🏀 '}
          {dateLabel}
        </div>
      </div>

      {/* Probability headline */}
      <div style={styles.probRow}>
        <span style={styles.probLabel}>Michigan win probability</span>
        <span
          style={{
            ...styles.probValue,
            color: pct >= 0.5 ? MAIZE : '#ef4444',
          }}
        >
          {formatPct(pct)}
        </span>
      </div>

      {/* Liveline chart */}
      <div style={styles.chartWrap}>
        <Liveline
          data={history}
          value={pct}
          color={MAIZE}
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
          grid
          fill
          pulse
          momentum
          exaggerate
        />
      </div>

      {/* Bookmaker breakdown */}
      {game.bookmakers.length > 0 && (
        <div style={styles.bookmakers}>
          <div style={styles.bmHeader}>Bookmakers</div>
          <div style={styles.bmGrid}>
            {game.bookmakers.map((bm) => (
              <div key={bm.key} style={styles.bmRow}>
                <span style={styles.bmTitle}>{bm.title}</span>
                <span style={styles.bmOdds}>{americanOddsLabel(bm.americanOdds)}</span>
                <span
                  style={{
                    ...styles.bmProb,
                    color: bm.impliedProbability >= 0.5 ? MAIZE : '#ef4444',
                  }}
                >
                  {formatPct(bm.impliedProbability)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#111827',
    border: '1px solid #1f2937',
    borderRadius: 12,
    padding: '24px',
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
  michigan: { color: MAIZE },
  venue: { color: '#6b7280', fontWeight: 400 },
  opponent: { color: '#e5e7eb' },
  dateBadge: {
    fontSize: 12,
    color: '#9ca3af',
    background: '#1f2937',
    borderRadius: 6,
    padding: '4px 10px',
  },
  probRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  probLabel: { fontSize: 13, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' },
  probValue: { fontSize: 32, fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
  chartWrap: { height: 220 },
  bookmakers: { borderTop: '1px solid #1f2937', paddingTop: 12 },
  bmHeader: { fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 },
  bmGrid: { display: 'flex', flexDirection: 'column', gap: 4 },
  bmRow: {
    display: 'grid',
    gridTemplateColumns: '1fr auto auto',
    gap: 12,
    alignItems: 'center',
    fontSize: 13,
  },
  bmTitle: { color: '#d1d5db' },
  bmOdds: { color: '#6b7280', fontVariantNumeric: 'tabular-nums' },
  bmProb: { fontVariantNumeric: 'tabular-nums', fontWeight: 600, minWidth: 44, textAlign: 'right' },
};
