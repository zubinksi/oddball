import type { ConnectionStatus } from '../hooks/useMichiganOdds';

interface Props {
  status: ConnectionStatus;
  lastUpdate: number | null;
}

const statusConfig: Record<ConnectionStatus, { label: string; color: string; dot: string }> = {
  connecting: { label: 'Connecting…', color: '#f59e0b', dot: '#f59e0b' },
  connected: { label: 'Live', color: '#10b981', dot: '#10b981' },
  reconnecting: { label: 'Reconnecting…', color: '#ef4444', dot: '#ef4444' },
  error: { label: 'Error', color: '#ef4444', dot: '#ef4444' },
};

export function StatusBar({ status, lastUpdate }: Props) {
  const cfg = statusConfig[status];

  const updatedAt = lastUpdate
    ? new Date(lastUpdate).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null;

  return (
    <div style={styles.bar}>
      <div style={styles.left}>
        <span style={{ ...styles.dot, background: cfg.dot }} />
        <span style={{ color: cfg.color, fontWeight: 600, fontSize: 13 }}>{cfg.label}</span>
      </div>
      {updatedAt && (
        <span style={styles.updated}>Last update: {updatedAt}</span>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
  },
  left: { display: 'flex', alignItems: 'center', gap: 8 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    display: 'inline-block',
  },
  updated: { fontSize: 12, color: '#6b7280' },
};
