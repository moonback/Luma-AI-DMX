import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Boxes, ExternalLink, LayoutTemplate, MapPin, Monitor, Move, Plus, Redo2, Settings2, Theater, Trash2, Undo2, UserRound, X } from 'lucide-react';
import { confirmAction, useStore } from '../store';
import { act, newId } from '../api';
import { NumberInput, PageHead, useResolved } from '../components/ui';
import { buildVisualModel, type VisualFixture } from '../../core/visualizer/model';
import { Stage3D } from './Stage3D';
import type { FixtureValues, Performer, Project, StageMarker, StageScreen, Truss } from '../../core/model/schemas';
import { DARK_LEVEL, performerLight, toHex } from '../../core/visualizer/lighting';
import { setScreenVideo, screenVideo } from '../screenMedia';
import { snapToTrusses, trussSegments, trussSupports } from '../../core/visualizer/truss';
import { SCENE_TEMPLATES, hasSceneContent, sceneTemplate } from '../../core/visualizer/templates';

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
  const drag = useRef<{ kind: 'pan' | 'fixture' | 'marker' | 'performer'; id?: string; x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const local = useRef(new Map<string, { x: number; y: number }>());
  const fitKey = useRef('');
  const model = useMemo(() => buildVisualModel(fixtures, values ?? live), [fixtures, values, live]);
  const group = groupFilter ? project.groups.find((g) => g.id === groupFilter) : null;
  const vis = project.visualizer;
  const W = vis.stageWidth, D = vis.stageDepth;
  const thrust = vis.shape === 'thrust' ? vis.thrust : null;
  const front = thrust?.depth ?? 0;
  const markerPos = (m: StageMarker) => local.current.get(m.id) ?? { x: m.x, y: m.y };
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
    // Screens: thick bar seen from above, in their colour.
    for (const sc of vis.screens) {
      const a2 = (sc.rotation * Math.PI) / 180, hw = sc.width / 2;
      const p1 = toScreen(sc.x - Math.cos(a2) * hw, sc.y - Math.sin(a2) * hw), p2 = toScreen(sc.x + Math.cos(a2) * hw, sc.y + Math.sin(a2) * hw);
      g.strokeStyle = sc.source === 'color' ? sc.color : '#5b6b8c';
      g.lineWidth = 5;
      g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.stroke();
      g.lineWidth = 1;
      g.fillStyle = '#7d879c';
      g.font = '10px sans-serif';
      g.fillText(sc.name, (p1.x + p2.x) / 2 + 6, (p1.y + p2.y) / 2 - 6);
    }
    // Performers: disc tinted by the light on their face, red ring when in the dark.
    for (const pf of vis.performers) {
      const q = toScreen(performerPos(pf).x, performerPos(pf).y);
      const l = performerLight({ ...pf, ...performerPos(pf), markerId: null }, vis.markers, model);
      g.beginPath();
      g.arc(q.x, q.y, 8, 0, Math.PI * 2);
      g.fillStyle = l.level < DARK_LEVEL ? '#1b1f29' : toHex({ r: 0.15 + l.r * 0.85, g: 0.15 + l.g * 0.85, b: 0.15 + l.b * 0.85 });
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = l.level < DARK_LEVEL ? '#f87171' : '#e2e8f0';
      g.stroke();
      g.lineWidth = 1;
      g.fillStyle = '#e2e8f0';
      g.font = '10px sans-serif';
      g.fillText(`${pf.name} · ${Math.round(l.level * 100)} %`, q.x + 11, q.y + 3);
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
  const hitPerformer = (cx: number, cy: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return vis.performers.find((pf) => { const q = toScreen(performerPos(pf).x, performerPos(pf).y); return Math.hypot(q.x - (cx - r.left), q.y - (cy - r.top)) < 10; });
  };
  const down = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const f = hit(e.clientX, e.clientY);
    const pf = editable && !f && e.button === 0 ? hitPerformer(e.clientX, e.clientY) : undefined;
    const mk = editable && !f && !pf && e.button === 0 ? hitMarker(e.clientX, e.clientY) : undefined;
    if (pf) {
      const at = performerPos(pf);
      drag.current = { kind: 'performer', id: pf.id, x: e.clientX, y: e.clientY, ox: at.x, oy: at.y, moved: false };
    } else if (mk) {
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
    if (d?.kind === 'performer' && d.id && d.moved) {
      const p = local.current.get(d.id)!;
      const clampPos = (v: number) => Math.max(-100, Math.min(100, v));
      // Dropped on a stage point (within 50 cm): the performer stands on it and follows it; else free.
      const near = vis.markers.find((m) => Math.hypot(m.x - p.x, m.y - p.y) <= 0.5);
      const performers = vis.performers.map((x) => (x.id === d.id ? { ...x, x: clampPos(near?.x ?? p.x), y: clampPos(near?.y ?? p.y), markerId: near?.id ?? null } : x));
      void act({ type: 'project.update', visualizer: { performers } }).finally(() => local.current.delete(d.id!));
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

/** Collapsible panel section (native <details>: keyboard accessible, toggled state kept by the browser). */
function Section({ icon, title, count, open = true, children }: { icon: ReactNode; title: string; count?: number; open?: boolean; children: ReactNode }) {
  return (
    <details className="scene-section" open={open}>
      <summary>{icon}<span className="grow">{title}</span>{count !== undefined && <span className="badge">{count}</span>}</summary>
      <div className="scene-section-body">{children}</div>
    </details>
  );
}

/** Labeled numeric field of a scene card. */
function Num({ label, title, value, min, max, step = 0.25, onChange }: { label: string; title: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return <label className="scene-num" title={title}><span>{label}</span><NumberInput value={value} min={min} max={max} step={step} onChange={onChange} /></label>;
}

/** Name field committed on blur; `key` resets it when the saved name changes (undo, template). */
function NameInput({ value, label, onChange }: { value: string; label: string; onChange: (name: string) => void }) {
  return (
    <input key={value} className="input grow" defaultValue={value} maxLength={80} aria-label={label}
      onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== value) onChange(name); else e.target.value = value; }} />
  );
}

function Card({ testId, head, children }: { testId: string; head: ReactNode; children?: ReactNode }) {
  return (
    <div className="scene-card" data-testid={testId}>
      <div className="row" style={{ gap: 6 }}>{head}</div>
      {children && <div className="scene-card-grid">{children}</div>}
    </div>
  );
}

const DeleteBtn = ({ name, title, onClick }: { name: string; title?: string; onClick: () => void }) => (
  <button className="btn ghost sm icon" title={title ?? `Supprimer « ${name} »`} aria-label={`Supprimer ${name}`} onClick={onClick}><Trash2 size={12} /></button>
);

const AddBtn = ({ label, disabled, onClick, testId }: { label: string; disabled: boolean; onClick: () => void; testId: string }) => (
  <button className="btn sm scene-add" onClick={onClick} disabled={disabled} data-testid={testId}><Plus size={12} />{label}</button>
);

/** One-click starting layouts; replacing a non-empty scene asks first (and stays undoable). */
function TemplatePicker({ vis }: { vis: Vis }) {
  const apply = async (t: (typeof SCENE_TEMPLATES)[number]) => {
    if (hasSceneContent(vis) && !(await confirmAction({
      title: 'Remplacer la scène',
      message: `Le modèle « ${t.label} » remplace le plateau, les points, structures, interprètes et écrans actuels.\nLes projecteurs restent en place. Ctrl+Z pour annuler.`,
      confirmLabel: 'Remplacer',
    }))) return;
    for (const sc of vis.screens) setScreenVideo(sc.id, null);
    void act({ type: 'project.update', visualizer: sceneTemplate(t.id, newId) });
  };
  return (
    <div className="scene-templates">
      {SCENE_TEMPLATES.map((t) => (
        <button key={t.id} className="scene-template" onClick={() => void apply(t)} data-testid={`template-${t.id}`}>
          <b>{t.label}</b><span className="small dim">{t.hint}</span>
        </button>
      ))}
    </div>
  );
}

/** Scene builder shared by the 2D and 3D views: template, stage, points, trusses, performers, screens. */
function ScenePanel({ vis, onClose }: { vis: Vis; onClose: () => void }) {
  const update = (v: Partial<Vis>) => void act({ type: 'project.update', visualizer: v });
  const setMarker = (id: string, patch: Partial<StageMarker>) => update({ markers: vis.markers.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  const addMarker = () => update({ markers: [...vis.markers, { id: newId(), name: `Point ${vis.markers.length + 1}`, x: 0, y: Math.round(vis.stageDepth * 5) / 10, height: 1.7 }] });
  return (
    <aside className="scene-panel" data-testid="stage-settings" aria-label="Construction de la scène">
      <div className="scene-panel-head">
        <Settings2 size={14} className="dim" /><b className="grow">Construire la scène</b>
        <button className="btn ghost sm icon" onClick={onClose} title="Fermer le panneau" aria-label="Fermer le panneau"><X size={14} /></button>
      </div>
      <div className="scene-panel-body">
        <Section icon={<LayoutTemplate size={13} />} title="Partir d’un modèle" open={!hasSceneContent(vis)}>
          <TemplatePicker vis={vis} />
        </Section>
        <Section icon={<Theater size={13} />} title="Plateau">
          <div className="chips" role="group" aria-label="Forme du plateau">
            {SHAPES.map((sh) => <button key={sh.id} className={`chip ${vis.shape === sh.id ? 'on' : ''}`} data-testid={`shape-${sh.id}`} onClick={() => update({ shape: sh.id })}>{sh.label}</button>)}
          </div>
          <div className="scene-card-grid">
            <Num label="Largeur" title="Largeur du plateau, jardin ↔ cour (m)" value={vis.stageWidth} min={2} max={200} step={1} onChange={(v) => update({ stageWidth: v })} />
            <Num label="Profondeur" title="Profondeur du plateau (m)" value={vis.stageDepth} min={2} max={200} step={1} onChange={(v) => update({ stageDepth: v })} />
            {vis.shape !== 'arena' && (
              <label className="row small scene-check"><input type="checkbox" checked={vis.cyclo} onChange={(e) => update({ cyclo: e.target.checked })} data-testid="cyclo" />Cyclorama</label>
            )}
            {vis.shape === 'thrust' && (
              <>
                <Num label="Avancée L" title="Largeur de l’avancée (m)" value={vis.thrust.width} min={1} max={50} step={0.5} onChange={(v) => update({ thrust: { ...vis.thrust, width: v } })} />
                <Num label="Avancée P" title="Profondeur de l’avancée (m)" value={vis.thrust.depth} min={1} max={50} step={0.5} onChange={(v) => update({ thrust: { ...vis.thrust, depth: v } })} />
              </>
            )}
          </div>
        </Section>
        <Section icon={<MapPin size={13} />} title="Points de scène" count={vis.markers.length}>
          {vis.markers.map((m) => (
            <Card key={m.id} testId="marker-row" head={<><NameInput value={m.name} label="Nom du point" onChange={(name) => setMarker(m.id, { name })} /><DeleteBtn name={m.name} onClick={() => update({ markers: vis.markers.filter((x) => x.id !== m.id) })} /></>}>
              <Num label="X" title="Jardin ↔ cour (m)" value={m.x} min={-100} max={100} step={0.1} onChange={(v) => setMarker(m.id, { x: v })} />
              <Num label="Y" title="Profondeur (m)" value={m.y} min={-100} max={100} step={0.1} onChange={(v) => setMarker(m.id, { y: v })} />
              <Num label="H visée" title="Hauteur de visée (m)" value={m.height} min={0} max={10} step={0.1} onChange={(v) => setMarker(m.id, { height: v })} />
            </Card>
          ))}
          <AddBtn label="Point de scène" onClick={addMarker} disabled={vis.markers.length >= 64} testId="marker-add" />
          <p className="scene-hint">Repères « chanteur », « batteur »… déplaçables en 2D (Positionner).</p>
        </Section>
        <TrussSettings vis={vis} />
        <PerformerSettings vis={vis} />
        <ScreenSettings vis={vis} />
      </div>
    </aside>
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
  return (
    <Section icon={<Boxes size={13} />} title="Structures (truss)" count={vis.trusses.length}>
      {vis.trusses.map((t) => (
        <Card key={t.id} testId="truss-row" head={<>
          <NameInput value={t.name} label="Nom de la structure" onChange={(name) => set(t.id, { name })} />
          <select className="select" style={{ width: 84 }} value={t.shape} aria-label="Forme" onChange={(e) => set(t.id, { shape: e.target.value as Truss['shape'] })}>
            {TRUSS_SHAPES.map((sh) => <option key={sh.id} value={sh.id}>{sh.label}</option>)}
          </select>
          <DeleteBtn name={t.name} title={`Supprimer « ${t.name} » (les projecteurs restent en place, décrochés)`} onClick={() => save(vis.trusses.filter((x) => x.id !== t.id))} />
        </>}>
          {/* Field order L, X, Y, H, ° is relied upon by the end-to-end tests. */}
          <Num label={t.shape === 'circle' ? 'Diamètre' : t.shape === 'square' ? 'Côté' : 'Longueur'} title="Taille (m)" value={t.length} min={0.5} max={60} step={0.5} onChange={(v) => set(t.id, { length: v })} />
          <Num label="X" title="Centre, jardin ↔ cour (m)" value={t.x} min={-100} max={100} onChange={(v) => set(t.id, { x: v })} />
          <Num label="Y" title="Centre, profondeur (m)" value={t.y} min={-100} max={100} onChange={(v) => set(t.id, { y: v })} />
          <Num label="Hauteur" title="Hauteur de la structure (m)" value={t.height} min={0.5} max={30} onChange={(v) => set(t.id, { height: v })} />
          <Num label="Rotation" title="Rotation (°)" value={t.rotation} min={-360} max={360} step={15} onChange={(v) => set(t.id, { rotation: v })} />
          <label className="scene-num"><span>Support</span>
            <select className="select" value={t.support} aria-label="Support" onChange={(e) => set(t.id, { support: e.target.value as Truss['support'] })}>
              <option value="towers">Sur pieds</option>
              <option value="hung">Suspendue</option>
            </select>
          </label>
        </Card>
      ))}
      <AddBtn label="Structure" onClick={add} disabled={vis.trusses.length >= 64} testId="truss-add" />
      <p className="scene-hint">Les projecteurs accrochés suivent la structure ; aimantation au dépôt.</p>
    </Section>
  );
}

const PERFORMER_KINDS: { id: Performer['kind']; label: string }[] = [
  { id: 'standing', label: 'Debout' }, { id: 'seated', label: 'Assis' }, { id: 'drums', label: 'Batterie' }, { id: 'keys', label: 'Clavier' }, { id: 'lectern', label: 'Pupitre' },
];

/** Performer and instrument silhouettes; their face shows the light received (2D disc, 3D tint). */
function PerformerSettings({ vis }: { vis: Vis }) {
  const save = (performers: Performer[]) => void act({ type: 'project.update', visualizer: { performers } });
  const set = (id: string, patch: Partial<Performer>) => save(vis.performers.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const add = () => save([...vis.performers, { id: newId(), name: `Artiste ${vis.performers.length + 1}`, kind: 'standing', x: 0, y: Math.round(vis.stageDepth * 4) / 10, rotation: 0, markerId: null }]);
  return (
    <Section icon={<UserRound size={13} />} title="Interprètes et instruments" count={vis.performers.length}>
      {vis.performers.map((pf) => (
        <Card key={pf.id} testId="performer-row" head={<>
          <NameInput value={pf.name} label="Nom de l’interprète" onChange={(name) => set(pf.id, { name })} />
          {/* The silhouette must stay the first select of the card (end-to-end tests). */}
          <select className="select" style={{ width: 92 }} value={pf.kind} aria-label="Silhouette" onChange={(e) => set(pf.id, { kind: e.target.value as Performer['kind'] })}>
            {PERFORMER_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
          <DeleteBtn name={pf.name} onClick={() => save(vis.performers.filter((x) => x.id !== pf.id))} />
        </>}>
          <label className="scene-num span2"><span>Position</span>
            <select className="select" value={pf.markerId ?? ''} aria-label="Point de scène" data-testid="performer-marker" onChange={(e) => {
              const m = vis.markers.find((x) => x.id === e.target.value);
              set(pf.id, m ? { markerId: m.id, x: m.x, y: m.y } : { markerId: null });
            }}>
              <option value="">Position libre</option>
              {vis.markers.map((m) => <option key={m.id} value={m.id}>Sur « {m.name} »</option>)}
            </select>
          </label>
          <Num label="Orientation" title="Orientation (0° = face au public)" value={pf.rotation} min={-360} max={360} step={15} onChange={(v) => set(pf.id, { rotation: v })} />
          {!pf.markerId && (
            <>
              <Num label="X" title="Jardin ↔ cour (m)" value={pf.x} min={-100} max={100} onChange={(v) => set(pf.id, { x: v })} />
              <Num label="Y" title="Profondeur (m)" value={pf.y} min={-100} max={100} onChange={(v) => set(pf.id, { y: v })} />
            </>
          )}
        </Card>
      ))}
      <AddBtn label="Interprète" onClick={add} disabled={vis.performers.length >= 64} testId="performer-add" />
      <p className="scene-hint">Lâché sur un point de scène en 2D, l’interprète s’y pose et le suit.</p>
    </Section>
  );
}

const SCREEN_SOURCES: { id: StageScreen['source']; label: string }[] = [
  { id: 'color', label: 'Couleur' }, { id: 'image', label: 'Image' }, { id: 'video', label: 'Vidéo' }, { id: 'pixels', label: 'Pixel mapping' },
];
/** Images are downscaled before being stored in the project (keeps project files small). */
const SCREEN_IMAGE_MAX_PX = 512;

function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, SCREEN_IMAGE_MAX_PX / Math.max(img.width, img.height));
      const c = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(img.width * k)), height: Math.max(1, Math.round(img.height * k)) });
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}

/** LED screens / video surfaces with a light spill on their surroundings. */
function ScreenSettings({ vis }: { vis: Vis }) {
  const [, rerender] = useState(0);
  const toast = useStore((s) => s.toast);
  const save = (screens: StageScreen[]) => void act({ type: 'project.update', visualizer: { screens } });
  const set = (id: string, patch: Partial<StageScreen>) => save(vis.screens.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const add = () => save([...vis.screens, {
    id: newId(), name: `Écran ${vis.screens.length + 1}`, x: 0, y: Math.round(vis.stageDepth * 9) / 10, elevation: 1.5,
    width: Math.min(6, vis.stageWidth / 2), height: 3, rotation: 0, source: 'color', color: '#3b82f6', image: null, glow: 0.5,
  }]);
  return (
    <Section icon={<Monitor size={13} />} title="Écrans LED" count={vis.screens.length}>
      {vis.screens.map((sc) => (
        <Card key={sc.id} testId="screen-row" head={<>
          <NameInput value={sc.name} label="Nom de l’écran" onChange={(name) => set(sc.id, { name })} />
          <DeleteBtn name={sc.name} onClick={() => { setScreenVideo(sc.id, null); save(vis.screens.filter((x) => x.id !== sc.id)); }} />
        </>}>
          <label className="scene-num span2"><span>Contenu</span>
            <select className="select" value={sc.source} aria-label="Contenu" data-testid="screen-source" onChange={(e) => set(sc.id, { source: e.target.value as StageScreen['source'] })}>
              {SCREEN_SOURCES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </label>
          <div className="scene-num">
            <span>&nbsp;</span>
            {sc.source === 'color' && <input type="color" value={sc.color} aria-label="Couleur de l’écran" onChange={(e) => set(sc.id, { color: e.target.value })} className="scene-color" />}
            {sc.source === 'image' && (
              <label className="btn sm" title="Image (réduite à 512 px et enregistrée dans le projet)">{sc.image ? 'Changer' : 'Image…'}
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) shrinkImage(file).then((image) => set(sc.id, { image })).catch((err: Error) => toast({ kind: 'error', title: 'Image', detail: err.message }));
                }} />
              </label>
            )}
            {sc.source === 'video' && (
              <label className="btn sm" title="Vidéo lue pendant cette session uniquement : le fichier n’est pas copié dans le projet">{screenVideo(sc.id) ? 'Changer' : 'Vidéo…'}
                <input type="file" accept="video/*" hidden onChange={(e) => { setScreenVideo(sc.id, e.target.files?.[0] ?? null); rerender((n) => n + 1); }} />
              </label>
            )}
          </div>
          <Num label="X" title="Centre, jardin ↔ cour (m)" value={sc.x} min={-100} max={100} onChange={(v) => set(sc.id, { x: v })} />
          <Num label="Y" title="Profondeur (m)" value={sc.y} min={-100} max={100} onChange={(v) => set(sc.id, { y: v })} />
          <Num label="Bas à" title="Hauteur du bas de l’écran (m)" value={sc.elevation} min={0} max={30} onChange={(v) => set(sc.id, { elevation: v })} />
          <Num label="Largeur" title="Largeur (m)" value={sc.width} min={0.2} max={60} onChange={(v) => set(sc.id, { width: v })} />
          <Num label="Hauteur" title="Hauteur (m)" value={sc.height} min={0.2} max={30} onChange={(v) => set(sc.id, { height: v })} />
          <Num label="Rotation" title="Rotation (0° = face au public)" value={sc.rotation} min={-360} max={360} step={15} onChange={(v) => set(sc.id, { rotation: v })} />
          <label className="scene-num span3" title="Lumière diffusée sur le plateau et la brume"><span>Halo {Math.round(sc.glow * 100)} %</span>
            <input type="range" min={0} max={100} value={Math.round(sc.glow * 100)} onChange={(e) => set(sc.id, { glow: Number(e.target.value) / 100 })} />
          </label>
        </Card>
      ))}
      <AddBtn label="Écran" onClick={add} disabled={vis.screens.length >= 16} testId="screen-add" />
      <p className="scene-hint">Couleur, image, vidéo (non enregistrée) ou pixel mapping des barres LED.</p>
    </Section>
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
      <PageHead title={mode === '3d' ? 'Stage 3D' : 'Stage Visualizer'} subtitle={mode === '3d' ? 'Aperçu 3D approximatif de la scène et des faisceaux' : 'Plan de dessus synchronisé avec le moteur'}>
        <button className={`btn ${settings ? 'on' : ''}`} onClick={() => setSettings(!settings)} title="Modèles, plateau, points de scène, structures, interprètes et écrans" data-testid="stage-settings-toggle"><Settings2 size={14} />Scène</button>
        {mode === '2d' && <button className={`btn ${edit ? 'on' : ''}`} onClick={() => setEdit(!edit)} title="Déplacer projecteurs, points et interprètes sur la scène (enregistré dans le projet)"><Move size={14} />Positionner</button>}
        <SceneHistory />
        <select className="select" style={{ width: 160 }} value={group ?? ''} onChange={(e) => setGroup(e.target.value || null)} aria-label="Filtrer par groupe">
          <option value="">Tous les groupes</option>
          {project.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        {mode === '3d' && <button className="btn" data-testid="stage3d-detach" onClick={() => window.open(location.href.split('#')[0] + DETACHED_STAGE_HASH, 'luma-stage3d')} title="Ouvrir la vue 3D dans une fenêtre séparée (second écran, F11 : plein écran)"><ExternalLink size={14} />Détacher</button>}
      </PageHead>
      {preview && (
        <div className="panel row" style={{ padding: '8px 12px', marginBottom: 10, borderColor: 'rgba(139,92,246,.6)' }}>
          <span className="badge violet">APERÇU</span>
          <span className="grow">{preview.label.startsWith('Prévisualisation') ? preview.label : 'Prévisualisation d’une proposition IA'} — non envoyé aux sorties</span>
          <button className="btn sm" onClick={() => setPreview(null)}><X size={12} />Revenir au direct</button>
        </div>
      )}
      <div className="stage-layout">
        {settings && <ScenePanel vis={project.visualizer} onClose={() => setSettings(false)} />}
        <div className="stage-view">
          {mode === '3d' ? <Stage3D values={preview?.values} groupFilter={group} /> : <StageCanvas values={preview?.values} editable={edit} groupFilter={group} />}
          {fixtures.length === 0 && (
            <div className="stage-empty">
              <Theater size={18} className="dim" />
              <span className="grow">Aucun projecteur : ajoutez-en dans le Patch. Vous pouvez déjà construire le décor.</span>
              {!settings && <button className="btn sm" onClick={() => setSettings(true)}><Settings2 size={12} />Construire la scène</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
