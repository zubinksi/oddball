import type { FetchStatus } from '../hooks/useMichiganOdds';

interface Props {
  status: FetchStatus;
  lastUpdate: number | null;
}

const statusConfig: Record<FetchStatus, { label: string; color: string }> = {
  loading:  { label: 'Loading…', color: '#f59e0b' },
  ok:       { label: 'Live',     color: '#10b981' },
  no_games: { label: 'No games', color: '#6b7280' },
  error:    { label: 'Error',    color: '#ef4444' },
};

export function StatusBar({ status, lastUpdate }: Props) {
  const cfg = statusConfig[status];
  const updatedAt = lastUpdate
    ? new Date(lastUpdate).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
    : null;

  return (
    <div style={styles.bar}>
      <div style={styles.left}>
        <span style={{ ...styles.dot, background: cfg.color }} />
        <span style={{ color: cfg.color, fontWeight: 600, fontSize: 13 }}>{cfg.label}</span>
      </div>
      {updatedAt && <span style={styles.updated}>Last update: {updatedAt}</span>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' },
  left:    { display: 'flex', alignItems: 'center', gap: 8 },
  dot:     { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' },
  updated: { fontSize: 12, color: '#6b7280' },
};
