import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { resolveShortcuts, SHORTCUT_ACTIONS, shortcutConflicts } from '../../../core/settings/settings';
import { comboFromEvent } from '../../shortcuts';
import { useT } from '../../i18n';

export function ShortcutEditor({ value, onChange }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const tr = useT();
  const [capturing, setCapturing] = useState<string | null>(null);
  const bindings = resolveShortcuts(value);
  const conflicts = shortcutConflicts(bindings);
  const conflicted = new Set(conflicts.flat());
  useEffect(() => {
    useStore.setState({ capturingShortcut: capturing !== null });
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      const combo = comboFromEvent(e);
      if (!combo) return;
      e.preventDefault();
      e.stopPropagation();
      onChange({ ...value, [capturing]: combo });
      setCapturing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, value, onChange]);
  useEffect(() => () => useStore.setState({ capturingShortcut: false }), []);
  const label = (id: string) => SHORTCUT_ACTIONS.find((a) => a.id === id)?.label ?? id;
  return (
    <div>
      {conflicts.length > 0 && (
        <div className="small" style={{ padding: '8px 12px', color: '#fca5a5' }}>
          {tr('settings.shortcuts.conflicts', { list: conflicts.map((ids) => `« ${bindings[ids[0] as keyof typeof bindings]} » → ${ids.map(label).join(' / ')}`).join(' ; ') })}
        </div>
      )}
      <table className="table" data-testid="shortcut-table">
        <tbody>
          {SHORTCUT_ACTIONS.map((a) => {
            const combo = bindings[a.id];
            const custom = value[a.id] !== undefined;
            return (
              <tr key={a.id}>
                <td>{a.label}</td>
                <td style={{ width: 170 }}>
                  {capturing === a.id ? <span className="badge violet">{tr('settings.shortcuts.press')}</span> : combo ? <span className={`badge mono ${conflicted.has(a.id) ? 'err' : custom ? 'cyan' : ''}`}>{combo}</span> : <span className="dim small">{tr('settings.shortcuts.unassigned')}</span>}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {capturing === a.id ? (
                    <button className="btn ghost sm" onClick={() => setCapturing(null)}>{tr('common.cancel')}</button>
                  ) : (
                    <button className="btn ghost sm" data-testid={`rebind-${a.id}`} onClick={() => setCapturing(a.id)}>{tr('settings.shortcuts.edit')}</button>
                  )}
                  <button className="btn ghost sm" disabled={!combo} onClick={() => onChange({ ...value, [a.id]: '' })}>{tr('settings.shortcuts.clear')}</button>
                  <button className="btn ghost sm" disabled={!custom} onClick={() => { const { [a.id]: _, ...rest } = value; onChange(rest); }}>{tr('settings.shortcuts.default')}</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="row" style={{ padding: 12 }}>
        <button className="btn" disabled={!Object.keys(value).length} onClick={() => onChange({})}>{tr('settings.shortcuts.resetAll')}</button>
        <span className="small dim">{tr('settings.shortcuts.hint')}</span>
      </div>
    </div>
  );
}
