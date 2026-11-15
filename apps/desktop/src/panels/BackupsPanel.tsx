import type { HostBackupManifest } from '@involvex/ctrl-i';

export type BackupsPanelProps = {
  backupLabel: string;
  backupPassphrase: string;
  backupItems: HostBackupManifest[];
  setBackupLabel: (value: string) => void;
  setBackupPassphrase: (value: string) => void;
  onCreateBackup: () => void;
  onRefresh: () => void;
  onRestoreBackup: (backupId: string, encrypted: boolean) => void;
};

export function BackupsPanel(props: BackupsPanelProps) {
  const {
    backupLabel,
    backupPassphrase,
    backupItems,
    setBackupLabel,
    setBackupPassphrase,
    onCreateBackup,
    onRefresh,
    onRestoreBackup,
  } = props;

  return (
    <aside className="host-panel knowledge-panel">
      <p className="host-title">host backups</p>
      <p className="meta">
        Snapshots on this machine (`data/backups`). Optional passphrase (≥8)
        encrypts at rest (AES-256-GCM). Restore creates new workspaces.
      </p>
      <div className="host-row">
        <input
          className="host-input"
          value={backupLabel}
          onChange={(e) => setBackupLabel(e.target.value)}
          placeholder="label"
        />
        <input
          className="host-input"
          type="password"
          value={backupPassphrase}
          onChange={(e) => setBackupPassphrase(e.target.value)}
          placeholder="passphrase (optional)"
          autoComplete="new-password"
        />
        <button type="button" className="demo-btn" onClick={onCreateBackup}>
          snapshot
        </button>
        <button type="button" className="ghost-btn" onClick={onRefresh}>
          refresh
        </button>
      </div>
      <ul className="knowledge-list">
        {backupItems.map((b) => (
          <li key={b.id}>
            <code>{b.label ?? b.id.slice(0, 8)}</code> · {b.workspaceCount} ws ·{' '}
            {b.encrypted ? 'encrypted · ' : ''}
            {new Date(b.createdAt).toLocaleString()}
            <div className="host-row">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => onRestoreBackup(b.id, b.encrypted)}
              >
                restore
              </button>
            </div>
          </li>
        ))}
      </ul>
      {backupItems.length === 0 ? <p className="meta">no backups yet</p> : null}
    </aside>
  );
}
