import type { Truss } from '../model/schemas';
import { attach, axisAngle, freeConnectors, quatMul, rotate, worldConnector, type CatalogPiece, type ConnectorDef, type PlacedPiece, type Pose, type V3 } from './connectors';
import { catalogPiece } from './trussCatalog';

/**
 * Assembly operations on `visualizer.trusses` (docs/roadmap/truss-builder.md, phase 3). Pieces carrying a `catalogId`
 * and a `pose` are built connector to connector; each returns the new truss list, applied through `project.update`
 * so the scene undo / redo keeps working.
 */
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const roundPose = (p: Pose): Pose => ({
  pos: { x: r3(p.pos.x), y: r3(p.pos.y), z: r3(p.pos.z) },
  // Quaternion kept at 1e-6: rounding it harder would skew long chains.
  quat: { x: Math.round(p.quat.x * 1e6) / 1e6, y: Math.round(p.quat.y * 1e6) / 1e6, z: Math.round(p.quat.z * 1e6) / 1e6, w: Math.round(p.quat.w * 1e6) / 1e6 },
});

/** Flat fields of the plan view: centre, axis height, yaw of the piece's x axis; a vertical straight is a totem. */
function flatFields(piece: CatalogPiece, pose: Pose): Pick<Truss, 'shape' | 'x' | 'y' | 'height' | 'length' | 'rotation'> {
  const axis = rotate(pose.quat, { x: 1, y: 0, z: 0 });
  const vertical = piece.category === 'straight' && Math.abs(axis.z) > 0.9;
  const shape: Truss['shape'] = vertical ? 'totem' : piece.category === 'corner' ? 'corner' : piece.category === 'junction' ? (piece.connectors.length > 3 ? 'cross' : 'tee') : 'line';
  const top = vertical ? pose.pos.z + piece.length / 2 : pose.pos.z;
  // Heading: a vertical piece's x axis points up, so its z axis (horizontal then) gives a stable yaw.
  const heading = vertical ? rotate(pose.quat, { x: 0, y: 0, z: 1 }) : axis;
  return {
    shape,
    x: r3(clamp(pose.pos.x, -100, 100)),
    y: r3(clamp(pose.pos.y, -100, 100)),
    // Schema floors: a piece lying on the floor still shows in the plan; the pose stays exact.
    height: r3(clamp(top, 0.5, 30)),
    length: r3(clamp(piece.length, 0.5, 60)),
    rotation: r3((Math.atan2(heading.y, heading.x) * 180) / Math.PI),
  };
}

function toTruss(id: string, name: string, piece: CatalogPiece, pose: Pose, links: NonNullable<Truss['links']>): Truss {
  const p = roundPose(pose);
  return { id, name, ...flatFields(piece, p), support: 'none', catalogId: piece.id, pose: p, links };
}

const pieceOf = (id: string) => {
  const p = catalogPiece(id);
  if (!p) throw new Error(`Pièce inconnue : ${id}`);
  return p;
};

/** Assembly pieces of the scene as placed pieces (parametric trusses are ignored). */
export function placedPieces(trusses: readonly Truss[]): PlacedPiece[] {
  return trusses.flatMap((t) => {
    const piece = t.catalogId ? catalogPiece(t.catalogId) : undefined;
    return piece && t.pose ? [{ id: t.id, piece, pose: t.pose, links: t.links ?? [] }] : [];
  });
}

/** Free connectors of the assembly, in stage coordinates. */
export const assemblyFreeConnectors = (trusses: readonly Truss[]) => freeConnectors(placedPieces(trusses));

/**
 * First piece of a structure: `at` is the stage point (z = floor height of the piece origin), `vertical` stands a
 * straight upright (its connector `a` at the bottom), `yaw` turns it around the vertical in degrees.
 */
export function startPiece(trusses: readonly Truss[], catalogId: string, id: string, name: string, at: V3, opts: { vertical?: boolean; yaw?: number } = {}): Truss[] {
  const piece = pieceOf(catalogId);
  const yaw = axisAngle({ x: 0, y: 0, z: 1 }, ((opts.yaw ?? 0) * Math.PI) / 180);
  // Upright: local x (the straight's axis) turned onto z, so the piece rises from `at`.
  const quat = opts.vertical ? quatMul(yaw, axisAngle({ x: 0, y: -1, z: 0 }, Math.PI / 2)) : yaw;
  const lift = opts.vertical && piece.category === 'straight' ? piece.length / 2 : 0;
  const pose: Pose = { pos: { x: at.x, y: at.y, z: at.z + lift }, quat };
  return [...trusses, toTruss(id, name, piece, pose, [])];
}

/**
 * Hangs `catalogId` by its connector `connIdx` on connector `parentConnector` of piece `parentId`, rolled by `roll`
 * steps. "Rotate" is `roll + 1`, "flip" is the next `connIdx`. Throws on an unknown or already used connector.
 */
export function attachPiece(trusses: readonly Truss[], parentId: string, parentConnector: string, catalogId: string, id: string, name: string, connIdx = 0, roll = 0): Truss[] {
  const parent = placedPieces(trusses).find((p) => p.id === parentId);
  if (!parent) throw new Error('Pièce parente introuvable ou non assemblable');
  const free = assemblyFreeConnectors(trusses).find((f) => f.pieceId === parentId && f.connector.id === parentConnector);
  if (!free) throw new Error(`Connecteur ${parentConnector} déjà utilisé ou absent`);
  const piece = pieceOf(catalogId);
  const pose = attach(free.connector, piece, connIdx, roll);
  return [...trusses, toTruss(id, name, piece, pose, [{ connector: piece.connectors[connIdx]!.id, to: parentId, toConnector: parentConnector }])];
}

/** Free connector a new piece hangs on. */
export interface Anchor { pieceId: string; connector: string }
/** Builder choice: piece, connector it hangs by, roll steps (a yaw of 90° each for a first piece), repeat count. */
export interface ChainSpec { catalogId: string; connIdx: number; roll: number; count: number; vertical?: boolean }

/**
 * Adds `count` copies of a piece, each hung on the far end of the previous one (the first on `anchor`, or standing at
 * `start` when the structure is new). Returns the new list and the connector where the next piece would go.
 */
export function chainPieces(trusses: readonly Truss[], anchor: Anchor | null, spec: ChainSpec, ids: readonly string[], start: V3): { trusses: Truss[]; next: Anchor | null } {
  const piece = pieceOf(spec.catalogId);
  const n = piece.connectors.length;
  let list = [...trusses];
  let at = anchor;
  for (let i = 0; i < spec.count; i++) {
    const id = ids[i];
    if (!id) throw new Error('Identifiant manquant');
    const by = at ? spec.connIdx % n : 0;
    list = at
      ? attachPiece(list, at.pieceId, at.connector, spec.catalogId, id, piece.label, by, spec.roll)
      : startPiece(list, spec.catalogId, id, piece.label, start, { vertical: spec.vertical, yaw: spec.roll * 90 });
    const far = piece.connectors.find((_, k) => k !== by);
    at = far ? { pieceId: id, connector: far.id } : null;
    if (!at) break; // a base plate ends the chain
  }
  return { trusses: list, next: at };
}

/** Removes a piece and the links pointing to it (the rest stays where it is). */
export function removePiece(trusses: readonly Truss[], id: string): Truss[] {
  return trusses.filter((t) => t.id !== id).map((t) => (t.links?.some((l) => l.to === id) ? { ...t, links: t.links.filter((l) => l.to !== id) } : t));
}

/** Ids of the pieces connected to `id` through links (the piece included). */
export function assemblyOf(trusses: readonly Truss[], id: string): Set<string> {
  const seen = new Set([id]);
  const todo = [id];
  while (todo.length) {
    const cur = todo.pop()!;
    for (const t of trusses) {
      const linked = t.id === cur ? (t.links ?? []).map((l) => l.to) : t.links?.some((l) => l.to === cur) ? [t.id] : [];
      for (const n of linked) if (!seen.has(n)) { seen.add(n); todo.push(n); }
    }
  }
  return seen;
}

/**
 * Moves the whole assembly holding `id` as one rigid block: shifted by (dx, dy, dz) and turned by `yaw` degrees around
 * the vertical through that piece. The gizmo drags one piece; its neighbours must follow or the links would break.
 */
export function moveAssembly(trusses: readonly Truss[], id: string, d: { dx: number; dy: number; dz: number; yaw: number }): Truss[] {
  const pivot = trusses.find((t) => t.id === id)?.pose?.pos;
  if (!pivot) return [...trusses];
  const group = assemblyOf(trusses, id);
  const turn = axisAngle({ x: 0, y: 0, z: 1 }, (d.yaw * Math.PI) / 180);
  return trusses.map((t) => {
    const piece = t.catalogId ? catalogPiece(t.catalogId) : undefined;
    if (!group.has(t.id) || !piece || !t.pose) return t;
    const r = rotate(turn, { x: t.pose.pos.x - pivot.x, y: t.pose.pos.y - pivot.y, z: 0 });
    const pose: Pose = { pos: { x: pivot.x + r.x + d.dx, y: pivot.y + r.y + d.dy, z: t.pose.pos.z + d.dz }, quat: quatMul(turn, t.pose.quat) };
    return { ...toTruss(t.id, t.name, piece, pose, t.links ?? []), support: t.support };
  });
}

/** Connector of an assembly piece in stage coordinates (for the builder's preview). */
export function pieceConnector(t: Truss, connectorId: string): ConnectorDef | undefined {
  const piece = t.catalogId ? catalogPiece(t.catalogId) : undefined;
  const c = piece?.connectors.find((x) => x.id === connectorId);
  return c && t.pose ? worldConnector(t.pose, c) : undefined;
}

/** Bill of materials: pieces grouped by catalogue reference, with quantities and indicative weights. */
export function billOfMaterials(trusses: readonly Truss[]): { total: number; weightKg: number; lines: { id: string; label: string; count: number; weightKg: number }[] } {
  const lines = new Map<string, { id: string; label: string; count: number; weightKg: number }>();
  for (const p of placedPieces(trusses)) {
    const l = lines.get(p.piece.id) ?? { id: p.piece.id, label: p.piece.label, count: 0, weightKg: 0 };
    l.count++;
    l.weightKg = Math.round((l.weightKg + p.piece.weightKg) * 10) / 10;
    lines.set(p.piece.id, l);
  }
  const list = [...lines.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  return { total: list.reduce((s, l) => s + l.count, 0), weightKg: Math.round(list.reduce((s, l) => s + l.weightKg, 0) * 10) / 10, lines: list };
}
