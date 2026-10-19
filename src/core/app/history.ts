import type { Project } from '../model/schemas';
import type { CommandType } from '../../shared/commands';
import type { AppService } from './AppService';

/*
 * Project-wide undo / redo. Every accepted mutation keeps the previous project (immutable once swapped in, so it is
 * kept by reference); live actions (GO, programmer, master) never mutate the project and are not part of it.
 */

/** Steps kept (each one is a full project: 50 is a few tens of MB for a large show with analysed songs). */
export const HISTORY_MAX = 50;
/** Successive edits of the same kind closer than this are one step (dragging a fixture sends many updates). */
export const COALESCE_MS = 600;

const LABELS: Partial<Record<CommandType, string>> = {
  'fixture.add': 'ajout de projecteurs', 'fixture.update': 'modification d’un projecteur', 'fixture.remove': 'suppression de projecteurs',
  'fixture.duplicate': 'duplication de projecteurs', 'fixture.place': 'placement de projecteurs', 'locate.apply': 'positions mesurées par caméra',
  'group.upsert': 'modification d’un groupe', 'group.remove': 'suppression d’un groupe', 'group.reorder': 'ordre des groupes',
  'palette.upsert': 'modification d’une palette', 'palette.remove': 'suppression d’une palette', 'palette.recordFromProgrammer': 'enregistrement d’une palette',
  'scene.record': 'enregistrement d’une scène', 'scene.upsert': 'modification d’une scène', 'scene.remove': 'suppression d’une scène', 'scene.duplicate': 'duplication d’une scène',
  'cueList.upsert': 'modification d’une liste de cues', 'cueList.remove': 'suppression d’une liste de cues',
  'effect.upsert': 'modification d’un effet', 'effect.remove': 'suppression d’un effet',
  'timeline.upsert': 'modification d’une timeline', 'timeline.remove': 'suppression d’une timeline',
  'ai.apply': 'proposition IA appliquée', 'music.generate': 'génération de show', 'music.removeTrack': 'suppression d’un morceau',
  'scene.undo': 'annulation de scène', 'scene.redo': 'rétablissement de scène',
  'project.update': 'réglages du projet', 'profile.import': 'import de profils', 'profile.remove': 'suppression d’un profil', 'audio.config': 'réglages audio',
};

export const labelOf = (type: string): string => LABELS[type as CommandType] ?? type;

interface Step { project: Project; label: string; at: number }
interface History { undo: Step[]; redo: Step[]; current: string }
const histories = new WeakMap<AppService, History>();

function of(app: AppService): History {
  let h = histories.get(app);
  if (!h) histories.set(app, (h = { undo: [], redo: [], current: '' }));
  return h;
}

/** The command being handled: its type labels the steps its mutations create. */
export function beginCommand(app: AppService, type: string): void {
  of(app).current = type;
}

/** Called by `mutate` with the project it replaces. */
export function recordStep(app: AppService, previous: Project, now = Date.now()): void {
  const h = of(app);
  const label = labelOf(h.current || 'modification');
  const last = h.undo.at(-1);
  h.redo = [];
  if (last && last.label === label && now - last.at < COALESCE_MS) {
    last.at = now; // same gesture: keep the state from before it started
    return;
  }
  h.undo.push({ project: previous, label, at: now });
  if (h.undo.length > HISTORY_MAX) h.undo.shift();
}

/** A new or opened project starts a fresh history. */
export function clearHistory(app: AppService): void {
  const h = of(app);
  h.undo = [];
  h.redo = [];
}

/** Restores the previous (`undo`) or next (`redo`) project; returns the label of the step, or null when there is none. */
export function travel(app: AppService, direction: 'undo' | 'redo'): string | null {
  const h = of(app);
  const from = direction === 'undo' ? h.undo : h.redo;
  const to = direction === 'undo' ? h.redo : h.undo;
  const step = from.pop();
  if (!step) return null;
  to.push({ project: app.project, label: step.label, at: 0 });
  app.setProject(step.project, false);
  return step.label;
}

export function historyState(app: AppService): { undo: number; redo: number; undoLabel: string | null; redoLabel: string | null } {
  const h = of(app);
  return { undo: h.undo.length, redo: h.redo.length, undoLabel: h.undo.at(-1)?.label ?? null, redoLabel: h.redo.at(-1)?.label ?? null };
}
