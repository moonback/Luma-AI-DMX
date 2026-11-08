import { useEffect, useState } from 'react';
import { FolderOpen, RefreshCw, Trash2, X } from 'lucide-react';
import { confirmAction } from '../../store';
import { act } from '../../api';
import { Field, Modal, Panel } from '../../components/ui';
import type { Settings } from '../../../core/settings/settings';
import type { StorageReport } from '../../../core/app/storage';
import type { UpdateStatus } from '../../../core/app/updates';
import { useT } from '../../i18n';
import { openProject } from '../../App';
import { splitPath } from '../StartScreen';

/** Version, update channel and status. Updates install when the application quits, never during a show. */
export function UpdatesPanel({ value, onChange }: { value: Settings['general']; onChange: (v: Partial<Settings['general']>) => void }) {
  const tr = useT();
  const [info, setInfo] = useState<{ version: string; updates: UpdateStatus } | null>(null);
  useEffect(() => { void act({ type: 'app.info' }).then((x) => x && setInfo(x)); }, []);
  const u = info?.updates;
  const check = async () => {
    const r = await act({ type: 'app.checkUpdates' });
    if (r && info) setInfo({ ...info, updates: r });
  };
  const [open, setOpen] = useState(false);
  const canCheck = !!u && u.state !== 'disabled' && u.state !== 'checking';
  return (
    <Panel title={tr('settings.updates.title')} className="settings-card">
      <div className="settings-card-body">
        <span className="settings-card-icon"><RefreshCw size={18} /></span>
        <div className="col grow" style={{ gap: 4, minWidth: 0 }}>
          <span className="mono" data-testid="app-version">{info?.version ?? '…'}</span>
          <span className="row" data-testid="update-state">
            <span className={`badge ${u?.state === 'ready' ? 'ok' : u?.state === 'error' ? 'err' : ''}`}>{u ? tr(`settings.updates.state.${u.state}`) : '…'}</span>
            {u?.version && <span className="mono small">v{u.version}{u.state === 'downloading' && u.progress !== null ? ` · ${Math.round(u.progress * 100)} %` : ''}</span>}
          </span>
        </div>
      </div>
      <div className="row settings-card-actions">
        <button className="btn sm" disabled={!canCheck} onClick={() => void check()}>{tr('settings.updates.check')}</button>
        <button className="btn sm primary" onClick={() => setOpen(true)} data-testid="updates-open">{tr('settings.manage')}</button>
      </div>
      {open && (
        <Modal title={tr('settings.updates.title')} onClose={() => setOpen(false)} footer={<button className="btn" onClick={() => setOpen(false)}>{tr('common.close')}</button>}>
          <div className="grid g2">
            <Field label={tr('settings.updates.installed')}><span className="mono">{info?.version ?? '…'}</span></Field>
            <Field label={tr('settings.updates.update')}>
              <span className={`badge ${u?.state === 'ready' ? 'ok' : u?.state === 'error' ? 'err' : ''}`}>{u ? tr(`settings.updates.state.${u.state}`) : '…'}</span>
              {u?.detail && <div className="small dim">{u.detail}</div>}
            </Field>
            <Field label={tr('settings.updates.channel')} hint={tr('settings.updates.channelHint')}>
              <select className="select" value={value.updateChannel} onChange={(e) => onChange({ updateChannel: e.target.value as Settings['general']['updateChannel'] })}>
                <option value="stable">{tr('settings.updates.stable')}</option><option value="beta">{tr('settings.updates.beta')}</option>
              </select>
            </Field>
            <label className="check"><input type="checkbox" checked={value.autoUpdate} onChange={(e) => onChange({ autoUpdate: e.target.checked })} />{tr('settings.updates.auto')}</label>
          </div>
          <div className="row" style={{ marginTop: 12 }}><button className="btn" disabled={!canCheck} onClick={() => void check()}>{tr('settings.updates.check')}</button></div>
          <p className="small dim" style={{ marginBottom: 0 }}>{tr('settings.updates.pendingSave')}</p>
        </Modal>
      )}
    </Panel>
  );
}

export function RecentPanel({ recent, onChange }: { recent: string[]; onChange: (list: string[]) => void }) {
  const tr = useT();
  const clearAll = async () => {
    if (await confirmAction({ title: tr('settings.recent.clearTitle'), message: tr('settings.recent.clearMessage'), confirmLabel: tr('settings.recent.clear'), danger: true })) onChange([]);
  };
  return (
    <Panel title={tr('start.recent')} actions={recent.length > 0 && <button className="btn ghost sm" onClick={() => void clearAll()} data-testid="recent-clear"><Trash2 size={12} />{tr('settings.recent.clear')}</button>}>
      {recent.length ? (
        <div className="start-recent" role="list" style={{ maxHeight: 'none' }}>
          {recent.slice(0, RECENT_SHOWN).map((p) => {
            const { name, dir } = splitPath(p);
            return (
              <div key={p} role="listitem" className="row" style={{ gap: 4 }}>
                <button className="start-recent-item grow" onClick={() => void openProject(p)} title={p}>
                  <FolderOpen size={14} className="dim" /><span className="grow col"><b>{name}</b><span className="small dim">{dir}</span></span>
                </button>
                <button className="btn ghost sm icon" onClick={() => onChange(recent.filter((x) => x !== p))} title={tr('settings.recent.remove')} aria-label={`${tr('settings.recent.remove')} : ${name}`} data-testid="recent-remove"><X size={13} /></button>
              </div>
            );
          })}
        </div>
      ) : <p className="small muted" style={{ margin: 0 }}>{tr('start.none')}</p>}
      {recent.length > RECENT_SHOWN && <p className="small dim" style={{ margin: '8px 0 0' }}>{tr('settings.recent.more', { n: recent.length - RECENT_SHOWN })}</p>}
    </Panel>
  );
}
const RECENT_SHOWN = 5;

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} Mo`;
/** Disk used by imported audio, the AI cache and recovery copies; purges only what is no longer referenced. */
export function StoragePanel() {
  const tr = useT();
  const [r, setR] = useState<StorageReport | null>(null);
  const load = () => void act({ type: 'storage.report' }).then((x) => setR(x ?? null));
  useEffect(load, []);
  const purge = async (what: 'music' | 'aiCache' | 'autosave') => {
    if (!(await confirmAction({ title: tr('settings.storage.purgeTitle'), message: tr(`settings.storage.purge.${what}`), confirmLabel: tr('settings.storage.purge') }))) return;
    await act({ type: 'storage.purge', [what]: true });
    load();
  };
  if (!r) return null;
  const rows = [
    { id: 'music' as const, label: tr('settings.storage.music', { n: r.music.files, size: mb(r.music.bytes), orphans: r.music.orphans, orphanSize: mb(r.music.orphanBytes) }), can: r.music.orphans > 0 },
    { id: 'aiCache' as const, label: tr('settings.storage.aiCache', { n: r.aiCache.files, size: mb(r.aiCache.bytes) }), can: r.aiCache.files > 0 },
    { id: 'autosave' as const, label: tr('settings.storage.autosave', { n: r.autosave.files, size: mb(r.autosave.bytes), stale: r.autosave.stale }), can: r.autosave.stale > 0 },
  ];
  return (
    <Panel title={tr('settings.storage.title')}>
      <table className="table small" data-testid="storage-report"><tbody>
        {rows.map((row) => (
          <tr key={row.id}><td>{row.label}</td><td style={{ textAlign: 'right' }}><button className="btn sm" disabled={!row.can} onClick={() => void purge(row.id)}>{tr('settings.storage.purge')}</button></td></tr>
        ))}
      </tbody></table>
    </Panel>
  );
}
