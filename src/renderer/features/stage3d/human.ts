import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * One merged low-poly human silhouette (legs, torso, arms, neck, head), feet at y = 0, facing local +z.
 * Shared by the performers and the audience; `radial` trades roundness for vertices (the crowd draws thousands).
 */
export function humanGeometry(seated: boolean, radial = 12): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const limb = (r: number, len: number, x: number, y: number, z: number, rotX = 0, rotZ = 0) =>
    parts.push(new THREE.CapsuleGeometry(r, len, 2, radial).rotateZ(rotZ).rotateX(rotX).translate(x, y, z));
  // Seated: thighs forward on a 0.45 m seat, shins down; standing: straight legs.
  const hip = seated ? 0.5 : 0.88;
  for (const x of [-0.1, 0.1]) {
    if (seated) { limb(0.075, 0.32, x, hip, 0.2, Math.PI / 2); limb(0.065, 0.36, x, 0.25, 0.4); }
    else limb(0.075, 0.68, x, 0.46, 0);
  }
  // Torso: a flattened capsule, so the body reads front/side instead of as a cylinder.
  const torso = hip + 0.3;
  parts.push(new THREE.CapsuleGeometry(0.17, 0.34, 2, radial).scale(1, 1, 0.62).translate(0, torso, 0));
  for (const s of [-1, 1]) limb(0.05, 0.5, s * 0.24, torso - 0.02, seated ? 0.08 : 0, seated ? -0.35 : 0, s * 0.08);
  parts.push(new THREE.CylinderGeometry(0.05, 0.055, 0.1, radial).translate(0, torso + 0.36, 0));
  parts.push(new THREE.SphereGeometry(0.11, radial, Math.max(6, radial / 2)).scale(1, 1.12, 1).translate(0, torso + 0.5, 0.01));
  const geo = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return geo;
}
