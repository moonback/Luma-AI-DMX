import { performerSchema, propSchema, screenSchema, stageMarkerSchema, trussSchema, type Performer, type Project, type StageMarker, type StageProp, type StageScreen, type Truss } from '../model/schemas';
import { hangHeight, JUNCTION_ARMS, nearestOnTruss, SNAP_DISTANCE, trussSegments, type P2 } from './truss';
import { EQUIPMENT, sanitizeParams } from './equipment';

/**
 * Scene-element editing shared by the 2D plan, the 3D view and the scene panel: creation at a free spot,
 * duplication, removal, clipboard and automatic hanging of fixtures on trusses. Pure (ids come from `id`).
 */
type Vis = Project['visualizer'];
export type SceneKind = 'marker' | 'truss' | 'performer' | 'screen' | 'prop';
export interface SceneRef { kind: SceneKind; id: string }
/** What a click (or drop) on the stage will create: a scene element (kind + optional library preset) or a fixture of a profile. */
export type PlaceSpec =
  | { kind: SceneKind; label: string; preset?: Record<string, unknown> }
  | { kind: 'fixture'; label: string; profileId: string; mode: string }
  | { kind: 'assembly'; label: string; assembly: string };
export type Element = StageMarker | Truss | Performer | StageScreen | StageProp;

const LIST = { marker: 'markers', truss: 'trusses', performer: 'performers', screen: 'screens', prop: 'props' } as const;
const MAX = { marker: 64, truss: 64, performer: 64, screen: 16, prop: 256 } as const;
const SCHEMA = { marker: stageMarkerSchema, truss: trussSchema, performer: performerSchema, screen: screenSchema, prop: propSchema } as const;
export const SCENE_LABEL: Record<SceneKind, string> = { marker: 'Point', truss: 'Structure', performer: 'Artiste', screen: 'Écran', prop: 'Décor' };

const r2 = (v: number) => Math.round(v * 100) / 100;
const clampPos = (v: number) => Math.max(-100, Math.min(100, v));
const items = (vis: Vis, kind: SceneKind): Element[] => vis[LIST[kind]];

export const canAdd = (vis: Vis, kind: SceneKind) => items(vis, kind).length < MAX[kind];
export const findElement = (vis: Vis, ref: SceneRef): Element | undefined => items(vis, ref.kind).find((x) => x.id === ref.id);

/** First spot near `at` not already used by an element of the same kind: 0, +1, −1, +2, −2… m sideways. */
export function freeSpot(vis: Vis, kind: SceneKind, at: P2): P2 {
  const taken = items(vis, kind);
  for (let i = 0; i < 40; i++) {
    const dx = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2);
    const p = { x: r2(clampPos(at.x + dx)), y: r2(clampPos(at.y)) };
    if (!taken.some((e) => Math.hypot(e.x - p.x, e.y - p.y) < 0.5)) return p;
  }
  return at;
}

/** Default position of a new element when none is given (a sensible depth per kind). */
const defaultSpot = (vis: Vis, kind: SceneKind): P2 => ({ x: 0, y: r2(vis.stageDepth * { marker: 0.5, truss: 0.5, performer: 0.4, screen: 0.9, prop: 0.5 }[kind]) });

/**
 * New element of `kind`, placed at `at` (click / drop) or at the next free default spot. `preset` (a library item)
 * overrides the defaults; its `name` is the base of the generated name.
 */
export function newElement(vis: Vis, kind: SceneKind, id: () => string, at?: P2, preset: Record<string, unknown> = {}): Element {
  const p = at ? { x: r2(clampPos(at.x)), y: r2(clampPos(at.y)) } : freeSpot(vis, kind, defaultSpot(vis, kind));
  const { name: base = SCENE_LABEL[kind], ...over } = preset as { name?: string };
  // Numbered per base name: the first speaker is "Enceinte 1" even after a riser.
  const name = `${base} ${items(vis, kind).filter((e) => e.name.startsWith(`${base} `)).length + 1}`.slice(0, 80);
  const el = (() => {
    switch (kind) {
      case 'marker': return { id: id(), name, ...p, height: 1.7 };
      case 'truss': return { id: id(), name, shape: 'line', ...p, height: 6, length: Math.max(2, vis.stageWidth - 2), rotation: 0, support: 'towers' };
      case 'performer': return { id: id(), name, kind: 'standing', ...p, rotation: 0, markerId: null };
      case 'screen': return { id: id(), name, ...p, elevation: 1.5, width: Math.min(6, vis.stageWidth / 2), height: 3, rotation: 0, source: 'color', color: '#3b82f6', image: null, glow: 0.5 };
      case 'prop': return { id: id(), name, kind: 'riser', ...p, width: 2, depth: 1, height: 0.4, elevation: 0, rotation: 0, color: '#2a2f3a' };
    }
  })();
  const merged: Record<string, unknown> = { ...el, ...over };
  // Set-piece settings are checked against the catalogue of their kind (unknown keys dropped, values clamped).
  if (kind === 'prop') { const params = sanitizeParams(merged.kind as StageProp['kind'], merged.params as Record<string, unknown>); if (Object.keys(params).length) merged.params = params; else delete merged.params; }
  // The schema keeps a malformed preset out of the project.
  return SCHEMA[kind].parse(merged) as Element;
}

/** Visualizer patch that appends `el` to its list. */
export const withElement = (vis: Vis, kind: SceneKind, el: Element): Partial<Vis> => ({ [LIST[kind]]: [...items(vis, kind), el] });

/** Visualizer patch removing an element; performers standing on a removed point stay where it was. */
export function withoutElement(vis: Vis, ref: SceneRef): Partial<Vis> {
  const patch: Partial<Vis> = { [LIST[ref.kind]]: items(vis, ref.kind).filter((x) => x.id !== ref.id) };
  if (ref.kind === 'marker') {
    const m = vis.markers.find((x) => x.id === ref.id);
    if (m) patch.performers = vis.performers.map((pf) => (pf.markerId === m.id ? { ...pf, x: m.x, y: m.y, markerId: null } : pf));
  }
  return patch;
}

/** Copy of an element (new id, "(copie)" name, free spot 1 m aside); a copied performer is freed from its point. */
export function cloneElement(vis: Vis, kind: SceneKind, src: Element, id: () => string): Element {
  const p = freeSpot(vis, kind, { x: src.x + 1, y: src.y });
  const copy = { ...structuredClone(src), id: id(), name: `${src.name} (copie)`.slice(0, 80), ...p };
  return kind === 'performer' ? ({ ...copy, markerId: null } as Performer) : copy;
}

/* ---------- Clipboard (plain text, so it works between projects and windows) ---------- */

const CLIP_PREFIX = 'luma-scene:';
export const serializeElement = (kind: SceneKind, el: Element) => CLIP_PREFIX + JSON.stringify({ kind, el });

/** Parses clipboard text; anything malformed or out of bounds is rejected by the project schemas (trust boundary). */
export function parseElement(text: string): { kind: SceneKind; el: Element } | null {
  if (!text.startsWith(CLIP_PREFIX)) return null;
  try {
    const raw = JSON.parse(text.slice(CLIP_PREFIX.length)) as { kind?: unknown; el?: unknown };
    if (typeof raw.kind !== 'string' || !Object.hasOwn(SCHEMA, raw.kind)) return null;
    const kind = raw.kind as SceneKind;
    const parsed = SCHEMA[kind].safeParse(raw.el);
    return parsed.success ? { kind, el: parsed.data } : null;
  } catch {
    return null;
  }
}

/* ---------- Equip: hang fixtures evenly on the trusses ---------- */

/** Share of a totem in the spread (as many fixtures as 1 m of straight truss), and spacing of stacked fixtures. */
const TOTEM_SHARE = 1, TOTEM_STEP = 0.5;

export type EquipDistributionMode = 'standard' | 'inverted' | 'balanced';

export interface EquipOptions {
  mode?: EquipDistributionMode;
  /** When true, auto-orient each fixture: downstage trusses face the audience (0°), upstage trusses face upstage (180°). */
  autoRotate?: boolean;
  /** Gap to leave free at each end of every straight truss segment (metres, default 0). */
  margin?: number;
}

export interface EquipFixture { id: string; movable: boolean; type?: string }
/** Placement produced by equipTrusses; `rotation` is set only when autoRotate is enabled. */
export interface Placement { id: string; position: P2; height: number; trussId: string; rotation?: number }

const segmentsOf = (t: Truss, margin = 0) => {
  // A totem takes a 1 m share of the fixtures, all on its clamp point.
  if (t.shape === 'totem') { const c = nearestOnTruss(t, t.x, t.y); return [{ a: c, b: c, t, len: TOTEM_SHARE }]; }
  return trussSegments(t).map(([a, b]) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (margin <= 0 || len <= 0) return { a, b, t, len };
    // Trim by margin at each end; cap so the fixture never passes the midpoint.
    const trim = Math.min(margin, len / 2 - 0.01);
    const dx = (b.x - a.x) / len, dy = (b.y - a.y) / len;
    const na = { x: r2(a.x + dx * trim), y: r2(a.y + dy * trim) };
    const nb = { x: r2(b.x - dx * trim), y: r2(b.y - dy * trim) };
    return { a: na, b: nb, t, len: Math.max(0.01, len - 2 * trim) };
  });
};
const lengthOf = (t: Truss, margin = 0) => segmentsOf(t, margin).reduce((s, x) => s + x.len, 0);

/**
 * `n` points on `trusses`: each truss gets a share proportional to its length (largest remainders), spread evenly
 * and centred on it, so every truss has a regular, symmetric pitch. Junction pieces only carry fixtures when they
 * are all there is (they are the joints of the straight trusses).
 */
function spread(trusses: readonly Truss[], n: number, margin: number): { p: P2; t: Truss }[] {
  const plain = trusses.filter((t) => !JUNCTION_ARMS[t.shape]);
  const on = (plain.length ? plain : [...trusses]).sort((a, b) => a.y - b.y || a.x - b.x);
  const lens = on.map((t) => lengthOf(t, margin)), total = lens.reduce((s, x) => s + x, 0);
  const exact = lens.map((l) => (n * l) / total);
  const counts = exact.map(Math.floor);
  const byRemainder = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || lens[b.i]! - lens[a.i]!);
  for (let k = 0; k < n - counts.reduce((s, x) => s + x, 0); k++) counts[byRemainder[k]!.i]!++;
  return on.flatMap((t, i) => spreadOne(t, counts[i]!, margin));
}

/** `n` points evenly spread along the outline of one truss. */
function spreadOne(truss: Truss, n: number, margin: number): { p: P2; t: Truss }[] {
  const segs = segmentsOf(truss, margin);
  const total = segs.reduce((s, x) => s + x.len, 0);
  const out: { p: P2; t: Truss }[] = [];
  for (let i = 0; i < n; i++) {
    let d = ((i + 0.5) * total) / n;
    let seg = segs[segs.length - 1]!;
    for (const s of segs) {
      if (d <= s.len) { seg = s; break; }
      d -= s.len;
    }
    const k = seg.len ? Math.min(1, d / seg.len) : 0;
    out.push({ p: { x: r2(seg.a.x + (seg.b.x - seg.a.x) * k), y: r2(seg.a.y + (seg.b.y - seg.a.y) * k) }, t: seg.t });
  }
  return out;
}

/**
 * Interleaves fixture types along a line: each fixture sits at its rank within its type ((2i+1)/2n, symmetric around
 * the middle), ties break one way on the left half and the other way on the right, so the mix mirrors around the centre.
 */
function mix(fx: readonly EquipFixture[]): EquipFixture[] {
  const kind = (f: EquipFixture) => f.type ?? String(f.movable);
  const ranked = [...new Set(fx.map(kind))].flatMap((ty, t) => {
    const of = fx.filter((f) => kind(f) === ty);
    return of.map((f, i) => ({ f, t, n: 2 * i + 1, d: 2 * of.length }));
  });
  return ranked.sort((a, b) => a.n * b.d - b.n * a.d || (a.t - b.t) * (2 * a.n > a.d ? -1 : 1)).map((x) => x.f);
}

/**
 * Hangs fixtures evenly on the trusses: moving heads on the upstage half of the trusses (back light), the others on
 * the downstage half (front light); with a single truss, or when one family is missing, everything shares all trusses.
 */
export function equipTrusses(
  fixtures: readonly EquipFixture[],
  trusses: readonly Truss[],
  options?: EquipOptions,
): Placement[] {
  const usable = trusses.filter((t) => t.shape === 'totem' || trussSegments(t).length);
  if (!usable.length || !fixtures.length) return [];
  const byDepth = [...usable].sort((a, b) => a.y - b.y);
  const half = Math.ceil(byDepth.length / 2);
  const movers = fixtures.filter((f) => f.movable), fixed = fixtures.filter((f) => !f.movable);
  const mode = options?.mode ?? 'standard';

  let groups: { fx: EquipFixture[]; on: Truss[] }[];
  if (movers.length && fixed.length && byDepth.length > 1 && mode !== 'balanced') {
    if (mode === 'inverted') {
      // Inverted: movers downstage (face / front), fixed upstage (contre / back)
      groups = [{ fx: movers, on: byDepth.slice(0, half) }, { fx: fixed, on: byDepth.slice(half) }];
    } else {
      // Standard: movers upstage (contre / back), fixed downstage (face / front)
      groups = [{ fx: movers, on: byDepth.slice(half) }, { fx: fixed, on: byDepth.slice(0, half) }];
    }
  } else {
    // Single truss, missing family, or balanced: all fixtures share all trusses evenly
    groups = [{ fx: [...fixtures], on: byDepth }];
  }
  const autoRotate = options?.autoRotate ?? false;
  const margin = Math.max(0, options?.margin ?? 0);
  // Median depth used to split front vs back for auto-rotation.
  const sortedY = [...usable].sort((a, b) => a.y - b.y).map((t) => t.y);
  const medianY = sortedY[Math.floor((sortedY.length - 1) / 2)]!;
  const onTotem = new Map<string, number>();
  return groups.flatMap(({ fx, on }) => {
    const pts = spread(on, fx.length, margin), all = mix(fx);
    // Each truss takes its share of the overall mix, itself mixed symmetrically along that truss.
    const order = pts.flatMap((x, i) => {
      if (i && pts[i - 1]!.t === x.t) return [];
      const run = pts.slice(i).findIndex((y) => y.t !== x.t);
      return mix(all.splice(0, run < 0 ? pts.length - i : run));
    });
    return pts.map(({ p, t }, i) => ({ p, t, f: order[i]! }));
  }).map(({ p, t, f }) => {
    // Several fixtures on one totem are stacked downwards from the top, never below 0.5 m.
    const k = t.shape === 'totem' ? onTotem.get(t.id) ?? 0 : 0;
    if (t.shape === 'totem') onTotem.set(t.id, k + 1);
    // Auto-rotation: downstage trusses (y ≤ median) → face audience (0°), upstage (y > median) → face upstage (180°).
    const rotation = autoRotate ? (t.y <= medianY ? 0 : 180) : undefined;
    return { id: f.id, position: p, height: r2(Math.max(Math.min(0.5, hangHeight(t)), hangHeight(t) - k * TOTEM_STEP)), trussId: t.id, ...(rotation !== undefined ? { rotation } : {}) };
  });
}

/** Visualizer patch that changes fields of one element (moves, resizes). */
export const withPatched = (vis: Vis, ref: SceneRef, patch: Partial<Element>): Partial<Vis> =>
  ({ [LIST[ref.kind]]: items(vis, ref.kind).map((x) => (x.id === ref.id ? { ...x, ...patch } : x)) });

/* ---------- Set pieces: snapping under trusses, mirror, alignment ---------- */

/** Gap between the truss axis and the top of a piece hung under it (half the truss section). */
const UNDER_TRUSS = 0.18;

/**
 * Flown equipment (line array, hoist) dropped near a truss: centred under the closest truss point, its top just under
 * the truss (a hoist sits on it). Null when the kind does not hang or no truss is within the snapping distance.
 * A visual placement aid only: it says nothing about loads or rigging safety.
 */
export function snapPropToTruss(p: StageProp, trusses: readonly Truss[], max = SNAP_DISTANCE): { x: number; y: number; elevation: number; truss: Truss } | null {
  if (!EQUIPMENT[p.kind]?.hangable) return null;
  let best: { x: number; y: number; dist: number; truss: Truss } | null = null;
  for (const t of trusses) {
    if (t.shape === 'totem') continue;
    const n = nearestOnTruss(t, p.x, p.y);
    if (n.dist <= max && (!best || n.dist < best.dist)) best = { x: n.x, y: n.y, dist: n.dist, truss: t };
  }
  if (!best) return null;
  const top = p.kind === 'hoist' ? best.truss.height + UNDER_TRUSS : best.truss.height - UNDER_TRUSS - p.height;
  return { x: r2(best.x), y: r2(best.y), elevation: r2(Math.max(0, Math.min(20, top))), truss: best.truss };
}

/** Mirror copy across the stage centre line (jardin ↔ cour): x and rotation flipped, new id and mirrored name. */
export function mirrorProp(p: StageProp, id: () => string): StageProp {
  const swap = (n: string) => (/jardin/i.test(n) ? n.replace(/jardin/i, 'cour') : /cour/i.test(n) ? n.replace(/cour/i, 'jardin') : `${n} (miroir)`);
  return propSchema.parse({ ...structuredClone(p), id: id(), name: swap(p.name).slice(0, 80), x: r2(-p.x), rotation: r2(-p.rotation) });
}

export type AlignMode = 'center' | 'front' | 'back' | 'left' | 'right' | 'floor';

/** Placement patch aligning a set piece on the stage: centre line, stage lip, back, sides, or down on the floor. */
export function alignProp(p: StageProp, vis: Pick<Vis, 'stageWidth' | 'stageDepth'>, mode: AlignMode): Partial<StageProp> {
  // Half extents of the rotated footprint along x and y.
  const a = (p.rotation * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const hx = (p.width * c + p.depth * s) / 2, hy = (p.width * s + p.depth * c) / 2;
  switch (mode) {
    case 'center': return { x: 0 };
    case 'front': return { y: r2(hy) };
    case 'back': return { y: r2(vis.stageDepth - hy) };
    case 'left': return { x: r2(-vis.stageWidth / 2 + hx) };
    case 'right': return { x: r2(vis.stageWidth / 2 - hx) };
    default: return { elevation: 0 };
  }
}
