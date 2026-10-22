import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  Activity, AudioLines, Bot, Cable, ChartGantt, Crosshair, LayoutDashboard, Lightbulb, ListOrdered, Palette,
  Music2, PanelLeftClose, PanelLeftOpen, Settings as SettingsIcon, SlidersHorizontal, Sparkles, Terminal, Theater, X, Zap,
} from 'lucide-react';
import { PAGES, useStore, confirmAction, type PageId } from './store';
import { act, call } from './api';
import { ConfirmHost, NoticeHost } from './components/ui';
import { allowedWhileTyping, bindingsFrom, comboFromEvent } from './shortcuts';
import { resolveShortcuts, type ShortcutAction } from '../core/settings/settings';
import { Dashboard } from './features/Dashboard';
import { Fixtures } from './features/Fixtures';
import { DETACHED_CONSOLE_HASH, LiveConsole } from './features/LiveConsole';
import { PanTiltConsole } from './features/PanTiltConsole';
import { Programmer } from './features/Programmer';
import { Cues } from './features/Cues';
import { Effects } from './features/Effects';
import { QuickActionsPage } from './features/QuickActions';
import { TimelinePage } from './features/Timeline';
import { AiDirector } from './features/AiDirector';
import { DETACHED_STAGE_HASH, Visualizer } from './features/Visualizer';
import { AudioPage } from './features/Audio';
import { MusicPage } from './features/Music';
import { OutputPage } from './features/Output';
import { SettingsPage } from './features/Settings';
import { externalControl } from './control';
import { OnboardingHost } from './features/Onboarding';
import { StartScreen } from './features/StartScreen';
import { MiniPlayer } from './features/music/MiniPlayer';
import { markWhatsNewSeen, whatsNewPending, WhatsNewHost } from './features/WhatsNew';
import { t, useT, type MessageKey } from './i18n';
import { TopBar } from './components/TopBar';
import {
  newProjectFlow,
  detachStageIfWanted,
  openProject,
  historyStep,
  releaseAllFlow,
  setDetachOnOpen,
} from './projectActions';

export { newProjectFlow, detachStageIfWanted, openProject, historyStep, releaseAllFlow };

const ICONS: Record<PageId, ComponentType<{ size?: number }>> = {
  dashboard: LayoutDashboard, fixtures: Lightbulb, console: SlidersHorizontal, pantilt: Crosshair, programmer: Palette, cues: ListOrdered, effects: Sparkles, quick: Zap,
  timeline: ChartGantt, ai: Bot, visualizer: Theater, audio: AudioLines, music: Music2, output: Cable, settings: SettingsIcon,
};
const VIEWS: Record<PageId, ComponentType> = {
  dashboard: Dashboard, fixtures: Fixtures, console: LiveConsole, pantilt: PanTiltConsole, programmer: Programmer, cues: Cues, effects: Effects, quick: QuickActionsPage,
  timeline: TimelinePage, ai: AiDirector, visualizer: Visualizer, audio: AudioPage, music: MusicPage, output: OutputPage, settings: SettingsPage,
};

const NAV_GROUPS: { key: MessageKey; ids: PageId[] }[] = [
  { key: 'nav.group.live', ids: ['dashboard', 'console', 'pantilt', 'programmer', 'cues', 'quick'] },
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
  // Navigation demandée pendant le verrouillage « console simplifiée » : on ne quitte qu'après confirmation.
  const leaveRequest = useStore((s) => s.leaveRequest);
  useEffect(() => {
    if (!leaveRequest) return;
    void confirmAction({ title: t('simple.leaveTitle'), message: t('simple.leaveMessage'), confirmLabel: t('simple.leaveConfirm') }).then((ok) => {
      useStore.setState(ok ? { leaveRequest: null, simpleLocked: false } : { leaveRequest: null });
      if (ok) useStore.getState().setPage(leaveRequest);
    });
  }, [leaveRequest]);
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
      <NoticeHost />
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
  setDetachOnOpen(settings.general.detachStage3dOnStart && main, settings.general.detachConsoleOnStart && main);
  // Lu au démarrage seulement : le réglage s'applique au prochain redémarrage, pas à la session en cours.
  if (main && settings.general.simpleConsoleOnStart) useStore.setState({ simpleLocked: true, page: 'pantilt' });
  useStore.setState({ project, logs, cueListId: project.project.cueLists[0]?.id ?? null });
}
