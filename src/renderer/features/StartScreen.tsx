import { useState } from 'react';
import { FilePlus, FolderOpen, Search, Sparkles } from 'lucide-react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { Modal } from '../components/ui';
import { newProjectFlow, openProject } from '../App';

/** File name and folder of a project path (Windows or POSIX separators). */
const splitPath = (p: string) => { const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')); return { name: p.slice(i + 1), dir: p.slice(0, Math.max(0, i)) }; };

/** Startup chooser: new project, open a file, search the recent projects, or keep the project restored at launch. */
export function StartScreen() {
  const tr = useT();
  const recent = useStore((s) => s.startScreen);
  const current = useStore((s) => s.project?.project.meta.name);
  const [query, setQuery] = useState('');
  if (!recent) return null;
  const close = () => useStore.setState({ startScreen: null });
  const open = async (path?: string) => { if (await openProject(path)) close(); };
  const q = query.trim().toLowerCase();
  const shown = recent.filter((p) => p.toLowerCase().includes(q));
  return (
    <Modal title={tr('start.title')} onClose={close} wide footer={<>
      <button className="btn ghost" onClick={() => { close(); useStore.getState().setHelp('demos'); }} data-testid="start-demos"><Sparkles size={14} />{tr('start.demos')}</button>
      <div className="grow" />
      <button className="btn" onClick={close} data-testid="start-continue">{tr('start.continue', { name: current ?? '' })}</button>
    </>}>
      <div className="col" style={{ gap: 14 }} data-testid="start-screen">
        <div className="start-choices">
          <button className="start-choice" onClick={() => { close(); newProjectFlow(); }} data-testid="start-new">
            <FilePlus size={22} /><b>{tr('start.new')}</b><span className="small muted">{tr('start.newHint')}</span>
          </button>
          <button className="start-choice" onClick={() => void open()} data-testid="start-open">
            <FolderOpen size={22} /><b>{tr('start.open')}</b><span className="small muted">{tr('start.openHint')}</span>
          </button>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <div className="row between"><b className="small">{tr('start.recent')}</b><span className="small dim">{recent.length}</span></div>
          {recent.length > 0 && (
            <label className="row start-search"><Search size={13} className="dim" />
              <input className="input grow" type="search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('start.search')} aria-label={tr('start.search')} data-testid="start-search" />
            </label>
          )}
          <div className="start-recent" role="list">
            {shown.map((p) => {
              const { name, dir } = splitPath(p);
              return (
                <button key={p} role="listitem" className="start-recent-item" onClick={() => void open(p)} title={p} data-testid="start-recent">
                  <FolderOpen size={14} className="dim" /><span className="grow col"><b>{name}</b><span className="small dim">{dir}</span></span>
                </button>
              );
            })}
            {!shown.length && <p className="small muted" style={{ margin: 0 }}>{recent.length ? tr('start.noMatch') : tr('start.none')}</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
