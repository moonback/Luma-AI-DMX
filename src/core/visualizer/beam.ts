import type { VisualFixture } from './model';

/**
 * Pure beam geometry shared by the 3D view and the tests. World axes: x = stage left/right, y = up,
 * z = towards the audience. The stage deck spans z ∈ [-depth, 0]; the back wall (cyclorama) stands at z = -depth.
 */
export interface Vec3 { x: number; y: number; z: number }
export interface StageGeometry { width: number; depth: number; wallHeight: number }

const DEG = Math.PI / 180;
/** Fixed aim of non-moving fixtures, in degrees from their mounting axis (floor fixtures wash the back wall). */
export const FIXED_AIM = { hanging: 35, floor: -20 } as const;

type Aimable = Pick<VisualFixture, 'movable' | 'panDeg' | 'tiltDeg' | 'rotation' | 'mount'>;

/** Angles driving the 3D rig: ψ around the vertical axis, φ away from the mounting axis (down when hanging, up on the floor). */
export function aimAngles(f: Aimable): { psi: number; phi: number } {
  return {
    psi: (f.rotation + (f.movable ? f.panDeg : 0)) * DEG,
    phi: (f.movable ? f.tiltDeg : FIXED_AIM[f.mount]) * DEG,
  };
}

/** Unit beam direction for the aim angles (consistent with the rig: yoke.rotation.y = ψ, head.rotation.x = ∓φ). */
export function beamDirection(f: Aimable): Vec3 {
  const { psi, phi } = aimAngles(f);
  const vertical = f.mount === 'hanging' ? -Math.cos(phi) : Math.cos(phi);
  return { x: Math.sin(phi) * Math.sin(psi), y: vertical, z: Math.sin(phi) * Math.cos(psi) };
}

/** Rotates a direction around the vertical axis (used to fan out prism facets). */
export function rotateY(d: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: d.x * c + d.z * s, y: d.y, z: -d.x * s + d.z * c };
}

export interface BeamHit {
  surface: 'floor' | 'wall';
  point: Vec3;
  normal: Vec3;
  distance: number;
}

/** First surface hit by the beam axis: the floor (deck + audience area) or the back wall. */
export function beamHit(origin: Vec3, dir: Vec3, stage: StageGeometry): BeamHit | null {
  const hits: BeamHit[] = [];
  if (dir.y < -1e-3) {
    const t = -origin.y / dir.y;
    const p = { x: origin.x + dir.x * t, y: 0, z: origin.z + dir.z * t };
    if (t > 0.05 && Math.abs(p.x) <= stage.width / 2 + 10 && p.z >= -stage.depth && p.z <= 15) hits.push({ surface: 'floor', point: p, normal: { x: 0, y: 1, z: 0 }, distance: t });
  }
  if (dir.z < -1e-3) {
    const t = (-stage.depth - origin.z) / dir.z;
    const p = { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: -stage.depth };
    if (t > 0.05 && p.y >= 0 && p.y <= stage.wallHeight && Math.abs(p.x) <= stage.width / 2 + 2) hits.push({ surface: 'wall', point: p, normal: { x: 0, y: 0, z: 1 }, distance: t });
  }
  hits.sort((a, b) => a.distance - b.distance);
  return hits[0] ?? null;
}

/** Light pool on the hit surface: circle radius from the beam angle, stretched by the incidence angle. */
export function poolShape(hit: BeamHit, dir: Vec3, beamAngleDeg: number): { radius: number; stretch: number; falloff: number } {
  const radius = hit.distance * Math.tan((beamAngleDeg / 2) * DEG);
  const cosInc = Math.abs(dir.x * hit.normal.x + dir.y * hit.normal.y + dir.z * hit.normal.z);
  return {
    radius,
    stretch: 1 / Math.max(0.25, cosInc),
    // Distance and incidence dimming so far / grazing pools look softer (visual cue only, not photometry).
    falloff: Math.min(1, 6 / (6 + hit.distance * hit.distance * 0.15)) * Math.max(0.3, cosInc),
  };
}

/** Strobe flash state at time t (s): short flashes at `hz`, always on when not strobing. */
export function flickerOn(t: number, hz: number): boolean {
  if (hz <= 0) return true;
  const ph = t * hz;
  return ph - Math.floor(ph) < 0.3;
}

/** Visual length of the beam: up to the first surface, capped. */
export function beamLength(hit: BeamHit | null, cap = 30): number {
  return Math.min(cap, hit ? hit.distance : cap);
}
