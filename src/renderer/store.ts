import { create } from 'zustand';
import type { LogEntry } from '../core/log/logger';
import type { FixtureValues } from '../core/model/schemas';
import type { Progress, ProjectState, RuntimeState } from '../shared/commands';
import type { PlaceSpec, SceneRef } from '../core/visualizer/sceneEdit';

/** Stable empty defaults: selectors must not return fresh objects (would re-render forever). */
export const EMPTY_OBJ: Readonly<Record<string, never>> = Object.freeze({});
export const EMPTY_ARR: readonly never[] = Object.freeze([]);

export const PAGES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'fixtures', label: 'Fixtures' },
  { id: 'console', label: 'Live Console' },
  { id: 'pantilt', label: 'Pan / Tilt' },
  { id: 'programmer', label: 'Programmer' },
  { id: 'cues', label: 'Cues & Sequences' },
  { id: 'effects', label: 'Effects' },
  { id: 'quick', label: 'Quick Actions' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'ai', label: 'AI Lighting Director' },
  { id: 'visualizer', label: 'Stage' },
  { id: 'audio', label: 'Audio Reactive' },
  { id: 'music', label: 'Musique' },
  { id: 'output', label: 'DMX Output' },
  { id: 'settings', label: 'Settings' },
] as const;
export type PageId = (typeof PAGES)[number]['id'];

/** Stage page view: top-down plan, 3D, both stacked or both side by side. Remembered between sessions. */
export type StageMode = '2d' | '3d' | 'split' | 'split-h';
const STAGE_MODES: readonly StageMode[] = ['2d', '3d', 'split', 'split-h'];
const stageModeSaved = (): StageMode => {
  try {
    const v = localStorage.getItem('luma.stageMode') as StageMode | null;
    return v && STAGE_MODES.includes(v) ? v : '2d';
  } catch {
    return '2d';
  }
};

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warn' | 'error';
  title: string;
  detail?: string;
}

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

const prefs = (() => {
  try {
    return JSON.parse(localStorage.getItem('luma.ui') ?? '{}') as { page?: PageId; collapsed?: boolean };
  } catch {
    return {};
  }
})();
const savePrefs = (p: { page: PageId; collapsed: boolean }) => {
  try {
    localStorage.setItem('luma.ui', JSON.stringify(p));
  } catch {
    // storage unavailable: preferences simply not persisted
  }
};

interface State {
  project: ProjectState | null;
  runtime: RuntimeState | null;
  values: FixtureValues;
  sources: Record<string, Record<string, string>>;
  logs: LogEntry[];
  /** Last step reported for the long operation in progress (show generation). */
  progress: Progress | null;
  page: PageId;
  collapsed: boolean;
  selection: string[];
  cueListId: string | null;
  diagOpen: boolean;
  newProjectOpen: boolean;
  /** Recent project paths while the startup chooser is shown (first run shows the welcome tour instead). */
  startScreen: string[] | null;
  /** User overrides of keyboard shortcuts (from settings). */
  shortcuts: Record<string, string>;
  /** Interface language (Settings › Apparence); catalogues in ./i18n. */
  language: 'fr' | 'en';
  /** Header button « Plan d’installation » (Settings › Général). */
  installPlanButton: boolean;
  /** True while the Settings page records a new shortcut (global handler paused). */
  capturingShortcut: boolean;
  toasts: Toast[];
  confirm: ConfirmRequest | null;
  /** Message bloquant affiché dans une modale (ex. commande refusée par la licence). */
  notice: { title: string; detail?: string } | null;
  setNotice(n: State['notice']): void;
  /** Values shown by the visualizer instead of live values (AI or scene preview). */
  preview: { label: string; title?: string; values: FixtureValues } | null;
  /** Selected stage element (point, truss, performer, screen) and the kind being placed by a click on the stage. */
  sceneSel: SceneRef | null;
  placing: PlaceSpec | null;
  setSceneSel(r: SceneRef | null): void;
  setPlacing(p: PlaceSpec | null): void;
  /** Side panels of the Stage page: Construire (left) and Sélection / propriétés (right), each collapsible. */
  stagePanels: { build: boolean; inspect: boolean };
  setStagePanels(p: Partial<State['stagePanels']>): void;
  /** Request to frame the 3D camera on a stage point (meters; `seq` makes repeated requests distinct). */
  frame: { x: number; y: number; height: number; seq: number } | null;
  frameOn(at: { x: number; y: number; height: number }): void;
  /** Fixture whose beam the 3D camera rides (beam's-eye view), or null. */
  beamView: string | null;
  setBeamView(id: string | null): void;
  /** Onboarding state from the settings (null until loaded) and the open help surface. */
  onboarding: { completed: boolean; checklistHidden: boolean } | null;
  help: 'welcome' | 'tour' | 'demos' | 'stage' | 'whatsnew' | null;
  setHelp(h: State['help']): void;
  setPage(p: PageId): void;
  /** Console Simplifiée verrouillée (réglage « ouvrir au démarrage ») : quitter demande une confirmation, traitée par App. */
  simpleLocked: boolean;
  /** Page demandée pendant le verrouillage, en attente de confirmation. */
  leaveRequest: PageId | null;
  stageMode: StageMode;
  setStageMode(m: StageMode): void;
  toggleCollapsed(): void;
  setSelection(ids: string[]): void;
  setCueList(id: string | null): void;
  toggleDiag(): void;
  toast(t: Omit<Toast, 'id'>): void;
  dismiss(id: number): void;
  setPreview(p: State['preview']): void;
}

let toastSeq = 1;

export const useStore = create<State>((set, get) => ({
  project: null,
  runtime: null,
  values: {},
  sources: {},
  logs: [],
  progress: null,
  page: prefs.page ?? 'dashboard',
  collapsed: prefs.collapsed ?? false,
  selection: [],
  cueListId: null,
  diagOpen: false,
  newProjectOpen: false,
  startScreen: null,
  shortcuts: {},
  language: 'fr',
  installPlanButton: false,
  capturingShortcut: false,
  toasts: [],
  confirm: null,
  notice: null,
  setNotice: (notice) => set({ notice }),
  preview: null,
  sceneSel: null,
  placing: null,
  setSceneSel: (sceneSel) => set(sceneSel ? { sceneSel, selection: [], stagePanels: { ...get().stagePanels, inspect: true } } : { sceneSel }),
  setPlacing: (placing) => set({ placing }),
  stagePanels: { build: true, inspect: false },
  setStagePanels: (p) => set({ stagePanels: { ...get().stagePanels, ...p } }),
  frame: null,
  frameOn: (at) => set({ frame: { ...at, seq: (get().frame?.seq ?? 0) + 1 } }),
  beamView: null,
  setBeamView: (beamView) => set({ beamView }),
  onboarding: null,
  help: null,
  setHelp: (help) => set({ help }),
  simpleLocked: false,
  leaveRequest: null,
  setPage: (page) => {
    if (get().simpleLocked && page !== 'pantilt') {
      set({ leaveRequest: page });
      return;
    }
    set({ page });
    savePrefs({ page, collapsed: get().collapsed });
  },
  stageMode: stageModeSaved(),
  setStageMode: (stageMode) => {
    set({ stageMode });
    try { localStorage.setItem('luma.stageMode', stageMode); } catch { /* storage unavailable: not persisted */ }
  },
  toggleCollapsed: () => {
    const collapsed = !get().collapsed;
    set({ collapsed });
    savePrefs({ page: get().page, collapsed });
  },
  // One selection at a time: picking fixtures clears the stage element and vice versa (the latest wins).
  // A new selection unfolds the inspector panel.
  setSelection: (selection) => set(selection.length ? { selection, sceneSel: null, stagePanels: { ...get().stagePanels, inspect: true } } : { selection }),
  setCueList: (cueListId) => set({ cueListId }),
  toggleDiag: () => set({ diagOpen: !get().diagOpen }),
  toast: (t) => {
    const id = toastSeq++;
    set({ toasts: [...get().toasts.slice(-4), { ...t, id }] });
    setTimeout(() => get().dismiss(id), t.kind === 'error' ? 8000 : 4000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
  setPreview: (preview) => set({ preview }),
}));

/** Promise-based confirmation dialog for dangerous operations. */
export function confirmAction(opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    useStore.setState({
      confirm: {
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'Confirmer',
        danger: opts.danger ?? true,
        resolve: (ok) => {
          useStore.setState({ confirm: null });
          resolve(ok);
        },
      },
    });
  });
}

export function connectEvents(): () => void {
  return window.luma.on((name, payload) => {
    if (name === 'project') {
      const p = payload as ProjectState;
      const s = useStore.getState();
      const ids = new Set(p.project.patch.map((f) => f.id));
      useStore.setState({
        project: p,
        selection: s.selection.filter((id) => ids.has(id)),
        cueListId: s.cueListId && p.project.cueLists.some((l) => l.id === s.cueListId) ? s.cueListId : p.project.cueLists[0]?.id ?? null,
      });
    } else if (name === 'runtime') useStore.setState({ runtime: payload as RuntimeState });
    else if (name === 'values') {
      const f = payload as { values: FixtureValues; sources?: Record<string, Record<string, string>> };
      useStore.setState(f.sources ? { values: f.values, sources: f.sources } : { values: f.values });
    } else if (name === 'log') useStore.setState({ logs: [...useStore.getState().logs.slice(-499), payload as LogEntry] });
    else if (name === 'progress') useStore.setState({ progress: payload as Progress });
  });
}
