import { useMichiganOdds } from './hooks/useMichiganOdds';
import { GameOddsChart } from './components/GameOddsChart';
import { StatusBar } from './components/StatusBar';

const MAIZE = '#FFCB05';

export default function App() {
  const { status, lastUpdate, errorMessage, gameHistories } = useMichiganOdds();

  const games = [...gameHistories.values()].sort(
    (a, b) =>
      new Date(a.game.commenceTime).getTime() -
      new Date(b.game.commenceTime).getTime()
  );

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Page header */}
        <header style={styles.header}>
          <div style={styles.titleRow}>
            <div style={styles.logoWrap}>
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <circle cx="18" cy="18" r="18" fill={MAIZE} />
                <text x="18" y="24" textAnchor="middle" fontSize="18" fontWeight="800" fill="#00274C">M</text>
              </svg>
            </div>
            <div>
              <h1 style={styles.title}>Michigan Basketball</h1>
              <p style={styles.subtitle}>Real-time win probability</p>
            </div>
          </div>
          <StatusBar status={status} lastUpdate={lastUpdate} />
        </header>

        {/* Content */}
        <main style={styles.main}>
          {errorMessage && (
            <div style={styles.notice}>
              <strong>API error:</strong> {errorMessage}
            </div>
          )}

          {status === 'loading' && games.length === 0 && (
            <div style={styles.placeholder}>
              <p style={styles.placeholderText}>Fetching odds…</p>
            </div>
          )}

          {status === 'no_games' && (
            <div style={styles.placeholder}>
              <p style={styles.placeholderText}>No Michigan games with active odds right now.</p>
              <p style={styles.placeholderSub}>
                The chart will update automatically when odds become available.
              </p>
            </div>
          )}

          {games.length > 0 && (
            <div style={styles.grid}>
              {games.map((entry) => (
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
    background: '#0a0f1e',
  },
  container: {
    maxWidth: 900,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  header: {
    borderBottom: '1px solid #1f2937',
    paddingBottom: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  logoWrap: { flexShrink: 0 },
  title: {
    fontSize: 26,
    fontWeight: 800,
    color: '#FFCB05',
    letterSpacing: '-0.02em',
  },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  main: { display: 'flex', flexDirection: 'column', gap: 16 },
  grid: { display: 'flex', flexDirection: 'column', gap: 20 },
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
    color: '#4b5563',
    fontWeight: 600,
  },
  placeholderSub: {
    fontSize: 14,
    color: '#374151',
    marginTop: 8,
  },
  footer: {
    fontSize: 12,
    color: '#374151',
    textAlign: 'center',
    paddingTop: 16,
    borderTop: '1px solid #1f2937',
  },
  link: { color: '#6b7280', textDecoration: 'underline' },
};
