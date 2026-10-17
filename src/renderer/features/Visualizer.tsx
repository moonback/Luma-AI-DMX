import { useEffect, useMemo, useRef, useState } from 'react';
import { Move, Theater, X } from 'lucide-react';
import { useStore } from '../store';
import { act } from '../api';
import { Empty, NumberInput, PageHead, useResolved } from '../components/ui';
import { buildVisualModel, type VisualFixture } from '../../core/visualizer/model';
import { Stage3D } from './Stage3D';
import type { FixtureValues } from '../../core/model/schemas';

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
  const drag = useRef<{ kind: 'pan' | 'fixture'; id?: string; x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const local = useRef(new Map<string, { x: number; y: number }>());
  const model = useMemo(() => buildVisualModel(fixtures, values ?? live), [fixtures, values, live]);
  const group = groupFilter ? project.groups.find((g) => g.id === groupFilter) : null;
  const W = project.visualizer.stageWidth, D = project.visualizer.stageDepth;

  // Fit stage on first layout.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      setView((v) => (v.scale ? v : { scale: Math.min(r.width / (W + 4), r.height / (D + 4)), ox: r.width / 2, oy: r.height - 20 }));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, D]);

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
    g.fillStyle = '#66718a';
    g.font = '11px sans-serif';
    g.fillText('PUBLIC', toScreen(0, 0).x - 20, toScreen(0, 0).y + 14);
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
  const down = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const f = hit(e.clientX, e.clientY);
    if (f && e.button === 0) {
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
      local.current.set(d.id, { x: Math.round((d.ox + (e.clientX - d.x) / view.scale) * 10) / 10, y: Math.round((d.oy - (e.clientY - d.y) / view.scale) * 10) / 10 });
      setView({ ...view });
    }
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'pan' && !d.moved) setSelection([]);
    if (d?.kind === 'fixture' && d.id && d.moved) {
      const p = local.current.get(d.id)!;
      void act({ type: 'fixture.update', id: d.id, patch: { position: { x: Math.max(-100, Math.min(100, p.x)), y: Math.max(-100, Math.min(100, p.y)) } } }).finally(() => local.current.delete(d.id!));
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

export function Visualizer() {
  const { fixtures } = useResolved();
  const project = useStore((s) => s.project!.project);
  const preview = useStore((s) => s.preview);
  const setPreview = useStore((s) => s.setPreview);
  const [edit, setEdit] = useState(false);
  const [group, setGroup] = useState<string | null>(null);
  const [mode, setMode] = useState<'2d' | '3d'>(() => {
    try {
      return localStorage.getItem('luma.visualizer') === '3d' ? '3d' : '2d';
    } catch {
      return '2d';
    }
  });
  const pickMode = (m: '2d' | '3d') => {
    setMode(m);
    try {
      localStorage.setItem('luma.visualizer', m);
    } catch {
      // preference simply not persisted
    }
  };
  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column' }}>
      <PageHead title="Stage Visualizer" subtitle={mode === '3d' ? 'Vue 3D approximative — glisser : orbite, clic droit : déplacer, molette : zoom' : 'Vue de dessus 2D synchronisée avec l’état calculé du moteur — molette : zoom, glisser le fond : déplacer la vue'}>
        <select className="select" style={{ width: 160 }} value={group ?? ''} onChange={(e) => setGroup(e.target.value || null)}>
          <option value="">Tous les groupes</option>
          {project.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <div className="chips">
          <button className={`chip ${mode === '2d' ? 'on' : ''}`} onClick={() => pickMode('2d')} data-testid="view-2d">2D</button>
          <button className={`chip ${mode === '3d' ? 'on' : ''}`} onClick={() => pickMode('3d')} data-testid="view-3d">3D</button>
        </div>
        <button className={`btn ${edit ? 'on' : ''}`} disabled={mode === '3d'} onClick={() => setEdit(!edit)} title="Déplacer les projecteurs sur la scène (enregistré dans le patch)"><Move size={14} />Positionner</button>
        <span className="small muted">Scène</span>
        <div style={{ width: 70 }} title="Largeur (m)"><NumberInput value={project.visualizer.stageWidth} min={2} max={200} onChange={(v) => void act({ type: 'project.update', visualizer: { stageWidth: v } })} /></div>
        <span className="muted">×</span>
        <div style={{ width: 70 }} title="Profondeur (m)"><NumberInput value={project.visualizer.stageDepth} min={2} max={200} onChange={(v) => void act({ type: 'project.update', visualizer: { stageDepth: v } })} /></div>
      </PageHead>
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
