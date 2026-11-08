import { createContext, useContext, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import type { Settings } from '../../../core/settings/settings';
import { useT } from '../../i18n';
import { defaultAt, isModified, searchSettings, setAt, type SettingDef, type TabId } from './registry';

/** Settings being edited (not yet saved) and their setter, shared with every `<Setting>`. */
export const SettingsDraft = createContext<{ s: Settings; setS: (s: Settings) => void } | null>(null);

/** Wraps one setting's control: anchor for the search, « Modifié » marker and « Rétablir » when it differs from the schema default. */
export function Setting({ path, children }: { path: string; children: ReactNode }) {
  const tr = useT();
  const draft = useContext(SettingsDraft);
  const modified = !!draft && isModified(draft.s, path);
  return (
    <div className={`setting-row ${modified ? 'modified' : ''}`} data-setting={path}>
      {children}
      {modified && (
        <div className="row setting-modified">
          <span className="badge cyan" title={tr('settings.modifiedHint')}>{tr('settings.modified')}</span>
          <button className="btn ghost sm" data-testid={`reset-${path}`} title={tr('settings.resetDefaultHint')} onClick={() => draft.setS(setAt(draft.s, path, defaultAt(path)))}>
            <RotateCcw size={12} />{tr('settings.resetDefault')}
          </button>
        </div>
      )}
    </div>
  );
}

/** Results of the global search: matching tabs, then matching settings with their tab and « Modifié » state. */
export function SettingsSearchResults({ query, onPick }: { query: string; onPick: (tab: TabId, def?: SettingDef) => void }) {
  const tr = useT();
  const draft = useContext(SettingsDraft);
  const { tabs, settings } = searchSettings(query, tr);
  return (
    <div className="settings-content settings-search-results" data-testid="settings-search-results">
      <header className="settings-hero"><div><h2>{tr('settings.search.results', { q: query.trim() })}</h2></div></header>
      {!tabs.length && !settings.length && <p className="muted">{tr('settings.search.none', { q: query.trim() })}</p>}
      {tabs.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <span className="small dim">{tr('settings.search.sections')}</span>
          {tabs.map((id) => <button key={id} className="btn sm" onClick={() => onPick(id)}>{tr(`settings.tab.${id}`)}</button>)}
        </div>
      )}
      <div className="col" style={{ gap: 6 }}>
        {settings.map((d) => (
          <button key={d.path} className="settings-search-item" data-testid={`search-hit-${d.path}`} onClick={() => onPick(d.tab, d)}>
            <span className="grow col" style={{ alignItems: 'flex-start', gap: 2 }}>
              <b>{tr(d.labelKey)}</b>
              <span className="small dim">{tr(`settings.tab.${d.tab}`)}{d.contextKey ? ` › ${tr(d.contextKey)}` : ''}</span>
            </span>
            {draft && isModified(draft.s, d.path) && <span className="badge cyan">{tr('settings.modified')}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
