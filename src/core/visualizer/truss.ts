import type { Fixture, Truss } from '../model/schemas';

/**
 * Explicit truss geometry in stage coordinates (meters, x stage right, y upstage), shared by the 2D plan, the 3D view
 * and the main process (fixtures follow their truss). Rotation is counter-clockwise seen from above.
 */
export interface P2 { x: number; y: number }

const DEG = Math.PI / 180;
/** Fixtures hang 20 cm under the truss axis (same offset as the implicit trusses of older projects). */
export const HANG_OFFSET = 0.2;
/** Horizontal distance under which a dropped fixture snaps onto a truss. */
export const SNAP_DISTANCE = 0.6;
const CIRCLE_SEGMENTS = 24;

export const hangHeight = (t: Pick<Truss, 'height'>) => Math.max(0, t.height - HANG_OFFSET);

function rotate(p: P2, deg: number): P2 {
  const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** Outline of the truss as straight segments (a circle is approximated by 24 chords). */
export function trussSegments(t: Truss): [P2, P2][] {
  const h = t.length / 2;
  let local: P2[];
  let closed = true;
  if (t.shape === 'line') { local = [{ x: -h, y: 0 }, { x: h, y: 0 }]; closed = false; }
  else if (t.shape === 'square') local = [{ x: -h, y: -h }, { x: h, y: -h }, { x: h, y: h }, { x: -h, y: h }];
  else local = Array.from({ length: CIRCLE_SEGMENTS }, (_, i) => ({ x: h * Math.cos((2 * Math.PI * i) / CIRCLE_SEGMENTS), y: h * Math.sin((2 * Math.PI * i) / CIRCLE_SEGMENTS) }));
  const pts = local.map((p) => { const r = rotate(p, t.rotation); return { x: t.x + r.x, y: t.y + r.y }; });
  const segs: [P2, P2][] = [];
  for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) segs.push([pts[i]!, pts[(i + 1) % pts.length]!]);
  return segs;
}

/** Support points (towers or motors): ends of a straight truss, corners of a square, 4 points on a circle. */
export function trussSupports(t: Truss): P2[] {
  const h = t.length / 2;
  const local = t.shape === 'line' ? [{ x: -h, y: 0 }, { x: h, y: 0 }]
    : t.shape === 'square' ? [{ x: -h, y: -h }, { x: h, y: -h }, { x: h, y: h }, { x: -h, y: h }]
      : [{ x: h, y: 0 }, { x: 0, y: h }, { x: -h, y: 0 }, { x: 0, y: -h }];
  return local.map((p) => { const r = rotate(p, t.rotation); return { x: t.x + r.x, y: t.y + r.y }; });
}

/** Closest point of the truss outline to (x, y), with its horizontal distance. */
export function nearestOnTruss(t: Truss, x: number, y: number): P2 & { dist: number } {
  let best = { x: t.x, y: t.y, dist: Infinity };
  for (const [a, b] of trussSegments(t)) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const k = len2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
    const p = { x: a.x + dx * k, y: a.y + dy * k };
    const dist = Math.hypot(p.x - x, p.y - y);
    if (dist < best.dist) best = { ...p, dist };
  }
  return best;
}

/** Truss to hang a fixture dropped at (x, y), with the snapped position and hanging height, or null when none is close. */
export function snapToTrusses(trusses: readonly Truss[], x: number, y: number, max = SNAP_DISTANCE): { truss: Truss; x: number; y: number; height: number } | null {
  let best: { truss: Truss; x: number; y: number; height: number; dist: number } | null = null;
  for (const t of trusses) {
    const p = nearestOnTruss(t, x, y);
    if (p.dist <= max && (!best || p.dist < best.dist)) best = { truss: t, x: p.x, y: p.y, height: hangHeight(t), dist: p.dist };
  }
  if (!best) return null;
  const round = (v: number) => Math.round(v * 100) / 100;
  return { truss: best.truss, x: round(best.x), y: round(best.y), height: round(best.height) };
}

type Placement = Pick<Fixture, 'position' | 'height' | 'rotation'>;

/** New placement of a fixture hung on `before` once the truss became `after`: same spot on the truss, same orientation relative to it. */
export function followTruss(before: Truss, after: Truss, f: Placement): Placement {
  const local = rotate({ x: f.position.x - before.x, y: f.position.y - before.y }, -before.rotation);
  const p = rotate(local, after.rotation);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const round = (v: number) => Math.round(v * 1000) / 1000;
  let rotation = f.rotation + after.rotation - before.rotation;
  while (rotation > 360) rotation -= 360;
  while (rotation < -360) rotation += 360;
  return {
    position: { x: round(clamp(after.x + p.x, -100, 100)), y: round(clamp(after.y + p.y, -100, 100)) },
    height: round(clamp(f.height + after.height - before.height, 0, 50)),
    rotation: round(rotation),
  };
}
