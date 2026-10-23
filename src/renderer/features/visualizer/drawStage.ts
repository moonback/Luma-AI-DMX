import type { VisualFixture } from '../../../core/visualizer/model';
import type { Group, Performer, Project, StageMarker, Truss } from '../../../core/model/schemas';
import { DARK_LEVEL, performerLight, toHex } from '../../../core/visualizer/lighting';
import { trussSegments, trussSupports } from '../../../core/visualizer/truss';
import { findElement, type SceneRef } from '../../../core/visualizer/sceneEdit';

export interface View { scale: number; ox: number; oy: number }

/** Everything the 2D top view needs to draw one frame (positions include the drag overlay). */
export interface StageDrawState {
  W: number;
  D: number;
  thrust: Project['visualizer']['thrust'] | null;
  vis: Project['visualizer'];
  view: View;
  compact?: boolean;
  group: Group | null | undefined;
  model: VisualFixture[];
  selection: string[];
  sceneSel: SceneRef | null;
  toScreen: (x: number, y: number, v?: View) => { x: number; y: number };
  pos: (f: VisualFixture) => { x: number; y: number };
  at: <T extends { id: string; x: number; y: number }>(e: T) => T;
  markerPos: (m: StageMarker) => { x: number; y: number };
  performerPos: (pf: Performer) => { x: number; y: number };
}

/** Draws the 2D top-down stage view: floor, set pieces, trusses, screens, performers, beams and fixtures. */
export function drawStage(g: CanvasRenderingContext2D, r: { width: number; height: number }, s: StageDrawState): void {
  const { W, D, thrust, vis, view, compact, group, model, selection, sceneSel, toScreen, pos, at, markerPos, performerPos } = s;
  g.fillStyle = '#0a1120';
  g.fillRect(0, 0, r.width, r.height);
  // Metre grid over the whole view (every 5 m stronger), so distances read outside the stage too.
  if (view.scale >= 4) {
    const o = toScreen(0, 0);
    const x0 = Math.floor(-o.x / view.scale), x1 = Math.ceil((r.width - o.x) / view.scale);
    const y0 = Math.floor((o.y - r.height) / view.scale), y1 = Math.ceil(o.y / view.scale);
    g.lineWidth = 1;
    for (let x = x0; x <= x1; x++) { const p = toScreen(x, 0); g.strokeStyle = x % 5 ? 'rgba(52,120,246,0.06)' : 'rgba(52,120,246,0.14)'; g.beginPath(); g.moveTo(Math.round(p.x) + 0.5, 0); g.lineTo(Math.round(p.x) + 0.5, r.height); g.stroke(); }
    for (let y = y0; y <= y1; y++) { const p = toScreen(0, y); g.strokeStyle = y % 5 ? 'rgba(52,120,246,0.06)' : 'rgba(52,120,246,0.14)'; g.beginPath(); g.moveTo(0, Math.round(p.y) + 0.5); g.lineTo(r.width, Math.round(p.y) + 0.5); g.stroke(); }
  }
  // Stage
  const a = toScreen(-W / 2, D), b = toScreen(W / 2, 0);
  g.fillStyle = '#0e1828';
  g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  g.strokeStyle = '#3a5277';
  g.lineWidth = 1;
  g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  g.strokeStyle = 'rgba(58,82,119,0.35)';
  for (let x = Math.ceil(-W / 2); x <= W / 2; x++) { const p = toScreen(x, 0), q = toScreen(x, D); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke(); }
  for (let y = 1; y < D; y++) { const p = toScreen(-W / 2, y), q = toScreen(W / 2, y); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke(); }
  if (thrust) {
    const ta = toScreen(-thrust.width / 2, 0), tb = toScreen(thrust.width / 2, -thrust.depth);
    g.fillStyle = '#0e1828';
    g.fillRect(ta.x, ta.y, tb.x - ta.x, tb.y - ta.y);
    g.strokeStyle = '#3a5277';
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
  // Set pieces: footprint in their colour (round for columns and mic stands), outline, name.
  for (const p0 of vis.props) {
    if (p0.hidden) continue;
    const p = at(p0);
    g.fillStyle = `${p.color}cc`;
    g.strokeStyle = '#4b5570';
    g.beginPath();
    if (p.kind === 'column' || p.kind === 'mic') {
      const q = toScreen(p.x, p.y);
      g.arc(q.x, q.y, Math.max(4, (p.width / 2) * view.scale), 0, Math.PI * 2);
    } else {
      const a = (p.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([u, v], i) => {
        const lx = (u! * p.width) / 2, ly = (v! * p.depth) / 2;
        const q = toScreen(p.x + lx * c - ly * s, p.y + lx * s + ly * c);
        if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y);
      });
      g.closePath();
    }
    g.fill();
    g.stroke();
    const q = toScreen(p.x, p.y);
    g.fillStyle = '#98a3b5';
    g.font = '10px sans-serif';
    g.fillText(p.name, q.x + 6, q.y + 3);
  }
  // Explicit trusses: thick outline (a totem: a square seen from above), support feet, name.
  for (const t0 of vis.trusses) {
    const t = at(t0);
    if (t.shape === 'totem') {
      const q = toScreen(t.x, t.y), s = Math.max(8, 0.3 * view.scale);
      g.fillStyle = '#9aa3b5';
      g.fillRect(q.x - s / 2, q.y - s / 2, s, s);
    }
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
  for (const sc0 of vis.screens) {
    const sc = at(sc0);
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
    const l = performerLight({ ...pf, ...performerPos(pf), markerId: null }, vis.markers, model, vis.props);
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
  // Selected stage element: violet outline (bar for trusses, ring otherwise).
  const selEl = sceneSel && findElement(vis, sceneSel);
  if (selEl) {
    g.strokeStyle = '#8b5cf6';
    g.lineWidth = 2;
    g.setLineDash([4, 3]);
    if (sceneSel.kind === 'truss') {
      g.beginPath();
      for (const [a0, b0] of trussSegments(selEl as Truss)) { const pa = toScreen(a0.x, a0.y), pb = toScreen(b0.x, b0.y); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); }
      g.stroke();
    } else {
      const at = sceneSel.kind === 'performer' ? performerPos(selEl as Performer) : sceneSel.kind === 'marker' ? markerPos(selEl as StageMarker) : selEl;
      const q = toScreen(at.x, at.y);
      g.beginPath();
      g.arc(q.x, q.y, 14, 0, Math.PI * 2);
      g.stroke();
    }
    g.setLineDash([]);
    g.lineWidth = 1;
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
    f.rings.forEach((c, i) => {
      // LED ring module: drawn around the body, not as a separate beam.
      g.lineWidth = 2;
      g.strokeStyle = c;
      g.beginPath();
      g.arc(p.x, p.y, (f.movable ? 11 : 9) + i * 3, 0, Math.PI * 2);
      g.stroke();
    });
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
}
