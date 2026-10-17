import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, MapPin, Move, Plus, Redo2, Settings2, Theater, Trash2, Undo2, X } from 'lucide-react';
import { useStore } from '../store';
import { act, newId } from '../api';
import { Empty, NumberInput, PageHead, useResolved } from '../components/ui';
import { buildVisualModel, type VisualFixture } from '../../core/visualizer/model';
import { Stage3D } from './Stage3D';
import type { FixtureValues, Project, StageMarker, Truss } from '../../core/model/schemas';
import { snapToTrusses, trussSegments, trussSupports } from '../../core/visualizer/truss';

interface View { scale: number; ox: number; oy: number }

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
  const drag = useRef<{ kind: 'pan' | 'fixture' | 'marker'; id?: string; x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const local = useRef(new Map<string, { x: number; y: number }>());
  const fitKey = useRef('');
  const model = useMemo(() => buildVisualModel(fixtures, values ?? live), [fixtures, values, live]);
  const group = groupFilter ? project.groups.find((g) => g.id === groupFilter) : null;
  const vis = project.visualizer;
  const W = vis.stageWidth, D = vis.stageDepth;
  const thrust = vis.shape === 'thrust' ? vis.thrust : null;
  const front = thrust?.depth ?? 0;
  const markerPos = (m: StageMarker) => local.current.get(m.id) ?? { x: m.x, y: m.y };

  // Fit stage on first layout.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const key = `${W}|${D}|${front}`;
      setView((v) => {
        // Refit when the stage outline changes, keep the user's zoom/pan otherwise.
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
    c.width = r.width * dpr;
    c.height = r.height * dpr;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, r.width, r.height);
    // Stage
    const a = toScreen(-W / 2, D), b = toScreen(W / 2, 0);
    g.fillStyle = '#0d1018';
    g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    g.strokeStyle = '#283142';
    g.lineWidth = 1;
    g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    g.strokeStyle = 'rgba(40,49,66,0.45)';
    for (let x = Math.ceil(-W / 2); x <= W / 2; x++) { const p = toScreen(x, 0), q = toScreen(x, D); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke(); }
    for (let y = 1; y < D; y++) { const p = toScreen(-W / 2, y), q = toScreen(W / 2, y); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke(); }
    if (thrust) {
      const ta = toScreen(-thrust.width / 2, 0), tb = toScreen(thrust.width / 2, -thrust.depth);
      g.fillStyle = '#0d1018';
      g.fillRect(ta.x, ta.y, tb.x - ta.x, tb.y - ta.y);
      g.strokeStyle = '#283142';
      g.strokeRect(ta.x, ta.y, tb.x - ta.x, tb.y - ta.y);
    }
    g.fillStyle = '#66718a';
    g.font = '11px sans-serif';
    if (vis.shape === 'arena') {
      g.fillText('PUBLIC', toScreen(0, D).x - 20, toScreen(0, D).y - 8);
      g.fillText('PUBLIC', toScreen(0, 0).x - 20, toScreen(0, 0).y + 14);
    } else {
      const lip = toScreen(thrust ? thrust.width / 2 + 1 : 0, 0);
      g.fillText('PUBLIC', lip.x - (thrust ? 0 : 20), lip.y + 14);
      if (vis.cyclo) {
        g.strokeStyle = '#4b5570';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, a.y);
        g.stroke();
        g.lineWidth = 1;
      }
    }
    // Explicit trusses: thick outline, support feet, name.
    for (const t of vis.trusses) {
      g.strokeStyle = '#6b7385';
      g.lineWidth = Math.max(3, 0.29 * view.scale);
      g.lineCap = 'round';
      g.beginPath();
      for (const [a0, b0] of trussSegments(t)) {
        const pa = toScreen(a0.x, a0.y), pb = toScreen(b0.x, b0.y);
        g.moveTo(pa.x, pa.y);
        g.lineTo(pb.x, pb.y);
      }
      g.stroke();
      g.lineWidth = 1;
      g.fillStyle = t.support === 'towers' ? '#9aa3b5' : '#4b5570';
      for (const sp of trussSupports(t)) { const q = toScreen(sp.x, sp.y); g.fillRect(q.x - 4, q.y - 4, 8, 8); }
      const c = toScreen(t.x, t.y);
      g.fillStyle = '#7d879c';
      g.font = '10px sans-serif';
      g.fillText(`${t.name} · ${t.height} m`, c.x + 6, c.y - 8);
    }
    // Stage points: cyan diamond + name.
    for (const m of vis.markers) {
      const p = toScreen(markerPos(m).x, markerPos(m).y);
      g.fillStyle = '#22d3ee';
      g.beginPath();
      g.moveTo(p.x, p.y - 7);
      g.lineTo(p.x + 7, p.y);
      g.lineTo(p.x, p.y + 7);
      g.lineTo(p.x - 7, p.y);
      g.closePath();
      g.fill();
      g.fillStyle = '#67e8f9';
      g.font = '10px sans-serif';
      g.fillText(m.name, p.x + 10, p.y + 3);
    }
    // Beams first (additive look), then bodies
    g.globalCompositeOperation = 'lighter';
    for (const f of model) {
      if (f.intensity <= 0.01) continue;
      const p = toScreen(pos(f).x, pos(f).y);
      const center = Math.PI / 2 + ((f.rotation + (f.movable ? f.panDeg : 0)) * Math.PI) / 180; // canvas angle; 0° = towards audience (down)
      const reach = (f.movable ? 1.2 + 4 * Math.abs(Math.cos((f.tiltDeg * Math.PI) / 180)) : 2.5) * view.scale;
      const half = ((f.beamAngle / 2) * Math.PI) / 180 + 0.08;
      const grad = g.createRadialGradient(p.x, p.y, 2, p.x, p.y, reach);
      const col = f.color;
      const alpha = Math.round(Math.min(1, f.intensity) * 150).toString(16).padStart(2, '0');
      grad.addColorStop(0, `${col}${alpha}`);
      grad.addColorStop(1, `${col}00`);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.arc(p.x, p.y, reach, center - half, center + half);
      g.closePath();
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    for (const f of model) {
      const p = toScreen(pos(f).x, pos(f).y);
      const dim = group && !group.fixtureIds.includes(f.id);
      g.globalAlpha = dim ? 0.25 : 1;
      g.beginPath();
      g.arc(p.x, p.y, f.movable ? 9 : 7, 0, Math.PI * 2);
      g.fillStyle = '#191f2b';
      g.fill();
      g.beginPath();
      g.arc(p.x, p.y, f.movable ? 6 : 5, 0, Math.PI * 2);
      const k = f.intensity;
      const rgb = [1, 3, 5].map((i) => Math.round(parseInt(f.color.slice(i, i + 2), 16) * k));
      g.fillStyle = `rgb(${rgb.join(',')})`;
      g.fill();
      if (f.cells.length) {
        // Multi-cell fixture: draw its cells as a row of segments under the body.
        const w = 6;
        f.cells.forEach((c, i) => {
          g.fillStyle = c;
          g.fillRect(p.x - (f.cells.length * w) / 2 + i * w, p.y + 9, w - 1, 5);
        });
      }
      g.lineWidth = selection.includes(f.id) ? 2 : 1;
      g.strokeStyle = selection.includes(f.id) ? '#8b5cf6' : group?.fixtureIds.includes(f.id) ? group.color : '#36415a';
      g.beginPath();
      g.arc(p.x, p.y, f.movable ? 9 : 7, 0, Math.PI * 2);
      g.stroke();
      if (!compact || view.scale > 30) {
        g.fillStyle = '#98a3b5';
        g.font = '10px sans-serif';
        g.fillText(f.name, p.x + 11, p.y + 3);
      }
      g.globalAlpha = 1;
    }
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
  const down = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const f = hit(e.clientX, e.clientY);
    const mk = editable && !f && e.button === 0 ? hitMarker(e.clientX, e.clientY) : undefined;
    if (mk) {
      drag.current = { kind: 'marker', id: mk.id, x: e.clientX, y: e.clientY, ox: mk.x, oy: mk.y, moved: false };
    } else if (f && e.button === 0) {
      if (e.ctrlKey || e.shiftKey) setSelection(selection.includes(f.id) ? selection.filter((x) => x !== f.id) : [...selection, f.id]);
      else if (!selection.includes(f.id)) setSelection([f.id]);
      drag.current = editable ? { kind: 'fixture', id: f.id, x: e.clientX, y: e.clientY, ox: pos(f).x, oy: pos(f).y, moved: false } : null;
    } else {
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy, moved: false };
    }
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    if (d.kind === 'pan') setView({ ...view, ox: d.ox + e.clientX - d.x, oy: d.oy + e.clientY - d.y });
    else if (d.id) {
      // Fixtures and stage points share the local drag overlay (ids never collide: both are UUIDs).
      local.current.set(d.id, { x: Math.round((d.ox + (e.clientX - d.x) / view.scale) * 10) / 10, y: Math.round((d.oy - (e.clientY - d.y) / view.scale) * 10) / 10 });
      setView({ ...view });
    }
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'pan' && !d.moved) setSelection([]);
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
    <div ref={wrap} className="canvas-wrap" style={{ height: '100%' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onWheel={wheel} data-testid="stage-canvas">
      <canvas ref={canvas} />
    </div>
  );
}

export const Visualizer = () => <StagePage mode="2d" />;
export const StageVisualizer3D = () => <StagePage mode="3d" />;

export const DETACHED_STAGE_HASH = '#stage3d';

/** Chrome-less live 3D view for a second screen, opened by the "Détacher" button. F11 : plein écran. */
export function DetachedStage3D() {
  const ready = useStore((s) => !!s.project);
  useEffect(() => {
    document.title = 'Stage 3D';
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F11') return;
      e.preventDefault();
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return <div style={{ height: '100vh' }}>{ready ? <Stage3D /> : <div className="empty">Connexion au moteur…</div>}</div>;
}

type Vis = Project['visualizer'];
const SHAPES: { id: Vis['shape']; label: string }[] = [
  { id: 'rect', label: 'Rectangle' }, { id: 'thrust', label: 'Avancée' }, { id: 'arena', label: 'Arène (360°)' },
];

/** Stage layout and stage points (singer, drummer…) shared by the 2D and 3D views. */
function StageSettings({ vis }: { vis: Vis }) {
  const update = (v: Partial<Vis>) => void act({ type: 'project.update', visualizer: v });
  const setMarker = (id: string, patch: Partial<StageMarker>) => update({ markers: vis.markers.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  const addMarker = () => update({ markers: [...vis.markers, { id: newId(), name: `Point ${vis.markers.length + 1}`, x: 0, y: Math.round(vis.stageDepth * 5) / 10, height: 1.7 }] });
  return (
    <div className="panel" style={{ padding: '10px 12px', marginBottom: 10 }} data-testid="stage-settings">
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <span className="small muted">Forme</span>
        <div className="chips" role="group" aria-label="Forme du plateau">
          {SHAPES.map((sh) => <button key={sh.id} className={`chip ${vis.shape === sh.id ? 'on' : ''}`} data-testid={`shape-${sh.id}`} onClick={() => update({ shape: sh.id })}>{sh.label}</button>)}
        </div>
        {vis.shape === 'thrust' && (
          <>
            <span className="small muted">Avancée</span>
            <div style={{ width: 64 }} title="Largeur de l’avancée (m)"><NumberInput value={vis.thrust.width} min={1} max={50} step={0.5} onChange={(v) => update({ thrust: { ...vis.thrust, width: v } })} /></div>
            <span className="muted">×</span>
            <div style={{ width: 64 }} title="Profondeur de l’avancée (m)"><NumberInput value={vis.thrust.depth} min={1} max={50} step={0.5} onChange={(v) => update({ thrust: { ...vis.thrust, depth: v } })} /></div>
          </>
        )}
        {vis.shape !== 'arena' && (
          <label className="row small"><input type="checkbox" checked={vis.cyclo} onChange={(e) => update({ cyclo: e.target.checked })} data-testid="cyclo" />Cyclorama</label>
        )}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <MapPin size={13} className="dim" /><span className="small muted grow">Points de scène — déplaçables en mode Positionner, visibles en 3D</span>
        <button className="btn sm" onClick={addMarker} disabled={vis.markers.length >= 64} data-testid="marker-add"><Plus size={12} />Point</button>
      </div>
      {vis.markers.map((m) => (
        <div key={m.id} className="row" style={{ gap: 6, marginTop: 6 }} data-testid="marker-row">
          <input className="input" style={{ width: 150 }} defaultValue={m.name} maxLength={80} aria-label="Nom du point" onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== m.name) setMarker(m.id, { name }); else e.target.value = m.name; }} />
          <span className="small muted">X</span><div style={{ width: 64 }}><NumberInput value={m.x} min={-100} max={100} step={0.1} onChange={(v) => setMarker(m.id, { x: v })} /></div>
          <span className="small muted">Y</span><div style={{ width: 64 }}><NumberInput value={m.y} min={-100} max={100} step={0.1} onChange={(v) => setMarker(m.id, { y: v })} /></div>
          <span className="small muted" title="Hauteur de visée">H</span><div style={{ width: 64 }}><NumberInput value={m.height} min={0} max={10} step={0.1} onChange={(v) => setMarker(m.id, { height: v })} /></div>
          <button className="btn ghost sm icon" title={`Supprimer « ${m.name} »`} aria-label={`Supprimer le point ${m.name}`} onClick={() => update({ markers: vis.markers.filter((x) => x.id !== m.id) })}><Trash2 size={12} /></button>
        </div>
      ))}
      <TrussSettings vis={vis} />
    </div>
  );
}

const TRUSS_SHAPES: { id: Truss['shape']; label: string }[] = [{ id: 'line', label: 'Droite' }, { id: 'circle', label: 'Cercle' }, { id: 'square', label: 'Carré' }];

/** Explicit trusses: hung fixtures follow them (handled by the main process when a truss changes). */
function TrussSettings({ vis }: { vis: Vis }) {
  const save = (trusses: Truss[]) => void act({ type: 'project.update', visualizer: { trusses } });
  const set = (id: string, patch: Partial<Truss>) => save(vis.trusses.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const add = () => save([...vis.trusses, {
    id: newId(), name: `Structure ${vis.trusses.length + 1}`, shape: 'line', x: 0, y: Math.round(vis.stageDepth * 5) / 10,
    height: 6, length: Math.max(2, vis.stageWidth - 2), rotation: 0, support: 'towers',
  }]);
  const num = (label: string, title: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void) => (
    <><span className="small muted" title={title}>{label}</span><div style={{ width: 60 }} title={title}><NumberInput value={value} min={min} max={max} step={step} onChange={onChange} /></div></>
  );
  return (
    <>
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <span className="small muted grow">Structures (truss) — les projecteurs accrochés suivent la structure ; aimantation au dépôt</span>
        <button className="btn sm" onClick={add} disabled={vis.trusses.length >= 64} data-testid="truss-add"><Plus size={12} />Structure</button>
      </div>
      {vis.trusses.map((t) => (
        <div key={t.id} className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }} data-testid="truss-row">
          <input className="input" style={{ width: 130 }} defaultValue={t.name} maxLength={80} aria-label="Nom de la structure" onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== t.name) set(t.id, { name }); else e.target.value = t.name; }} />
          <select className="select" style={{ width: 92 }} value={t.shape} aria-label="Forme" onChange={(e) => set(t.id, { shape: e.target.value as Truss['shape'] })}>
            {TRUSS_SHAPES.map((sh) => <option key={sh.id} value={sh.id}>{sh.label}</option>)}
          </select>
          {num('L', t.shape === 'circle' ? 'Diamètre (m)' : t.shape === 'square' ? 'Côté (m)' : 'Longueur (m)', t.length, 0.5, 60, 0.5, (v) => set(t.id, { length: v }))}
          {num('X', 'Centre, jardin ↔ cour (m)', t.x, -100, 100, 0.25, (v) => set(t.id, { x: v }))}
          {num('Y', 'Centre, profondeur (m)', t.y, -100, 100, 0.25, (v) => set(t.id, { y: v }))}
          {num('H', 'Hauteur de la structure (m)', t.height, 0.5, 30, 0.25, (v) => set(t.id, { height: v }))}
          {num('°', 'Rotation (°)', t.rotation, -360, 360, 15, (v) => set(t.id, { rotation: v }))}
          <select className="select" style={{ width: 110 }} value={t.support} aria-label="Support" onChange={(e) => set(t.id, { support: e.target.value as Truss['support'] })}>
            <option value="towers">Sur pieds</option>
            <option value="hung">Suspendue</option>
          </select>
          <button className="btn ghost sm icon" title={`Supprimer « ${t.name} » (les projecteurs restent en place, décrochés)`} aria-label={`Supprimer la structure ${t.name}`} onClick={() => save(vis.trusses.filter((x) => x.id !== t.id))}><Trash2 size={12} /></button>
        </div>
      ))}
    </>
  );
}

/** Scene-layout undo / redo (main-process history), with Ctrl+Z / Ctrl+Y outside text fields. */
function SceneHistory() {
  const history = useStore((s) => s.project?.sceneHistory);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); void act({ type: 'scene.undo' }); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); void act({ type: 'scene.redo' }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      <button className="btn icon" title="Annuler la dernière modification de scène (Ctrl+Z)" disabled={!history?.undo} onClick={() => void act({ type: 'scene.undo' })} data-testid="scene-undo"><Undo2 size={14} /></button>
      <button className="btn icon" title="Rétablir (Ctrl+Y)" disabled={!history?.redo} onClick={() => void act({ type: 'scene.redo' })} data-testid="scene-redo"><Redo2 size={14} /></button>
    </>
  );
}

function StagePage({ mode }: { mode: '2d' | '3d' }) {
  const { fixtures } = useResolved();
  const project = useStore((s) => s.project!.project);
  const preview = useStore((s) => s.preview);
  const setPreview = useStore((s) => s.setPreview);
  const [edit, setEdit] = useState(false);
  const [settings, setSettings] = useState(false);
  const [group, setGroup] = useState<string | null>(null);
  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column' }}>
      <PageHead title={mode === '3d' ? 'Stage 3D' : 'Stage Visualizer'} subtitle={mode === '3d' ? 'Vue 3D approximative — glisser : orbite, clic droit : déplacer, molette : zoom' : 'Vue de dessus 2D synchronisée avec l’état calculé du moteur — molette : zoom, glisser le fond : déplacer la vue'}>
        <select className="select" style={{ width: 160 }} value={group ?? ''} onChange={(e) => setGroup(e.target.value || null)}>
          <option value="">Tous les groupes</option>
          {project.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        {mode === '3d' && <button className="btn" data-testid="stage3d-detach" onClick={() => window.open(location.href.split('#')[0] + DETACHED_STAGE_HASH, 'luma-stage3d')} title="Ouvrir la vue 3D dans une fenêtre séparée (second écran, F11 : plein écran)"><ExternalLink size={14} />Détacher</button>}
        {mode === '2d' && <button className={`btn ${edit ? 'on' : ''}`} onClick={() => setEdit(!edit)} title="Déplacer les projecteurs sur la scène (enregistré dans le patch)"><Move size={14} />Positionner</button>}
        <span className="small muted">Scène</span>
        <div style={{ width: 70 }} title="Largeur (m)"><NumberInput value={project.visualizer.stageWidth} min={2} max={200} onChange={(v) => void act({ type: 'project.update', visualizer: { stageWidth: v } })} /></div>
        <span className="muted">×</span>
        <div style={{ width: 70 }} title="Profondeur (m)"><NumberInput value={project.visualizer.stageDepth} min={2} max={200} onChange={(v) => void act({ type: 'project.update', visualizer: { stageDepth: v } })} /></div>
        <button className={`btn ${settings ? 'on' : ''}`} onClick={() => setSettings(!settings)} title="Forme du plateau, cyclorama, points de scène et structures" data-testid="stage-settings-toggle"><Settings2 size={14} />Scène</button>
        <SceneHistory />
      </PageHead>
      {settings && <StageSettings vis={project.visualizer} />}
      {preview && (
        <div className="panel row" style={{ padding: '8px 12px', marginBottom: 10, borderColor: 'rgba(139,92,246,.6)' }}>
          <span className="badge violet">APERÇU</span>
          <span className="grow">{preview.label.startsWith('Prévisualisation') ? preview.label : 'Prévisualisation d’une proposition IA'} — non envoyé aux sorties</span>
          <button className="btn sm" onClick={() => setPreview(null)}><X size={12} />Revenir au direct</button>
        </div>
      )}
      {fixtures.length === 0 ? (
        <Empty icon={<Theater size={32} />} title="Scène vide">Ajoutez des projecteurs : ils apparaissent ici à leur position de scène.</Empty>
      ) : (
        <div style={{ flex: 1, minHeight: 320 }}>
          {mode === '3d' ? <Stage3D values={preview?.values} groupFilter={group} /> : <StageCanvas values={preview?.values} editable={edit} groupFilter={group} />}
        </div>
      )}
    </div>
  );
}
