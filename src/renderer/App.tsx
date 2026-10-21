import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  Activity, AudioLines, Bell, Bot, Cable, ChartGantt, ChevronDown, ClipboardList, FilePlus, FolderOpen, LayoutDashboard, Lightbulb, ListOrdered, OctagonX, Palette,
  Music2, PanelLeftClose, PanelLeftOpen, Save, Settings as SettingsIcon, SlidersHorizontal, Sparkles, Terminal, Theater, X, Moon, Play, Redo2, Undo2, Zap,
} from 'lucide-react';
import { BRAND } from '../shared/brand';
import logo from '../../public/logo.png';
import { PAGES, useStore, confirmAction, type PageId } from './store';
import { act, call } from './api';
import { ConfirmHost, Modal, Field } from './components/ui';
import { allowedWhileTyping, bindingsFrom, comboFromEvent } from './shortcuts';
import { resolveShortcuts, type ShortcutAction } from '../core/settings/settings';
import { Dashboard } from './features/Dashboard';
import { Fixtures } from './features/Fixtures';
import { DETACHED_CONSOLE_HASH, LiveConsole, openDetachedConsole } from './features/LiveConsole';
import { Programmer } from './features/Programmer';
import { Cues } from './features/Cues';
import { Effects } from './features/Effects';
import { QuickActionsPage } from './features/QuickActions';
import { TimelinePage } from './features/Timeline';
import { AiDirector } from './features/AiDirector';
import { DETACHED_STAGE_HASH, openDetachedStage, Visualizer } from './features/Visualizer';
import { AudioPage } from './features/Audio';
import { MusicPage } from './features/Music';
import { OutputPage } from './features/Output';
import { SettingsPage } from './features/Settings';
import { externalControl } from './control';
import { HelpButton, OnboardingHost } from './features/Onboarding';
import { StartScreen } from './features/StartScreen';
import { LicenseBadge } from './features/LicenseBadge';
import { MiniPlayer } from './features/music/MiniPlayer';
import { markWhatsNewSeen, whatsNewPending, WhatsNewHost } from './features/WhatsNew';
import { t, useT, type MessageKey } from './i18n';

const ICONS: Record<PageId, ComponentType<{ size?: number }>> = {
  dashboard: LayoutDashboard, fixtures: Lightbulb, console: SlidersHorizontal, programmer: Palette, cues: ListOrdered, effects: Sparkles, quick: Zap,
  timeline: ChartGantt, ai: Bot, visualizer: Theater, audio: AudioLines, music: Music2, output: Cable, settings: SettingsIcon,
};
const VIEWS: Record<PageId, ComponentType> = {
  dashboard: Dashboard, fixtures: Fixtures, console: LiveConsole, programmer: Programmer, cues: Cues, effects: Effects, quick: QuickActionsPage,
  timeline: TimelinePage, ai: AiDirector, visualizer: Visualizer, audio: AudioPage, music: MusicPage, output: OutputPage, settings: SettingsPage,
};

export function newProjectFlow(): void {
  useStore.setState({ newProjectOpen: true });
}

async function guardUnsaved(): Promise<boolean> {
  if (!useStore.getState().project?.dirty) return true;
  return confirmAction({ title: t('project.unsavedTitle'), message: t('project.unsavedMessage'), confirmLabel: t('project.unsavedConfirm') });
}

/** Set at startup from the settings; cleared once the detached windows have been opened. */
let detachStageOnOpen = false;
let detachConsoleOnOpen = false;

/** Opens the detached 3D / console windows once, when the settings ask for it and a project is opened, created or kept. */
export function detachStageIfWanted(): void {
  if (detachStageOnOpen) openDetachedStage();
  if (detachConsoleOnOpen) openDetachedConsole();
  detachStageOnOpen = detachConsoleOnOpen = false;
}

/** Opens a project file (dialog when no path); true when a project was opened. */
export async function openProject(path?: string): Promise<boolean> {
  if (!(await guardUnsaved())) return false;
  const opened = !!(await act({ type: 'project.open', ...(path ? { path } : {}) }))?.opened;
  if (opened) detachStageIfWanted();
  return opened;
}

/** Undo / redo of the whole project, with the step's label in a toast. */
export async function historyStep(direction: 'undo' | 'redo'): Promise<void> {
  const r = await act({ type: direction === 'undo' ? 'project.undo' : 'project.redo' });
  if (r) useStore.getState().toast(r.label ? { kind: 'info', title: t(direction === 'undo' ? 'history.undone' : 'history.redone', { label: r.label }) } : { kind: 'info', title: t('history.nothing') });
}

/** Releases programmer, AI layer, effects, playbacks and timeline after a confirmation (blackout and STOP are separate). */
export async function releaseAllFlow(): Promise<void> {
  if (await confirmAction({ title: t('top.releaseAllConfirmTitle'), message: t('top.releaseAllConfirm'), confirmLabel: t('top.releaseAll') })) await act({ type: 'engine.releaseAll' });
}

function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const tr = useT();
  const [name, setName] = useState(() => t('project.defaultName'));
  const create = async () => {
    if (!(await guardUnsaved())) return;
    if (!(await act({ type: 'project.new', name: name.trim() || t('project.defaultName') }))) return;
    detachStageIfWanted();
    onClose();
  };
  return (
    <Modal title={tr('project.new')} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{tr('common.cancel')}</button><button className="btn primary" onClick={() => void create()}>{tr('common.create')}</button></>}>
      <Field label={tr('project.name')}><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void create()} /></Field>
    </Modal>
  );
}

/** Dropdown menu for project actions (New / Open / Save / Undo / Redo). */
function ProjectMenu({ onNew }: { onNew: () => void }) {
  const tr = useT();
  const project = useStore((s) => s.project);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const dirty = project?.dirty ?? false;

  return (
    <div className="proj-menu-wrap" ref={ref}>
      <button
        className="proj-menu-btn btn ghost"
        onClick={() => setOpen((v) => !v)}
        title={project?.project.meta.name ?? '…'}
      >
        <span className="proj-menu-name">
          <b>{project?.project.meta.name ?? '…'}{dirty ? ' •' : ''}</b>
        </span>
        <ChevronDown size={13} className={`proj-menu-chevron ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <div className="proj-menu-dropdown">
          <button className="proj-menu-item" onClick={() => { setOpen(false); onNew(); }}>
            <FilePlus size={14} />{tr('project.newShortcut')}
          </button>
          <button className="proj-menu-item" onClick={() => { setOpen(false); void openProject(); }}>
            <FolderOpen size={14} />{tr('project.openShortcut')}
          </button>
          <div className="proj-menu-sep" />
          <button className="proj-menu-item" data-testid="save" onClick={() => { setOpen(false); void act({ type: 'project.save' }); }}>
            <Save size={14} />{tr('project.saveShortcut')}
          </button>
          <div className="proj-menu-sep" />
          <button
            className="proj-menu-item"
            data-testid="undo"
            disabled={!project?.history?.undo}
            onClick={() => { setOpen(false); void historyStep('undo'); }}
          >
            <Undo2 size={14} />{project?.history?.undoLabel ? tr('history.undoTitle', { label: project.history.undoLabel }) : tr('history.nothing')}
          </button>
          <button
            className="proj-menu-item"
            data-testid="redo"
            disabled={!project?.history?.redo}
            onClick={() => { setOpen(false); void historyStep('redo'); }}
          >
            <Redo2 size={14} />{project?.history?.redoLabel ? tr('history.redoTitle', { label: project.history.redoLabel }) : tr('history.nothing')}
          </button>
        </div>
      )}
    </div>
  );
}

/** Compact status pills — LED dot + short label, full detail in title tooltip. */
function StatusPills() {
  const tr = useT();
  const rt = useStore((s) => s.runtime);
  const taps = useRef<number[]>([]);
  const outputs = rt?.outputs ?? [];
  const errors = outputs.filter((o) => o.state === 'error').length;
  const ready = outputs.filter((o) => o.state === 'ready').length;
  const transmitting = rt?.transmitting ?? true;

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
    <div className="status-pills">
      {/* Output */}
      <div
        className="status-pill"
        title={outputs.map((o) => `${o.name} : ${o.state}`).join('\n') || tr('top.output')}
      >
        <span className={`led ${errors ? 'err' : !transmitting ? 'warn' : ready ? 'ok' : ''}`} />
        <span className="status-pill-label">
          {errors ? `${errors} err` : !transmitting ? 'stopped' : `${ready} out`}
        </span>
      </div>
      {/* Engine */}
      <div
        className="status-pill"
        title={tr('top.engineTitle', { tick: rt?.engine.metrics.avgTickMs ?? 0, jitter: rt?.engine.metrics.jitterMs ?? 0 })}
      >
        <span className={`led ${rt?.engine.running ? 'ok' : 'err'}`} />
        <span className="status-pill-label">{rt ? `${rt.engine.metrics.measuredHz} Hz` : '–'}</span>
      </div>
      {/* BPM tap */}
      <button
        className="status-pill status-pill-btn"
        onClick={tap}
        title={tr('top.tapTitle')}
      >
        <span className="led ok" style={{ background: 'var(--cyan)' }} />
        <span className="status-pill-label">{rt ? `${rt.engine.bpm.toFixed(0)} bpm` : '–'}</span>
      </button>
      {/* AI */}
      <div className="status-pill" title={rt?.ai.lastError ?? tr('top.ai')}>
        <span className={`led ${rt?.ai.busy ? 'violet' : rt?.ai.lastError ? 'warn' : 'ok'}`} />
        <span className="status-pill-label">AI</span>
      </div>
    </div>
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
  const live = rt?.liveMode ?? false;
  const transmitting = rt?.transmitting ?? true;
  const alerts = rt?.alerts.length ?? 0;
  const installPlanButton = useStore((s) => s.installPlanButton);

  return (
    <header className="topbar">
      {/* ── Left zone: logo + project dropdown ── */}
      <div className="top-left">
        <div className="brand"><img className="brand-logo" src={logo} alt={BRAND.productName} /></div>
        <ProjectMenu onNew={() => setShowNew(true)} />
        {installPlanButton && (
          <button className="btn ghost icon" data-testid="install-plan" title={tr('top.installPlanTitle')} onClick={() => void act({ type: 'patch.exportPlan' })}>
            <ClipboardList size={15} />
          </button>
        )}
      </div>

      {/* ── Centre: mode badge + compact status pills ── */}
      <div className="top-stats">
        <span className={`mode-badge ${live ? 'live' : ''}`} data-testid="mode" title={live ? tr('top.liveTitle') : tr('top.simulationTitle')}>
          {live ? 'LIVE' : 'SIM'}
        </span>
        <StatusPills />
      </div>

      {/* ── Right zone: alerts + critical actions ── */}
      <div className="top-right">
        <LicenseBadge />
        <HelpButton />
        <button className="btn ghost icon" title={tr('top.alerts', { n: alerts })} onClick={toggleDiag} style={{ position: 'relative' }}>
          <Bell size={16} />
          {alerts > 0 && <span className="badge err" style={{ position: 'absolute', top: -4, right: -8, height: 16, padding: '0 4px' }}>{alerts}</span>}
        </button>
        <button className="btn ghost icon" data-testid="release-all" title={tr('top.releaseAllTitle')} onClick={() => void releaseAllFlow()}>
          <Undo2 size={15} />
        </button>
        <button
          className={`btn icon ${rt?.engine.blackout ? 'danger solid' : 'ghost'}`}
          data-testid="blackout"
          title={tr('top.blackoutTitle')}
          onClick={() => void act({ type: 'engine.blackout', on: !rt?.engine.blackout })}
        >
          <Moon size={15} />
        </button>
        {transmitting ? (
          <button className="btn danger solid" data-testid="stop-output" title={tr('top.stopTitle')} onClick={() => void act({ type: 'output.transmit', on: false })}>
            <OctagonX size={16} />STOP
          </button>
        ) : (
          <button className="btn accent" title={tr('top.resumeTitle')} onClick={() => void act({ type: 'output.transmit', on: true })}>
            <Play size={15} />{tr('top.resume')}
          </button>
        )}
      </div>
      {showNew && <NewProjectDialog onClose={() => setShowNew(false)} />}
    </header>
  );
}

const NAV_GROUPS: { key: MessageKey; ids: PageId[] }[] = [
  { key: 'nav.group.live', ids: ['dashboard', 'console', 'programmer', 'cues', 'quick'] },
  { key: 'nav.group.create', ids: ['effects', 'timeline', 'ai', 'music'] },
  { key: 'nav.group.stage', ids: ['visualizer', 'fixtures', 'audio'] },
  { key: 'nav.group.config', ids: ['output', 'settings'] },
];

function Sidebar() {
  const tr = useT();
  const page = useStore((s) => s.page);
  const setPage = useStore((s) => s.setPage);
  const collapsed = useStore((s) => s.collapsed);
  const toggle = useStore((s) => s.toggleCollapsed);
  const keys = resolveShortcuts(useStore((s) => s.shortcuts));
  const rt = useStore((s) => s.runtime);
  const aiActive = rt?.engine.aiActive ?? false;
  return (
    <nav className="sidebar" aria-label={tr('nav.aria')}>
      
      <div className="sidebar-sep" />
      {NAV_GROUPS.map((group, gi) => (
        <div key={group.key} className="nav-group">
          {!collapsed && <span className="nav-group-label">{tr(group.key)}</span>}
          {collapsed && gi > 0 && <div className="nav-group-divider" />}
          {group.ids.map((id: string) => {
            const p = PAGES.find((pg) => pg.id === id)!;
            const Icon = ICONS[p.id];
            const k = keys[`page:${p.id}` as ShortcutAction];
            const label = tr(`nav.${p.id}`);
            const badge = p.id === 'ai' && aiActive;
            return (
              <button
                key={p.id}
                className={`nav-item ${page === p.id ? 'active' : ''}`}
                onClick={() => setPage(p.id)}
                title={collapsed ? `${label}${k ? ` (${k})` : ''}` : undefined}
                data-testid={`nav-${p.id}`}
              >
                <span className="nav-icon-wrap">
                  <Icon size={16} />
                  {badge && <span className="nav-badge" />}
                </span>
                <span className="nav-label">{label}</span>
                {k && <span className="kbd">{k.replace('Ctrl+', '^')}</span>}
              </button>
            );
          })}
        </div>
      ))}
      <div className="grow" />
      <div className="sidebar-sep" />
      <button className="nav-item nav-collapse-btn" onClick={toggle} title={collapsed ? tr('nav.expand') : tr('nav.collapse')}>
        {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        <span className="nav-label">{collapsed ? tr('nav.expand') : tr('nav.collapse')}</span>
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
  // Former Stage 3D shortcut: the same page, opened in 3D.
  if (action === 'page:stage3d') { s.setStageMode('3d'); s.setPage('visualizer'); return true; }
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
    case 'releaseAll': void releaseAllFlow(); return true;
    case 'undo':
    case 'redo':
      // The stage pages and the timeline editor keep their own Ctrl+Z / Ctrl+Y (scene layout, local edits).
      if (s.page === 'visualizer' || s.page === 'timeline') return false;
      void historyStep(action);
      return true;
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
      if (typing && (!allowedWhileTyping(combo) || action === 'undo' || action === 'redo')) return; // Ctrl+Z in a field undoes the text
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
      {ready && <MiniPlayer />}
      <Toasts />
      <OnboardingHost />
      <WhatsNewHost />
      <StartScreen />
      <ConfirmHost />
    </div>
  );
}

/** After a crash or a power cut: offers the autosave that is newer than its saved file. */
async function offerRecovery(): Promise<void> {
  const r = (await act({ type: 'project.recoveryCandidates' }))?.[0];
  if (!r) return;
  const restore = await confirmAction({
    title: t('recovery.title'),
    message: t('recovery.message', { name: r.project || r.name, date: new Date(r.modifiedAt).toLocaleString() }),
    confirmLabel: t('recovery.restore'),
    danger: false,
  });
  if (restore && (await act({ type: 'project.openRecovery', file: r.file }))?.opened) useStore.setState({ startScreen: null });
}

export async function bootstrap(): Promise<void> {
  const [project, logs, settings] = await Promise.all([call({ type: 'project.get' }), call({ type: 'logs.recent' }), call({ type: 'settings.get' })]);
  document.documentElement.classList.toggle('reduced-motion', settings.appearance.reducedMotion);
  document.documentElement.style.zoom = String(settings.appearance.uiScale);
  // First run: the welcome screen replaces the release notes; afterwards they show once per new version.
  const firstRun = !settings.onboarding.completed;
  if (firstRun) markWhatsNewSeen();
  useStore.setState({ shortcuts: settings.shortcuts, language: settings.appearance.language, installPlanButton: settings.general.installPlanButton, onboarding: settings.onboarding, help: firstRun ? 'welcome' : whatsNewPending() ? 'whatsnew' : null, startScreen: settings.onboarding.completed ? settings.general.recentProjects : null });
  // bootstrap also runs in the detached window: only the main window listens to MIDI/timecode (else every GO fires twice)
  // and opens the detached window, after the first project opened.
  const main = location.hash !== DETACHED_STAGE_HASH && location.hash !== DETACHED_CONSOLE_HASH;
  if (main) void externalControl.configure(settings.control);
  if (main) void offerRecovery();
  detachStageOnOpen = settings.general.detachStage3dOnStart && main;
  detachConsoleOnOpen = settings.general.detachConsoleOnStart && main;
  useStore.setState({ project, logs, cueListId: project.project.cueLists[0]?.id ?? null });
}
