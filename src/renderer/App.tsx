import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  Activity, AudioLines, Bell, Bot, Box, Cable, ChartGantt, FilePlus, FolderOpen, LayoutDashboard, Lightbulb, ListOrdered, OctagonX, Palette,
  Music2, PanelLeftClose, PanelLeftOpen, Save, Settings as SettingsIcon, SlidersHorizontal, Sparkles, Terminal, Theater, X, Moon, Play,
} from 'lucide-react';
import { BRAND } from '../shared/brand';
import { PAGES, useStore, confirmAction, type PageId } from './store';
import { act, call } from './api';
import { ConfirmHost, Modal, Field } from './components/ui';
import { allowedWhileTyping, bindingsFrom, comboFromEvent } from './shortcuts';
import { resolveShortcuts, type ShortcutAction } from '../core/settings/settings';
import { Dashboard } from './features/Dashboard';
import { Fixtures } from './features/Fixtures';
import { LiveConsole } from './features/LiveConsole';
import { Programmer } from './features/Programmer';
import { Cues } from './features/Cues';
import { Effects } from './features/Effects';
import { TimelinePage } from './features/Timeline';
import { AiDirector } from './features/AiDirector';
import { StageVisualizer3D, Visualizer } from './features/Visualizer';
import { AudioPage } from './features/Audio';
import { MusicPage } from './features/Music';
import { OutputPage } from './features/Output';
import { SettingsPage } from './features/Settings';
import { externalControl } from './control';
import { HelpButton, OnboardingHost } from './features/Onboarding';
import { StartScreen } from './features/StartScreen';
import { t, useT } from './i18n';

const ICONS: Record<PageId, ComponentType<{ size?: number }>> = {
  dashboard: LayoutDashboard, fixtures: Lightbulb, console: SlidersHorizontal, programmer: Palette, cues: ListOrdered, effects: Sparkles,
  timeline: ChartGantt, ai: Bot, visualizer: Theater, stage3d: Box, audio: AudioLines, music: Music2, output: Cable, settings: SettingsIcon,
};
const VIEWS: Record<PageId, ComponentType> = {
  dashboard: Dashboard, fixtures: Fixtures, console: LiveConsole, programmer: Programmer, cues: Cues, effects: Effects,
  timeline: TimelinePage, ai: AiDirector, visualizer: Visualizer, stage3d: StageVisualizer3D, audio: AudioPage, music: MusicPage, output: OutputPage, settings: SettingsPage,
};

export function newProjectFlow(): void {
  useStore.setState({ newProjectOpen: true });
}

async function guardUnsaved(): Promise<boolean> {
  if (!useStore.getState().project?.dirty) return true;
  return confirmAction({ title: t('project.unsavedTitle'), message: t('project.unsavedMessage'), confirmLabel: t('project.unsavedConfirm') });
}

/** Opens a project file (dialog when no path); true when a project was opened. */
export async function openProject(path?: string): Promise<boolean> {
  if (!(await guardUnsaved())) return false;
  return !!(await act({ type: 'project.open', ...(path ? { path } : {}) }))?.opened;
}

function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const tr = useT();
  const [name, setName] = useState(() => t('project.defaultName'));
  const create = async () => {
    if (!(await guardUnsaved())) return;
    if (await act({ type: 'project.new', name: name.trim() || t('project.defaultName') })) onClose();
  };
  return (
    <Modal title={tr('project.new')} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{tr('common.cancel')}</button><button className="btn primary" onClick={() => void create()}>{tr('common.create')}</button></>}>
      <Field label={tr('project.name')}><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void create()} /></Field>
    </Modal>
  );
}

function TopBar() {
  const tr = useT();
  const project = useStore((s) => s.project);
  const rt = useStore((s) => s.runtime);
  const toggleDiag = useStore((s) => s.toggleDiag);
  const [showNew, setShowNew] = useState(false);
  const newOpen = useStore((s) => s.newProjectOpen);
  useEffect(() => {
    if (newOpen) {
      setShowNew(true);
      useStore.setState({ newProjectOpen: false });
    }
  }, [newOpen]);
  const taps = useRef<number[]>([]);
  const outputs = rt?.outputs ?? [];
  const errors = outputs.filter((o) => o.state === 'error').length;
  const ready = outputs.filter((o) => o.state === 'ready').length;
  const live = rt?.liveMode ?? false;
  const transmitting = rt?.transmitting ?? true;
  const pb = rt?.engine.playbacks.find((p) => p.state !== 'idle');
  const alerts = rt?.alerts.length ?? 0;

  const tap = () => {
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 3000), now];
    if (taps.current.length >= 3) {
      const iv = taps.current.slice(1).map((t, i) => t - taps.current[i]!);
      const bpm = Math.round(60000 / (iv.reduce((a, b) => a + b, 0) / iv.length));
      if (bpm >= 20 && bpm <= 300) void act({ type: 'engine.bpm', bpm });
    }
  };

  return (
    <header className="topbar">
      <div className="brand"><div className="brand-mark" />{BRAND.productName}</div>
      <div className="top-project" title={project?.path ?? tr('project.unsaved')}>
        <b>{project?.project.meta.name ?? '…'}{project?.dirty ? ' •' : ''}</b>
        <span className="small muted">{project?.project.meta.show || (pb ? tr('project.cue', { name: pb.cueName ?? '–' }) : tr('project.noCue'))}</span>
      </div>
      <div className="row">
        <button className="btn ghost icon" title={tr('project.newShortcut')} onClick={() => setShowNew(true)}><FilePlus size={16} /></button>
        <button className="btn ghost icon" title={tr('project.openShortcut')} onClick={() => void openProject()}><FolderOpen size={16} /></button>
        <button className="btn ghost icon" title={tr('project.saveShortcut')} data-testid="save" onClick={() => void act({ type: 'project.save' })}><Save size={16} /></button>
      </div>
      <div className="top-sep" />
      <span className={`mode-badge ${live ? 'live' : ''}`} data-testid="mode" title={live ? tr('top.liveTitle') : tr('top.simulationTitle')}>{live ? 'LIVE' : 'SIMULATION'}</span>
      <div className="stat" title={outputs.map((o) => `${o.name} : ${o.state}`).join('\n')}>
        <span className="k">{tr('top.output')}</span>
        <span className="v row" style={{ gap: 6 }}><span className={`led ${errors ? 'err' : !transmitting ? 'warn' : ready ? 'ok' : ''}`} />{errors ? tr('top.outputErrors', { n: errors }) : !transmitting ? tr('top.outputStopped') : tr('top.outputActive', { n: ready })}</span>
      </div>
      <div className="stat" title={tr('top.engineTitle', { tick: rt?.engine.metrics.avgTickMs ?? 0, jitter: rt?.engine.metrics.jitterMs ?? 0 })}>
        <span className="k">{tr('top.engine')}</span>
        <span className="v row" style={{ gap: 6 }}><span className={`led ${rt?.engine.running ? 'ok' : 'err'}`} />{rt ? `${rt.engine.metrics.measuredHz} Hz` : '–'}</span>
      </div>
      <button className="stat btn ghost" style={{ height: 'auto', padding: '2px 6px', alignItems: 'flex-start' }} onClick={tap} title={tr('top.tapTitle')}>
        <span className="k">BPM {rt?.engine.bpmSource === 'audio' ? '· audio' : ''}</span>
        <span className="v">{rt ? rt.engine.bpm.toFixed(0) : '–'}</span>
      </button>
      <div className="stat" title={rt?.ai.lastError ?? ''}>
        <span className="k">{tr('top.ai')}</span>
        <span className="v row" style={{ gap: 6 }}><span className={`led ${rt?.ai.busy ? 'violet' : rt?.ai.lastError ? 'warn' : 'ok'}`} />{rt?.ai.provider === 'openrouter' && rt.ai.hasKey ? 'OpenRouter' : tr('top.aiLocal')}</span>
      </div>
      <div className="grow" />
      <HelpButton />
      <button className="btn ghost icon" title={tr('top.alerts', { n: alerts })} onClick={toggleDiag} style={{ position: 'relative' }}>
        <Bell size={16} />
        {alerts > 0 && <span className="badge err" style={{ position: 'absolute', top: -4, right: -8, height: 16, padding: '0 4px' }}>{alerts}</span>}
      </button>
      <button className={`btn ${rt?.engine.blackout ? 'danger solid' : ''}`} data-testid="blackout" title={tr('top.blackoutTitle')} onClick={() => void act({ type: 'engine.blackout', on: !rt?.engine.blackout })}>
        <Moon size={15} />{tr('top.blackout')}
      </button>
      {transmitting ? (
        <button className="btn danger solid lg" data-testid="stop-output" title={tr('top.stopTitle')} onClick={() => void act({ type: 'output.transmit', on: false })}>
          <OctagonX size={18} />STOP
        </button>
      ) : (
        <button className="btn accent lg" title={tr('top.resumeTitle')} onClick={() => void act({ type: 'output.transmit', on: true })}><Play size={16} />{tr('top.resume')}</button>
      )}
      {showNew && <NewProjectDialog onClose={() => setShowNew(false)} />}
    </header>
  );
}

function Sidebar() {
  const tr = useT();
  const page = useStore((s) => s.page);
  const setPage = useStore((s) => s.setPage);
  const collapsed = useStore((s) => s.collapsed);
  const toggle = useStore((s) => s.toggleCollapsed);
  const keys = resolveShortcuts(useStore((s) => s.shortcuts));
  return (
    <nav className="sidebar" aria-label={tr('nav.aria')}>
      {PAGES.map((p) => {
        const Icon = ICONS[p.id];
        const k = keys[`page:${p.id}` as ShortcutAction];
        const label = tr(`nav.${p.id}`);
        return (
          <button key={p.id} className={`nav-item ${page === p.id ? 'active' : ''}`} onClick={() => setPage(p.id)} title={`${label}${k ? ` (${k})` : ''}`} data-testid={`nav-${p.id}`}>
            <Icon size={17} /><span>{label}</span>{k && <span className="kbd">{k.replace('Ctrl+', '^')}</span>}
          </button>
        );
      })}
      <div className="grow" />
      <button className="nav-item" onClick={toggle} title={collapsed ? tr('nav.expand') : tr('nav.collapse')}>
        {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}<span>{tr('nav.collapse')}</span>
      </button>
    </nav>
  );
}

function StatusBar() {
  const tr = useT();
  const rt = useStore((s) => s.runtime);
  const project = useStore((s) => s.project);
  const toggleDiag = useStore((s) => s.toggleDiag);
  const m = rt?.engine.metrics;
  return (
    <footer className="statusbar">
      <span className="item"><Activity size={12} />{m ? tr('status.engine', { measured: m.measuredHz, rate: m.rateHz, tick: m.avgTickMs.toFixed(2), load: (m.load * 100).toFixed(1) }) : tr('status.engineLoading')}</span>
      <span className="item">{tr('status.rig', { fixtures: project?.project.patch.length ?? 0, universes: project?.project.show.universes ?? 0 })}</span>
      <span className="item">{tr('status.programmer', { n: rt?.engine.programmerCount ?? 0 })}</span>
      {rt?.engine.aiActive && <span className="item"><span className="led violet" />{tr('status.aiLayer')}</span>}
      {rt?.testPattern && <span className="item"><span className="led warn" />{tr('status.testPattern')}</span>}
      {rt?.safety.violation && <span className="item" data-testid="flash-alert" title={rt.safety.reason ?? ''}><span className="led warn" />{tr('status.flashes')}{rt.safety.flashGuard === 'limit' ? tr('status.flashesLimited') : ''}</span>}
      {rt?.audio.active && <span className="item"><AudioLines size={12} />{tr('status.audio')} {rt.audio.source === 'simulated' ? tr('status.audioSimulated') : ''}</span>}
      <div className="grow" />
      <span className="item">Master {Math.round((rt?.engine.master ?? 1) * 100)} %</span>
      <button className="btn ghost sm" onClick={toggleDiag} title={tr('status.diagnosticsTitle')}><Terminal size={12} />{tr('status.diagnostics')}</button>
    </footer>
  );
}

function DiagnosticsDrawer() {
  const tr = useT();
  const open = useStore((s) => s.diagOpen);
  const logs = useStore((s) => s.logs);
  const toggle = useStore((s) => s.toggleDiag);
  const end = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState<'all' | 'warn'>('all');
  // scrollTop plutôt que scrollIntoView : ce dernier fait aussi défiler la page (écran noir à la fermeture).
  useEffect(() => { if (end.current) end.current.scrollTop = end.current.scrollHeight; }, [logs.length, open]);
  if (!open) return null;
  const shown = level === 'all' ? logs : logs.filter((l) => l.level === 'warn' || l.level === 'error');
  return (
    <div className="drawer" data-testid="diagnostics">
      <div className="panel-head">
        <h2>{tr('diag.title')}</h2>
        <div className="chips">
          <button className={`chip ${level === 'all' ? 'on' : ''}`} onClick={() => setLevel('all')}>{tr('diag.all')}</button>
          <button className={`chip ${level === 'warn' ? 'on' : ''}`} onClick={() => setLevel('warn')}>{tr('diag.alerts')}</button>
        </div>
        <div className="grow" />
        <button className="btn ghost sm icon" onClick={toggle} title={tr('common.close')}><X size={14} /></button>
      </div>
      <div ref={end} style={{ overflow: 'auto', flex: 1, padding: '6px 0' }}>
        {shown.length === 0 && <div className="empty small">{tr('diag.empty')}</div>}
        {shown.map((l) => (
          <div key={l.id} className={`log-line ${l.level}`}>
            <span className="dim">{l.t.slice(11, 19)}</span><span>{l.level.toUpperCase()}</span><span className="muted">{l.source}</span><span>{l.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismiss);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          <div className="grow"><div style={{ fontWeight: 600 }}>{t.title}</div>{t.detail && <div className="small muted">{t.detail}</div>}</div>
          <button className="btn ghost sm icon" onClick={() => dismiss(t.id)}><X size={12} /></button>
        </div>
      ))}
    </div>
  );
}

export function runShortcut(action: ShortcutAction): boolean {
  const s = useStore.getState();
  const list = s.cueListId;
  if (action.startsWith('page:')) {
    s.setPage(action.slice(5) as PageId);
    return true;
  }
  switch (action) {
    case 'go': if (list) void act({ type: 'cue.go', listId: list }); return !!list;
    case 'back': if (list) void act({ type: 'cue.back', listId: list }); return !!list;
    case 'pause': {
      if (!list) return false;
      const st = s.runtime?.engine.playbacks.find((p) => p.cueListId === list)?.state;
      void act({ type: st === 'paused' ? 'cue.resume' : 'cue.pause', listId: list });
      return true;
    }
    case 'blackout': void act({ type: 'engine.blackout', on: !s.runtime?.engine.blackout }); return true;
    case 'stopOutput': void act({ type: 'output.transmit', on: false }); return true;
    case 'release': void act({ type: 'programmer.release' }); return true;
    case 'save': void act({ type: 'project.save' }); return true;
    case 'saveAs': void act({ type: 'project.saveAs' }); return true;
    case 'open': void openProject(); return true;
    case 'new': newProjectFlow(); return true;
    case 'diagnostics': s.toggleDiag(); return true;
    default: return false;
  }
}

function useShortcuts() {
  const overrides = useStore((s) => s.shortcuts);
  useEffect(() => {
    const bindings = bindingsFrom(overrides);
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (s.capturingShortcut) return;
      const combo = comboFromEvent(e);
      if (!combo) return;
      const action = bindings.get(combo);
      if (!action) return;
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
      if (typing && !allowedWhileTyping(combo)) return;
      if (s.confirm && action !== 'stopOutput') return;
      if (runShortcut(action)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overrides]);
}

export function App() {
  const tr = useT();
  const page = useStore((s) => s.page);
  const collapsed = useStore((s) => s.collapsed);
  const ready = useStore((s) => !!s.project);
  useShortcuts();
  const View = VIEWS[page];
  return (
    <div className={`app ${collapsed ? 'collapsed' : ''}`}>
      <TopBar />
      <Sidebar />
      <main className="main">{ready ? <View key={page} /> : <div className="empty">{tr('app.connecting')}</div>}</main>
      <StatusBar />
      <DiagnosticsDrawer />
      <Toasts />
      <OnboardingHost />
      <StartScreen />
      <ConfirmHost />
    </div>
  );
}

export async function bootstrap(): Promise<void> {
  const [project, logs, settings] = await Promise.all([call({ type: 'project.get' }), call({ type: 'logs.recent' }), call({ type: 'settings.get' })]);
  document.documentElement.classList.toggle('reduced-motion', settings.appearance.reducedMotion);
  document.documentElement.dataset.theme = settings.appearance.theme;
  document.documentElement.style.zoom = String(settings.appearance.uiScale);
  useStore.setState({ shortcuts: settings.shortcuts, language: settings.appearance.language, onboarding: settings.onboarding, help: settings.onboarding.completed ? null : 'welcome', startScreen: settings.onboarding.completed ? settings.general.recentProjects : null });
  void externalControl.configure(settings.control);
  useStore.setState({ project, logs, cueListId: project.project.cueLists[0]?.id ?? null });
}
