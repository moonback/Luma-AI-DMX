import * as THREE from 'three';
import type { StageGeometry } from '../../../core/visualizer/beam';
import { humanGeometry } from './human';

/**
 * Audience: one InstancedMesh of low-poly silhouettes on the house floor (one draw call), hopping on the beat with
 * the music energy, swaying when no audio is playing. Visual aid only.
 */

const MAX_PEOPLE = 2500;
/** Free space kept around the deck and the thrust (barrier, pit). */
const PIT = 1.5;
/** People closer than this to a low camera are hidden so the view never ends up inside a head. */
const CAMERA_CLEARANCE = 1.5;

export interface CrowdSpot { x: number; z: number; scale: number; phase: number }
export interface SeatedSpot extends CrowdSpot { height: number }

const HAS_GRANDSTANDS = (stage: StageGeometry) => !stage.arena && stage.width >= 16 && stage.depth >= 12;

/** Eight deterministic seating rows, matching the stepped grandstands built by environment.ts. */
export function seatedCrowdSpots(stage: StageGeometry): SeatedSpot[] {
  if (!HAS_GRANDSTANDS(stage)) return [];
  const rnd = mulberry32(31415);
  const rows = 8;
  const x0 = -stage.width / 2 - 5;
  const x1 = stage.width / 2 + 5;
  const spacing = 0.82;
  const out: SeatedSpot[] = [];
  for (let row = 0; row < rows; row++) {
    const z = 10.5 + row * 0.92 - 0.12;
    const height = 0.35 + row * 0.34;
    for (let x = x0 + 0.35; x <= x1 - 0.2; x += spacing) {
      out.push({ x: x + (rnd() - 0.5) * 0.12, z: z + (rnd() - 0.5) * 0.08, height, scale: 0.82 + rnd() * 0.12, phase: rnd() });
    }
  }
  return out;
}

/** Deterministic PRNG: the crowd keeps its layout between rebuilds. */
function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** World positions (x, z) of the audience: in front of the stage, or all around in arena; never on the deck or thrust. */
export function crowdSpots(stage: StageGeometry): CrowdSpot[] {
  const { width: W, depth: D } = stage;
  const area = stage.arena
    ? { x0: -W / 2 - 9, x1: W / 2 + 9, z0: -D - 9, z1: 9 }
    : { x0: -W / 2 - 8, x1: W / 2 + 8, z0: PIT, z1: HAS_GRANDSTANDS(stage) ? 9.6 : 14 };
  const spacing = Math.max(0.8, Math.sqrt(((area.x1 - area.x0) * (area.z1 - area.z0)) / MAX_PEOPLE));
  const onStage = (x: number, z: number) =>
    (Math.abs(x) < W / 2 + PIT && z > -D - PIT && z < PIT) ||
    (!!stage.thrust && Math.abs(x) < stage.thrust.width / 2 + PIT && z < stage.thrust.depth + PIT);
  const rnd = mulberry32(42);
  const out: CrowdSpot[] = [];
  for (let z = area.z0; z <= area.z1; z += spacing) {
    for (let x = area.x0; x <= area.x1; x += spacing) {
      const px = x + (rnd() - 0.5) * spacing * 0.6, pz = z + (rnd() - 0.5) * spacing * 0.6;
      const scale = 0.9 + rnd() * 0.2, phase = rnd();
      if (!onStage(px, pz) && out.length < MAX_PEOPLE) out.push({ x: px, z: pz, scale, phase });
    }
  }
  return out;
}

export interface Crowd {
  mesh: THREE.InstancedMesh;
  spots: CrowdSpot[];
  seatedMesh: THREE.InstancedMesh;
  seatedSpots: SeatedSpot[];
  energy: number;
}

export function buildCrowd(stage: StageGeometry): Crowd {
  const spots = crowdSpots(stage);
  const mesh = new THREE.InstancedMesh(humanGeometry(false, 6), new THREE.MeshStandardMaterial({ roughness: 0.9 }), Math.max(1, spots.length));
  mesh.count = spots.length;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false; // instances move: the base geometry's bounds do not cover them
  const rnd = mulberry32(7);
  const c = new THREE.Color();
  // Dark clothes with a little variety, so beams read on them without the crowd stealing the show.
  spots.forEach((_, i) => mesh.setColorAt(i, c.setHSL(rnd(), 0.1 + rnd() * 0.15, 0.12 + rnd() * 0.12, THREE.SRGBColorSpace)));

  const seatedSpots = seatedCrowdSpots(stage);
  const seatedMesh = new THREE.InstancedMesh(humanGeometry(true, 8), new THREE.MeshStandardMaterial({ roughness: 0.92 }), Math.max(1, seatedSpots.length));
  seatedMesh.count = seatedSpots.length;
  seatedMesh.receiveShadow = true;
  seatedMesh.frustumCulled = false;
  const seatedRnd = mulberry32(19);
  seatedSpots.forEach((_, i) => seatedMesh.setColorAt(i, c.setHSL(seatedRnd(), 0.12 + seatedRnd() * 0.16, 0.12 + seatedRnd() * 0.1, THREE.SRGBColorSpace)));
  seatedMesh.visible = seatedSpots.length > 0;
  return { mesh, spots, seatedMesh, seatedSpots, energy: 0 };
}

/** The part of the runtime audio status the crowd follows (undefined before the first status). */
export type CrowdAudio = { active: boolean; energy: number; bpm: number | null } | undefined;

/** Hops on the beat, higher with the music energy; gentle sway with no audio. */
export function updateCrowd(c: Crowd, time: number, audio: CrowdAudio, camera: THREE.Vector3): void {
  const target = audio?.active ? Math.min(1, audio.energy * 1.5) : 0;
  c.energy += (target - c.energy) * 0.08; // smoothed: the runtime status arrives a few times per second
  const beats = (time * ((audio?.active && audio.bpm) || 120)) / 60;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  c.spots.forEach((o, i) => {
    const hidden = camera.y < 2.2 && Math.hypot(o.x - camera.x, o.z - camera.z) < CAMERA_CLEARANCE;
    // A small phase spread per person: the crowd is together on the beat without moving as one block.
    const hop = Math.abs(Math.sin(Math.PI * (beats + o.phase * 0.15))) * (0.03 + c.energy * 0.32);
    const sway = Math.sin(time * 1.3 + o.phase * 6.3) * (0.06 - c.energy * 0.04);
    p.set(o.x, hop, o.z);
    q.setFromAxisAngle(up, Math.PI + sway + o.phase * 0.6 - 0.3); // facing the stage, a little turned
    s.setScalar(hidden ? 0 : o.scale);
    c.mesh.setMatrixAt(i, m.compose(p, q, s));
  });
  c.mesh.instanceMatrix.needsUpdate = true;

  // Seated spectators remain on their tier; only a restrained shoulder sway follows the music.
  const seatedMatrix = new THREE.Matrix4(), seatedQ = new THREE.Quaternion(), seatedP = new THREE.Vector3(), seatedS = new THREE.Vector3();
  c.seatedSpots.forEach((o, i) => {
    const hidden = camera.y < 2.2 && Math.hypot(o.x - camera.x, o.z - camera.z) < CAMERA_CLEARANCE;
    const sway = Math.sin(time * 0.85 + o.phase * 6.3) * 0.035;
    seatedP.set(o.x, o.height, o.z);
    seatedQ.setFromAxisAngle(up, Math.PI + sway + o.phase * 0.12 - 0.06);
    seatedS.setScalar(hidden ? 0 : o.scale);
    c.seatedMesh.setMatrixAt(i, seatedMatrix.compose(seatedP, seatedQ, seatedS));
  });
  c.seatedMesh.instanceMatrix.needsUpdate = true;
}

export function disposeCrowd(c: Crowd): void {
  c.mesh.geometry.dispose();
  (c.mesh.material as THREE.Material).dispose();
  c.mesh.dispose();
  c.seatedMesh.geometry.dispose();
  (c.seatedMesh.material as THREE.Material).dispose();
  c.seatedMesh.dispose();
}
