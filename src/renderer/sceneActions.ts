import { useEffect } from 'react';
import { act, call, newId } from './api';
import { hasSceneContent } from '../core/visualizer/templates';
import { t } from './i18n';
import { confirmAction, useStore } from './store';
import { setScreenVideo } from './screenMedia';
import type { VisualFixture } from '../core/visualizer/model';
import { followTruss, hangHeight, nearestOnTruss, snapTrussEnds, type P2 } from '../core/visualizer/truss';
import { chainFromPoints, groupTrusses } from '../core/visualizer/trussBuild';
import { MAX_UNIVERSES, type Fixture, type Project, type Truss } from '../core/model/schemas';
import { ProfileLibrary, channelCount } from '../core/fixtures/profiles';
import { findFreeAddress } from '../core/fixtures/patch';
import { sceneFromText } from '../core/visualizer/sceneFromText';
import { libraryItem } from '../core/visualizer/library';
import {
  SCENE_LABEL, canAdd, cloneElement, equipTrusses, findElement, newElement, parseElement, roomFor, serializeElement, withElement, withMovedGroup,
  withoutElement, withoutGroup, type EquipFixture, type SceneKind, type SceneRef,
} from '../core/visualizer/sceneEdit';

/** Scene-element actions shared by the scene panel, the 2D plan and the 3D view (all undoable with Ctrl+Z). */

/** Drag-and-drop type of a library tile (its data is the library item id). */
export const LIBRARY_MIME = 'application/x-luma-library';

const vis = () => useStore.getState().project?.project.visualizer;
const toast = (title: string, detail?: string, kind: 'info' | 'error' = 'info') => useStore.getState().toast({ kind, title, detail });

/** Adds an element at `at` (click on the stage) or at the next free spot, and selects it. */
export function addSceneElement(kind: SceneKind, at?: P2, preset?: Record<string, unknown>): void {
  const v = vis();
  const st = useStore.getState();
  st.setPlacing(null);
  if (!v) return;
  if (!canAdd(v, kind)) { toast('Limite atteinte', `Nombre maximal de « ${SCENE_LABEL[kind]} » atteint.`, 'error'); return; }
  const el = (() => { try { return newElement(v, kind, newId, at, preset); } catch { return null; } })(); // a preset outside the schema bounds
  if (!el) { toast('Élément invalide', undefined, 'error'); return; }
  // A truss piece placed next to another one joins it end to end, at its height.
  const snap = kind === 'truss' ? snapTrussEnds(el as Truss, v.trusses) : null;
  if (snap) Object.assign(el, { x: snap.x, y: snap.y, height: snap.height });
  void act({ type: 'project.update', visualizer: withElement(v, kind, el) }).then((r) => r && st.setSceneSel({ kind, id: el.id }));
}

/** Hangs a fixture on a truss at the closest point of the truss to its current position (floor / wall: re-hung). */
export function hangFixture(fixture: Fixture, t: Truss): void {
  const p = nearestOnTruss(t, fixture.position.x, fixture.position.y);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  void act({
    type: 'fixture.update', id: fixture.id,
    patch: { trussId: t.id, position: { x: r2(p.x), y: r2(p.y) }, height: r2(hangHeight(t)), ...(fixture.mount === 'floor' || fixture.mount === 'wall' ? { mount: 'hanging' as const } : {}) },
  });
}

/** Height (m) of the pieces of a drawn structure: the default height of a new truss. */
const DRAW_HEIGHT = 6;

/**
 * Structure drawn point by point on the plan: straight pieces sharing one group, added in one undo step. Points
 * already snapped to a truss end; segments under 0.5 m are dropped.
 */
export function drawTrussGroup(points: readonly P2[]): void {
  const v = vis();
  const st = useStore.getState();
  if (!v) return;
  const pieces = chainFromPoints(points, DRAW_HEIGHT, newId, newId(), `Structure ${groupTrusses(v.trusses).size + 1}`);
  if (!pieces.length) { toast('Segment trop court', 'Tracez au moins 0,5 m.', 'error'); return; }
  if (pieces.length > roomFor(v, 'truss')) { toast('Limite atteinte', `Il reste ${roomFor(v, 'truss')} pièce(s) disponible(s).`, 'error'); return; }
  void act({ type: 'project.update', visualizer: { trusses: [...v.trusses, ...pieces] } }).then((r) => r && st.setSceneSel({ kind: 'truss', id: pieces[0]!.id }));
}

/** Moves a whole structure by (dx, dy); the projectors hung on it follow their piece (a second undo step if any). */
export function moveTrussGroup(groupId: string, dx: number, dy: number): void {
  const v = vis();
  if (!v) return;
  const trusses = withMovedGroup(v, groupId, dx, dy).trusses ?? [];
  const placements = (useStore.getState().project?.project.patch ?? []).flatMap((f) => {
    const before = v.trusses.find((t) => t.id === f.trussId && t.groupId === groupId);
    if (!before) return [];
    const after = trusses.find((t) => t.id === before.id)!;
    const p = followTruss(before, after, { position: f.position, height: f.height, rotation: f.rotation });
    return [{ id: f.id, position: p.position, height: p.height, trussId: after.id }];
  });
  void act({ type: 'project.update', visualizer: { trusses } }).then((r) => {
    if (r !== undefined && placements.length) return act({ type: 'fixture.place', placements });
  });
}

/** Removes a whole structure; the projectors hung on it are unhooked and stay where they are (a second undo step). */
export function removeTrussGroup(groupId: string): void {
  const v = vis();
  if (!v) return;
  const gone = new Set(v.trusses.filter((t) => t.groupId === groupId).map((t) => t.id));
  const hung = (useStore.getState().project?.project.patch ?? []).filter((f) => f.trussId && gone.has(f.trussId));
  if (useStore.getState().sceneSel && gone.has(useStore.getState().sceneSel!.id)) useStore.getState().setSceneSel(null);
  void act({ type: 'project.update', visualizer: withoutGroup(v, groupId) }).then((r) => {
    if (r !== undefined && hung.length) {
      return act({ type: 'fixture.place', placements: hung.map((f) => ({ id: f.id, position: f.position, height: f.height, trussId: null })) });
    }
  });
}

export function removeSceneElement(ref: SceneRef): void {
  const v = vis();
  const el = v && findElement(v, ref);
  if (!v || !el) return;
  // A piece drawn as part of a structure takes the whole structure with it.
  if (ref.kind === 'truss' && (el as Truss).groupId) { removeTrussGroup((el as Truss).groupId!); return; }
  if (ref.kind === 'screen') setScreenVideo(ref.id, null);
  if (useStore.getState().sceneSel?.id === ref.id) useStore.getState().setSceneSel(null);
  void act({ type: 'project.update', visualizer: withoutElement(v, ref) });
}

export function duplicateSceneElement(ref: SceneRef): void {
  const v = vis();
  const src = v && findElement(v, ref);
  if (!v || !src) return;
  if (!canAdd(v, ref.kind)) { toast('Limite atteinte', undefined, 'error'); return; }
  const copy = cloneElement(v, ref.kind, src, newId);
  void act({ type: 'project.update', visualizer: withElement(v, ref.kind, copy) }).then((r) => r && useStore.getState().setSceneSel({ kind: ref.kind, id: copy.id }));
}

/** Copies through the system clipboard as text, so elements can be pasted into another project or window. */
export async function copySceneElement(ref: SceneRef): Promise<void> {
  const v = vis();
  const el = v && findElement(v, ref);
  if (!el) return;
  try {
    await navigator.clipboard.writeText(serializeElement(ref.kind, el));
    toast('Copié', `« ${el.name} » — Ctrl+V pour coller`);
  } catch {
    toast('Copie impossible', 'Presse-papiers indisponible', 'error');
  }
}

export async function pasteSceneElement(): Promise<void> {
  const v = vis();
  if (!v) return;
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch { /* clipboard unavailable: nothing to paste */ }
  const parsed = parseElement(text);
  if (!parsed) return;
  if (!canAdd(v, parsed.kind)) { toast('Limite atteinte', undefined, 'error'); return; }
  const copy = cloneElement(v, parsed.kind, parsed.el, newId);
  void act({ type: 'project.update', visualizer: withElement(v, parsed.kind, copy) }).then((r) => r && useStore.getState().setSceneSel({ kind: parsed.kind, id: copy.id }));
}

/**
 * Hangs the selected fixtures (or every hung fixture, floor and wall ones staying put) evenly on the trusses:
 * moving heads at the back, the others at the front. One undo step.
 */
export function equipRig(model: readonly VisualFixture[]): void {
  const v = vis();
  const patch = useStore.getState().project?.project.patch ?? [];
  if (!v?.trusses.length) return;
  const sel = new Set(useStore.getState().selection);
  const explicit = new Map(patch.map((f) => [f.id, f.mount ?? 'auto']));
  const chosen = model.filter((f) => (sel.size ? sel.has(f.id) : f.mount === 'hanging'));
  // A selected floor / wall fixture is re-mounted as hung; 'auto' follows its new height.
  const placements = equipTrusses(chosen, v.trusses).map((p) => ({ ...p, ...(['floor', 'wall'].includes(explicit.get(p.id) ?? 'auto') ? { mount: 'hanging' as const } : {}) }));
  if (!placements.length) { toast('Rien à accrocher', 'Aucun projecteur suspendu ou sélectionné.'); return; }
  void act({ type: 'fixture.place', placements }).then((r) => r !== undefined && toast(`${placements.length} projecteur(s) accroché(s)`, 'Ctrl+Z pour annuler'));
}

/**
 * Stage-page keyboard: Ctrl+D duplicate, Suppr delete, Ctrl+C / Ctrl+V copy / paste, Échap cancels a click placement.
 * Ctrl+D on fixtures duplicates them in the patch (next free address). Ignored while typing in a field.
 */
export function useSceneShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
      const st = useStore.getState();
      const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (e.key === 'Escape' && st.placing) {
        // Captured before the global Échap (release programmer): only cancels the placement.
        e.preventDefault();
        e.stopImmediatePropagation();
        st.setPlacing(null);
      } else if (ctrl && k === 'd') {
        e.preventDefault();
        if (st.sceneSel) duplicateSceneElement(st.sceneSel);
        else if (st.selection.length) void act({ type: 'fixture.duplicate', ids: st.selection }).then((r) => r && st.setSelection(r.ids));
      } else if (e.key === 'Delete' && st.sceneSel) {
        e.preventDefault();
        removeSceneElement(st.sceneSel);
      } else if (ctrl && k === 'c' && st.sceneSel) {
        e.preventDefault();
        void copySceneElement(st.sceneSel);
      } else if (ctrl && k === 'v') {
        void pasteSceneElement();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      useStore.getState().setPlacing(null);
    };
  }, []);
}

/** Drag over the stage: accept library tiles only. */
export function acceptLibraryDrag(e: React.DragEvent): void {
  if (e.dataTransfer.types.includes(LIBRARY_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
}

/** Drop of a library tile at a stage position (null when the drop missed the floor). */
export function dropLibraryItem(e: React.DragEvent, at: P2 | null): void {
  const item = libraryItem(e.dataTransfer.getData(LIBRARY_MIME));
  if (!item) return;
  e.preventDefault();
  if (at) addSceneElement(item.kind, at, item.preset);
}

/** Photos are downscaled before analysis (enough detail for structures, fewer tokens). */
export const PHOTO_MAX_PX = 1600;

/** Analyses a stage photo and, after confirmation, replaces the stage size, trusses, set pieces and screens (undoable). */
export async function sceneFromPhoto(v: Project['visualizer'], image: string): Promise<void> {
  toast(t('photo.analysing'), t('photo.analysingDetail'));
  const r = await call({ type: 'ai.sceneFromPhoto', image }).catch(() => null); // error already shown
  if (!r) return;
  const found = t('photo.found', { trusses: r.trusses.length, props: r.props.length, screens: r.screens.length, w: r.stageWidth, d: r.stageDepth });
  if (!r.trusses.length && !r.props.length && !r.screens.length) { toast(t('photo.none'), r.summary, 'error'); return; }
  const lines = [r.summary, '', found, ...(r.dropped ? [t('photo.dropped', { n: r.dropped })] : []), ...(hasSceneContent(v) ? ['', t('photo.replace')] : [])];
  if (!(await confirmAction({ title: t('photo.confirmTitle'), message: lines.join('\n'), confirmLabel: t('photo.confirm') }))) return;
  for (const sc of v.screens) setScreenVideo(sc.id, null);
  const ok = await act({ type: 'project.update', visualizer: { stageWidth: r.stageWidth, stageDepth: r.stageDepth, trusses: r.trusses, props: r.props, screens: r.screens } });
  if (ok) toast(t('photo.done'), [found, ...r.notices].join(' · '));
}

/**
 * Written description → whole stage: after confirmation, replaces the stage layout, patches the described fixtures
 * (first universe with room for each rig) and hangs them: "dessus" rigs on the totems, the others on the structures.
 */
export async function buildSceneFromText(text: string): Promise<boolean> {
  const ps = useStore.getState().project;
  if (!ps) return false;
  const lib = new ProfileLibrary([...(ps.library ?? []), ...ps.project.profiles]);
  const plan = sceneFromText(text, lib.all(), newId);
  if (!plan.lines.length) { toast(t('textScene.none'), plan.notices.join('\n') || t('textScene.noneDetail'), 'error'); return false; }
  const v = ps.project.visualizer;
  const message = [...plan.lines.map((l) => `• ${l}`), ...(plan.notices.length ? ['', ...plan.notices] : []), ...(hasSceneContent(v) ? ['', t('textScene.replace')] : [])].join('\n');
  if (!(await confirmAction({ title: t('textScene.confirmTitle'), message, confirmLabel: t('textScene.confirm') }))) return false;
  for (const sc of v.screens) setScreenVideo(sc.id, null);
  if ((await act({ type: 'project.update', visualizer: plan.layout })) === undefined) return false;
  const totems = plan.layout.trusses.filter((tr) => tr.shape === 'totem'), others = plan.layout.trusses.filter((tr) => tr.shape !== 'totem');
  const onTotems: EquipFixture[] = [], onTrusses: EquipFixture[] = [];
  for (const rig of plan.rigs) {
    const patch = useStore.getState().project?.project.patch ?? [];
    const chans = channelCount(lib.get(rig.profileId)!, rig.mode);
    const universe = Array.from({ length: MAX_UNIVERSES }, (_, i) => i + 1).find((u) => findFreeAddress(lib, patch, u, chans * rig.count) !== undefined) ?? 1;
    const r = await act({ type: 'fixture.add', profileId: rig.profileId, mode: rig.mode, universe, address: null, count: rig.count, namePrefix: rig.prefix, tags: [] });
    if (!r) return false;
    (rig.target === 'totem' ? onTotems : onTrusses).push(...r.ids.map((id) => ({ id, movable: rig.movable })));
  }
  const placements = [...equipTrusses(onTotems, totems.length ? totems : others), ...equipTrusses(onTrusses, others.length ? others : totems)];
  if (placements.length) await act({ type: 'fixture.place', placements });
  const fixtures = onTotems.length + onTrusses.length;
  toast(t('textScene.done'), t('textScene.doneDetail', { trusses: plan.layout.trusses.length, fixtures, props: plan.layout.props.length }));
  useStore.getState().setPage('stage3d');
  return true;
}
