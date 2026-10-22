import { useEffect, useMemo, useRef, useState } from 'react';
import { drawStage, type View } from './drawStage';
import { useStore } from '../../store';
import { act } from '../../api';
import { useResolved } from '../../components/ui';
import { buildVisualModel, type VisualFixture } from '../../../core/visualizer/model';
import type { FixtureValues, Performer, StageMarker, Truss } from '../../../core/model/schemas';
import { nearestOnTruss, snapToTrusses, snapTrussEnds } from '../../../core/visualizer/truss';
import { findElement, withPatched, type SceneRef } from '../../../core/visualizer/sceneEdit';
import { acceptLibraryDrag, dropLibraryItem, placeAt } from '../../sceneActions';


/**
 * 2D top-down stage view drawn on a canvas from the renderer-agnostic VisualFixture model
 * (the same model is designed to feed a future Three.js view). Approximate, not photometric.
 */
export function StageCanvas({ values, compact, editable, groupFilter }: { values?: FixtureValues; compact?: boolean; editable?: boolean; groupFilter?: string | null }) {
  const live = useStore((s) => s.values);
  const project = useStore((s) => s.project!.project);
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const { fixtures } = useResolved();
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 0, ox: 0, oy: 0 });
  const drag = useRef<{ kind: 'pan' | 'fixture' | 'marker' | 'performer' | 'element'; id?: string; ref?: SceneRef; x: number; y: number; ox: number; oy: number; moved: boolean; keep?: boolean } | null>(null);
  const placing = useStore((s) => s.placing);
  const sceneSel = useStore((s) => s.sceneSel);
  const setSceneSel = useStore((s) => s.setSceneSel);
  const local = useRef(new Map<string, { x: number; y: number; height?: number }>());
  const fitKey = useRef('');
  const model = useMemo(() => buildVisualModel(fixtures, values ?? live), [fixtures, values, live]);
  const group = groupFilter ? project.groups.find((g) => g.id === groupFilter) : null;
  const vis = project.visualizer;
  const W = vis.stageWidth, D = vis.stageDepth;
  const thrust = vis.shape === 'thrust' ? vis.thrust : null;
  const front = thrust?.depth ?? 0;
  const markerPos = (m: StageMarker) => local.current.get(m.id) ?? { x: m.x, y: m.y };
  /** Element at its position while dragged (truss, set piece, screen). */
  const at = <T extends { id: string; x: number; y: number }>(e: T): T => ({ ...e, ...local.current.get(e.id) });
  /** Performer position, following its stage point (also while that point is being dragged). */
  const performerPos = (pf: Performer) => {
    const m = pf.markerId ? vis.markers.find((x) => x.id === pf.markerId) : undefined;
    return local.current.get(pf.id) ?? (m ? markerPos(m) : { x: pf.x, y: pf.y });
  };

  // Fit stage on first layout.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const key = `${W}|${D}|${front}|${Math.round(r.width)}`;
      setView((v) => {
        // Refit when the stage outline or the view width changes (scene panel opened), keep the user's zoom/pan otherwise.
        if (v.scale && fitKey.current === key) return v;
        fitKey.current = key;
        const scale = Math.min(r.width / (W + 4), r.height / (D + front + 4));
        return { scale, ox: r.width / 2, oy: r.height - 20 - front * scale };
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, D, front]);

  const toScreen = (x: number, y: number, v = view) => ({ x: v.ox + x * v.scale, y: v.oy - y * v.scale });
  const pos = (f: VisualFixture) => local.current.get(f.id) ?? { x: f.x, y: f.y };

  useEffect(() => {
    const c = canvas.current, el = wrap.current;
    if (!c || !el || !view.scale) return;
    const r = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // Assigning width/height reallocates the bitmap: only when the size changes (this effect runs on every DMX update).
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStage(g, r, { W, D, thrust, vis, view, compact, group, model, selection, sceneSel, toScreen, pos, at, markerPos, performerPos });
  });

  const hit = (cx: number, cy: number) => {
    const r = wrap.current!.getBoundingClientRect();
    const x = cx - r.left, y = cy - r.top;
    return model.find((f) => { const p = toScreen(pos(f).x, pos(f).y); return Math.hypot(p.x - x, p.y - y) < 11; });
  };
  const hitMarker = (cx: number, cy: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return vis.markers.find((m) => { const p = toScreen(markerPos(m).x, markerPos(m).y); return Math.hypot(p.x - (cx - r.left), p.y - (cy - r.top)) < 9; });
  };
  const hitPerformer = (cx: number, cy: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return vis.performers.find((pf) => { const q = toScreen(performerPos(pf).x, performerPos(pf).y); return Math.hypot(q.x - (cx - r.left), q.y - (cy - r.top)) < 10; });
  };
  /** Truss, screen or set piece under the pointer (within 8 px of a truss outline seen from above). */
  const hitStructure = (cx: number, cy: number): SceneRef | undefined => {
    const r = wrap.current!.getBoundingClientRect();
    const x = (cx - r.left - view.ox) / view.scale, y = (view.oy - (cy - r.top)) / view.scale;
    const tol = 8 / view.scale;
    const near = (t: Truss) => nearestOnTruss(t, x, y).dist < tol;
    const t = vis.trusses.find((t) => (t.shape === 'totem' ? Math.hypot(t.x - x, t.y - y) < Math.max(tol, 0.2) : near(t)));
    if (t) return { kind: 'truss', id: t.id };
    // A screen seen from above is a straight bar: test it as a straight truss of the same width.
    const sc = vis.screens.find((s) => near({ ...s, shape: 'line', length: s.width, height: 1, support: 'towers' }));
    if (sc) return { kind: 'screen', id: sc.id };
    // Set pieces last (large areas), the most recent on top.
    const pr = [...vis.props].reverse().find((p) => {
      if (p.kind === 'column' || p.kind === 'mic') return Math.hypot(p.x - x, p.y - y) <= Math.max(p.width / 2, tol);
      const a = (p.rotation * Math.PI) / 180, dx = x - p.x, dy = y - p.y;
      const lx = dx * Math.cos(a) + dy * Math.sin(a), ly = -dx * Math.sin(a) + dy * Math.cos(a);
      return Math.abs(lx) <= p.width / 2 + tol / 2 && Math.abs(ly) <= p.depth / 2 + tol / 2;
    });
    return pr ? { kind: 'prop', id: pr.id } : undefined;
  };
  const down = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (placing && e.button === 0) {
      const r = wrap.current!.getBoundingClientRect();
      placeAt(placing, { x: (e.clientX - r.left - view.ox) / view.scale, y: (view.oy - (e.clientY - r.top)) / view.scale });
      return;
    }
    const f = hit(e.clientX, e.clientY);
    const pf = !f && e.button === 0 ? hitPerformer(e.clientX, e.clientY) : undefined;
    const mk = !f && !pf && e.button === 0 ? hitMarker(e.clientX, e.clientY) : undefined;
    const ref: SceneRef | undefined = pf ? { kind: 'performer', id: pf.id } : mk ? { kind: 'marker', id: mk.id } : !f && e.button === 0 ? hitStructure(e.clientX, e.clientY) : undefined;
    if (ref) setSceneSel(ref);
    if (pf && editable) {
      const at = performerPos(pf);
      drag.current = { kind: 'performer', id: pf.id, x: e.clientX, y: e.clientY, ox: at.x, oy: at.y, moved: false };
    } else if (mk && editable) {
      drag.current = { kind: 'marker', id: mk.id, x: e.clientX, y: e.clientY, ox: mk.x, oy: mk.y, moved: false };
    } else if (ref && editable && (ref.kind === 'truss' || ref.kind === 'prop' || ref.kind === 'screen')) {
      const el = findElement(vis, ref)!;
      drag.current = { kind: 'element', ref, id: ref.id, x: e.clientX, y: e.clientY, ox: el.x, oy: el.y, moved: false };
    } else if (f && e.button === 0) {
      setSceneSel(null);
      if (e.ctrlKey || e.shiftKey) setSelection(selection.includes(f.id) ? selection.filter((x) => x !== f.id) : [...selection, f.id]);
      else if (!selection.includes(f.id)) setSelection([f.id]);
      drag.current = editable ? { kind: 'fixture', id: f.id, x: e.clientX, y: e.clientY, ox: pos(f).x, oy: pos(f).y, moved: false } : null;
    } else {
      // A click on an element (not editable) selects it but still pans the view when dragged.
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy, moved: false, keep: !!ref };
    }
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    if (d.kind === 'pan') setView({ ...view, ox: d.ox + e.clientX - d.x, oy: d.oy + e.clientY - d.y });
    else if (d.id) {
      // Fixtures and stage elements share the local drag overlay (ids never collide: all are UUIDs).
      const p = { x: Math.round((d.ox + (e.clientX - d.x) / view.scale) * 10) / 10, y: Math.round((d.oy - (e.clientY - d.y) / view.scale) * 10) / 10 };
      const t = d.ref?.kind === 'truss' ? vis.trusses.find((x) => x.id === d.id) : undefined;
      // Truss pieces snap end to end (and take the height of the piece they join) while dragged.
      const snap = t ? snapTrussEnds({ ...t, ...p }, vis.trusses) : null;
      local.current.set(d.id, snap ? { x: snap.x, y: snap.y, height: snap.height } : p);
      setView({ ...view });
    }
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'pan' && !d.moved && !d.keep) { setSelection([]); setSceneSel(null); }
    if (d?.kind === 'performer' && d.id && d.moved) {
      const p = local.current.get(d.id)!;
      const clampPos = (v: number) => Math.max(-100, Math.min(100, v));
      // Dropped on a stage point (within 50 cm): the performer stands on it and follows it; else free.
      const near = vis.markers.find((m) => Math.hypot(m.x - p.x, m.y - p.y) <= 0.5);
      const performers = vis.performers.map((x) => (x.id === d.id ? { ...x, x: clampPos(near?.x ?? p.x), y: clampPos(near?.y ?? p.y), markerId: near?.id ?? null } : x));
      void act({ type: 'project.update', visualizer: { performers } }).finally(() => local.current.delete(d.id!));
    }
    if (d?.kind === 'element' && d.ref && d.id && d.moved) {
      const p = local.current.get(d.id)!;
      const clampPos = (v: number) => Math.max(-100, Math.min(100, v));
      const patch = { x: clampPos(p.x), y: clampPos(p.y), ...(p.height !== undefined ? { height: p.height } : {}) };
      void act({ type: 'project.update', visualizer: withPatched(vis, d.ref, patch) }).finally(() => local.current.delete(d.id!));
    }
    if (d?.kind === 'marker' && d.id && d.moved) {
      const p = local.current.get(d.id)!;
      const clampPos = (v: number) => Math.max(-100, Math.min(100, v));
      const markers = vis.markers.map((m) => (m.id === d.id ? { ...m, x: clampPos(p.x), y: clampPos(p.y) } : m));
      void act({ type: 'project.update', visualizer: { markers } }).finally(() => local.current.delete(d.id!));
    }
    if (d?.kind === 'fixture' && d.id && d.moved) {
      const p = local.current.get(d.id)!;
      const position = { x: Math.max(-100, Math.min(100, p.x)), y: Math.max(-100, Math.min(100, p.y)) };
      const f = model.find((x) => x.id === d.id);
      // Hung fixtures dropped near a truss hang on it; dragged away, they are detached.
      const snap = f?.mount === 'hanging' ? snapToTrusses(vis.trusses, position.x, position.y) : null;
      const patch = snap
        ? { position: { x: snap.x, y: snap.y }, height: snap.height, trussId: snap.truss.id }
        : { position, ...(f?.trussId ? { trussId: null } : {}) };
      if (snap) local.current.set(d.id, patch.position);
      void act({ type: 'fixture.update', id: d.id, patch }).finally(() => local.current.delete(d.id!));
    }
  };
  const wheel = (e: React.WheelEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const k = Math.exp(-e.deltaY * 0.0015);
    const scale = Math.max(5, Math.min(400, view.scale * k));
    setView({ scale, ox: mx - ((mx - view.ox) * scale) / view.scale, oy: my - ((my - view.oy) * scale) / view.scale });
  };
  return (
    <div ref={wrap} className="canvas-wrap" style={{ height: '100%', cursor: placing ? 'crosshair' : undefined }} onPointerDown={down} onDragOver={acceptLibraryDrag} onDrop={(e) => { const r = wrap.current!.getBoundingClientRect(); dropLibraryItem(e, { x: (e.clientX - r.left - view.ox) / view.scale, y: (view.oy - (e.clientY - r.top)) / view.scale }); }} onPointerMove={move} onPointerUp={up} onWheel={wheel} data-testid="stage-canvas">
      <canvas ref={canvas} />
    </div>
  );
}
