import { t } from './i18n';
import { useStore, confirmAction } from './store';
import { act } from './api';
import { openDetachedStage } from './features/Visualizer';
import { openDetachedConsole } from './features/LiveConsole';

export function newProjectFlow(): void {
  useStore.setState({ newProjectOpen: true });
}

export async function guardUnsaved(): Promise<boolean> {
  if (!useStore.getState().project?.dirty) return true;
  return confirmAction({ title: t('project.unsavedTitle'), message: t('project.unsavedMessage'), confirmLabel: t('project.unsavedConfirm') });
}

/** Set at startup from the settings; cleared once the detached windows have been opened. */
let detachStageOnOpen = false;
let detachConsoleOnOpen = false;

export function setDetachOnOpen(stage: boolean, console: boolean): void {
  detachStageOnOpen = stage;
  detachConsoleOnOpen = console;
}

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
