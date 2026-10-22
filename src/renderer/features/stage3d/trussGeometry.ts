import * as THREE from 'three';
import type { Truss } from '../../../core/model/schemas';
import type { CatalogPiece, TrussSystem, V3 } from '../../../core/visualizer/connectors';
import { assemblyFreeConnectors, assemblyOf } from '../../../core/visualizer/assembly';

/**
 * Truss meshes: the lattice section shared by every truss, and the assembly pieces placed by their 3D pose
 * (docs/roadmap/truss-builder.md, phase 4). Stage (x right, y upstage, z up) maps to three as (x, z, -y).
 */
const W = 0.29;
const TRI = W / Math.sqrt(3);
/** Chords in the (y, z) section plane; z is the roll reference of the connectors. */
const PROFILE: Record<TrussSystem, [number, number][]> = {
  quatro: [[W / 2, W / 2], [-W / 2, W / 2], [-W / 2, -W / 2], [W / 2, -W / 2]],
  trio: [[0, TRI], [-W / 2, -TRI / 2], [W / 2, -TRI / 2]],
  duo: [[0, W / 2], [0, -W / 2]],
};

/** Straight lattice section along x around its centre: chords plus a zig-zag on each face (cheap line segments). */
export function boxTruss(length: number, mat: THREE.Material, lattice: THREE.Material, system: TrussSystem = 'quatro'): THREE.Group {
  const g = new THREE.Group();
  const chords = PROFILE[system];
  const chord = new THREE.CylinderGeometry(0.024, 0.024, length, 8);
  chord.rotateZ(Math.PI / 2);
  for (const [y, z] of chords) {
    const m = new THREE.Mesh(chord, mat);
    m.position.set(0, y, z);
    g.add(m);
  }
  const faces = system === 'duo' ? [[0, 1]] : chords.map((_, i) => [i, (i + 1) % chords.length]);
  const pts: number[] = [];
  const steps = Math.max(2, Math.round(length / 0.5));
  for (let i = 0; i < steps; i++) {
    const x0 = -length / 2 + (i * length) / steps, x1 = -length / 2 + ((i + 1) * length) / steps;
    for (const [a, b] of faces) {
      const [from, to] = i % 2 ? [chords[a!]!, chords[b!]!] : [chords[b!]!, chords[a!]!];
      pts.push(x0, from[0], from[1], x1, to[0], to[1]);
    }
  }
  const lines = new THREE.BufferGeometry();
  lines.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(lines, lattice));
  return g;
}

const X = new THREE.Vector3(1, 0, 0);
const vec = (v: V3) => new THREE.Vector3(v.x, v.y, v.z);
/** Section of `length` from `from` along `dir`, in the piece frame. */
function arm(from: THREE.Vector3, dir: THREE.Vector3, length: number, mat: THREE.Material, lattice: THREE.Material, system: TrussSystem): THREE.Group {
  const d = dir.clone().normalize();
  const s = boxTruss(length, mat, lattice, system);
  s.quaternion.setFromUnitVectors(X, d);
  s.position.copy(from).addScaledVector(d, length / 2);
  return s;
}

/**
 * Assembly piece: the returned group only carries the position (so the gizmo starts from a zero yaw), an inner group
 * carries the pose orientation and the geometry is built in the piece frame.
 */
export function buildAssembledPiece(pose: NonNullable<Truss['pose']>, piece: CatalogPiece, mat: THREE.Material, lattice: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const { pos, quat } = pose;
  g.position.set(pos.x, pos.z, -pos.y);
  const oriented = new THREE.Group();
  // Same rotation expressed in three axes: the vector part maps like a position.
  oriented.quaternion.set(quat.x, quat.z, -quat.y, quat.w);
  const local = new THREE.Group();
  local.rotation.x = -Math.PI / 2; // piece frame (z up) → three (y up)
  oriented.add(local);
  g.add(oriented);
  const sys = piece.system;
  if (piece.category === 'straight') local.add(boxTruss(piece.length, mat, lattice, sys));
  else if (piece.category === 'corner' || piece.category === 'junction') {
    local.add(new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, W + 0.02, W + 0.02), mat));
    // Arms start at the block face so chords don't poke through it.
    for (const c of piece.connectors) {
      const d = vec(c.dir).normalize();
      local.add(arm(d.clone().multiplyScalar(W / 2), d, Math.max(0.01, vec(c.pos).length() - W / 2), mat, lattice, sys));
    }
  } else if (piece.category === 'circle') {
    // Quarter ring between the two connectors, as chords of the arc.
    const r = Math.hypot(piece.connectors[0]!.pos.x, piece.connectors[0]!.pos.y);
    const n = Math.max(3, Math.round((Math.PI * r) / 2 / 0.5));
    for (let i = 0; i < n; i++) {
      const a0 = (i * Math.PI) / 2 / n, a1 = ((i + 1) * Math.PI) / 2 / n;
      const p0 = new THREE.Vector3(r * Math.cos(a0), r * Math.sin(a0), 0), p1 = new THREE.Vector3(r * Math.cos(a1), r * Math.sin(a1), 0);
      local.add(arm(p0, p1.clone().sub(p0), p0.distanceTo(p1) + 0.02, mat, lattice, sys));
    }
  } else {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(piece.length, piece.length, 0.01), mat);
    plate.position.z = 0.005;
    local.add(plate);
  }
  return g;
}

/** Name of the free-connector markers group (shown with a selected assembly piece). */
export const CONNECTORS_NAME = 'truss-connectors';

/** Orange markers on the free connectors of the assembly holding `id`; each carries `userData.connector` for picking. */
export function connectorMarkers(trusses: readonly Truss[], id: string): THREE.Group {
  const g = new THREE.Group();
  g.name = CONNECTORS_NAME;
  const group = assemblyOf(trusses, id);
  const mat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.6, depthWrite: false });
  const geo = new THREE.SphereGeometry(0.1, 16, 12);
  for (const f of assemblyFreeConnectors(trusses.filter((t) => group.has(t.id)))) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(f.connector.pos.x, f.connector.pos.z, -f.connector.pos.y);
    m.userData.connector = { pieceId: f.pieceId, id: f.connector.id };
    g.add(m);
  }
  return g;
}
