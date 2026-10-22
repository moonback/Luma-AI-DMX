/**
 * Connector model of assembled truss pieces (docs/roadmap/truss-builder.md, phase 1). Stage frame in meters: x stage
 * right, y upstage, z up. A piece declares its connectors in its own frame; a new piece is attached connector to
 * connector, facing the parent one, then rolled around the shared axis by steps of the truss system.
 */
export interface V3 { x: number; y: number; z: number }
/** Unit quaternion. */
export interface Quat { x: number; y: number; z: number; w: number }
export interface Pose { pos: V3; quat: Quat }

export type TrussSystem = 'duo' | 'trio' | 'quatro';
export type Gender = 'm' | 'f' | 'h';

export interface ConnectorDef {
  id: string;
  pos: V3;
  /** Outgoing direction (unit). */
  dir: V3;
  /** Roll reference, orthogonal to `dir` (unit). */
  up: V3;
  system: TrussSystem;
  gender: Gender;
}

export interface CatalogPiece {
  id: string;
  label: string;
  system: TrussSystem;
  category: 'straight' | 'corner' | 'junction' | 'circle' | 'base' | 'special';
  length: number;
  weightKg: number;
  connectors: ConnectorDef[];
}

export interface PlacedPiece {
  id: string;
  piece: CatalogPiece;
  pose: Pose;
  links: { connector: string; to: string; toConnector: string }[];
}

export const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };

const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const neg = (a: V3): V3 => ({ x: -a.x, y: -a.y, z: -a.z });
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a: V3): V3 => { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };

export function quatMul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export function axisAngle(axis: V3, angle: number): Quat {
  const n = norm(axis), s = Math.sin(angle / 2);
  return { x: n.x * s, y: n.y * s, z: n.z * s, w: Math.cos(angle / 2) };
}

export function rotate(q: Quat, v: V3): V3 {
  // v' = v + 2w(u×v) + 2u×(u×v), u = vector part of q.
  const u = { x: q.x, y: q.y, z: q.z };
  const t = cross(u, v);
  const t2 = { x: 2 * t.x, y: 2 * t.y, z: 2 * t.z };
  return add(add(v, { x: q.w * t2.x, y: q.w * t2.y, z: q.w * t2.z }), cross(u, t2));
}

/** Shortest rotation taking unit vector `a` onto unit vector `b` (half turn around any orthogonal axis when opposite). */
function fromUnitVectors(a: V3, b: V3): Quat {
  const d = dot(a, b);
  if (d < -1 + 1e-9) {
    const axis = Math.abs(a.x) < 0.9 ? cross(a, { x: 1, y: 0, z: 0 }) : cross(a, { x: 0, y: 1, z: 0 });
    return axisAngle(axis, Math.PI);
  }
  const c = cross(a, b);
  const q = { x: c.x, y: c.y, z: c.z, w: 1 + d };
  const l = Math.hypot(q.x, q.y, q.z, q.w);
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}

/** Roll step around a connection: a 2-chord truss fits every half turn, 3 chords every third, 4 chords every quarter. */
export const rollStep = (s: TrussSystem) => (s === 'duo' ? Math.PI : s === 'trio' ? (2 * Math.PI) / 3 : Math.PI / 2);

/** Two connectors fit when they share the system and are male/female (hybrid fits anything). */
export const compatible = (a: ConnectorDef, b: ConnectorDef) =>
  a.system === b.system && (a.gender === 'h' || b.gender === 'h' || a.gender !== b.gender);

/** Connector in stage coordinates for a piece at `pose`. */
export function worldConnector(pose: Pose, c: ConnectorDef): ConnectorDef {
  return { ...c, pos: add(pose.pos, rotate(pose.quat, c.pos)), dir: rotate(pose.quat, c.dir), up: rotate(pose.quat, c.up) };
}

/**
 * Pose of `piece` hung by its connector `connIdx` on `parent` (already in stage coordinates): both connectors meet,
 * face each other, and the piece is rolled by `roll` steps of its system. Throws when the connectors don't fit.
 */
export function attach(parent: ConnectorDef, piece: CatalogPiece, connIdx: number, roll = 0): Pose {
  const c = piece.connectors[connIdx];
  if (!c) throw new Error(`Connecteur ${connIdx} absent de ${piece.id}`);
  if (!compatible(parent, c)) throw new Error(`${piece.id} : connecteur incompatible (${c.system}/${c.gender} sur ${parent.system}/${parent.gender})`);
  const axis = neg(parent.dir);
  const q1 = fromUnitVectors(norm(c.dir), axis);
  // Twist around the axis so the rolled parent `up` matches the piece `up`.
  const target = rotate(axisAngle(axis, roll * rollStep(c.system)), parent.up);
  const up1 = rotate(q1, c.up);
  const twist = Math.atan2(dot(cross(up1, target), axis), dot(up1, target));
  const quat = quatMul(axisAngle(axis, twist), q1);
  return { pos: sub(parent.pos, rotate(quat, c.pos)), quat };
}

/** Connectors of the structure not linked to another piece, in stage coordinates, with their owner. */
export function freeConnectors(structure: readonly PlacedPiece[]): { pieceId: string; connector: ConnectorDef }[] {
  const used = new Set<string>();
  for (const p of structure) for (const l of p.links) { used.add(`${p.id}:${l.connector}`); used.add(`${l.to}:${l.toConnector}`); }
  return structure.flatMap((p) => p.piece.connectors
    .filter((c) => !used.has(`${p.id}:${c.id}`))
    .map((c) => ({ pieceId: p.id, connector: worldConnector(p.pose, c) })));
}
