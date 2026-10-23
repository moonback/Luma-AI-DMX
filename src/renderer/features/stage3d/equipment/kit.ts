import * as THREE from 'three';

/*
 * Building blocks of the procedural equipment models: unit geometries shared by every piece (cached once, scaled per
 * mesh, flagged `userData.shared` so disposing a set never frees them), per-piece materials (the selection tints them),
 * and a two-level LOD so detailed instruments cost a single box when seen from far away.
 */

const SHARED = new Map<string, THREE.BufferGeometry>();
/** Unit geometry built once; meshes scale it. */
export function shared(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = SHARED.get(key);
  if (!g) { g = make(); g.userData.shared = true; SHARED.set(key, g); }
  return g;
}
export const UNIT_BOX = () => shared('box', () => new THREE.BoxGeometry(1, 1, 1));
/** Unit cylinder (diameter 1, height 1), `seg` sides. */
export const UNIT_CYL = (seg = 20) => shared(`cyl${seg}`, () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg));
export const UNIT_SPHERE = () => shared('sphere', () => new THREE.SphereGeometry(0.5, 16, 10));
/** Unit torus ring (diameter 1, tube 0.04) lying in the xz plane. */
export const UNIT_RING = () => shared('ring', () => new THREE.TorusGeometry(0.5, 0.04, 6, 28).rotateX(Math.PI / 2));

/** Frees the cached unit geometries (3D view unmounted). */
export function disposeShared(): void {
  for (const g of SHARED.values()) g.dispose();
  SHARED.clear();
}

export const SELECTED_EMISSIVE = 0x3b1f8a;

/** Materials of one piece: its own colour plus the common finishes, all tinted when selected. */
export interface Mats {
  body: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  grille: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  light: THREE.MeshStandardMaterial;
  glow: (color: THREE.ColorRepresentation, intensity?: number) => THREE.MeshStandardMaterial;
}

export function materials(color: string, selected: boolean): Mats {
  const emissive = selected ? SELECTED_EMISSIVE : 0x000000;
  const m = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ emissive, ...p });
  return {
    body: m({ color, roughness: 0.6, metalness: 0.15 }),
    dark: m({ color: 0x1a1c21, roughness: 0.85, metalness: 0.1 }),
    metal: m({ color: 0x9aa3b5, roughness: 0.35, metalness: 0.85 }),
    chrome: m({ color: 0xd9dee7, roughness: 0.15, metalness: 1 }),
    grille: m({ color: 0x0c0d10, roughness: 0.95, metalness: 0.2 }),
    wood: m({ color: 0x8b5a2b, roughness: 0.55, metalness: 0.05 }),
    light: m({ color: 0xe5e7eb, roughness: 0.7, metalness: 0.05 }),
    glow: (c, intensity = 1.2) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: intensity, roughness: 0.4 }),
  };
}

/** Adds meshes of unit geometries to a group, in metres, in the piece frame (y up, front towards +z). */
export class Builder {
  constructor(readonly g: THREE.Object3D) {}
  /** Box of size w × h × d centred at (x, y, z). */
  box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh {
    return this.put(UNIT_BOX(), mat, x, y, z, w, h, d);
  }
  /** Box resting on y (bottom face at y). */
  block(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh {
    return this.box(w, h, d, x, y + h / 2, z, mat);
  }
  /** Vertical cylinder of diameter `dia` and height `h`, centred at (x, y, z). */
  cyl(dia: number, h: number, x: number, y: number, z: number, mat: THREE.Material, seg = 20): THREE.Mesh {
    return this.put(UNIT_CYL(seg), mat, x, y, z, dia, h, dia);
  }
  /** Cylinder from point a to point b. */
  rod(a: THREE.Vector3, b: THREE.Vector3, dia: number, mat: THREE.Material, seg = 8): THREE.Mesh {
    const len = a.distanceTo(b);
    const mesh = this.put(UNIT_CYL(seg), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, dia, Math.max(1e-3, len), dia);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  }
  sphere(dia: number, x: number, y: number, z: number, mat: THREE.Material, sy = 1): THREE.Mesh {
    return this.put(UNIT_SPHERE(), mat, x, y, z, dia, dia * sy, dia);
  }
  /** Horizontal ring (e.g. a drum hoop), diameter `dia`. */
  ring(dia: number, x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh {
    return this.put(UNIT_RING(), mat, x, y, z, dia, dia, dia);
  }
  /** Tripod: three legs from the floor (radius r) up to a hub at height h. */
  tripod(r: number, h: number, x: number, z: number, mat: THREE.Material): void {
    for (let i = 0; i < 3; i++) {
      const a = (i * 2 * Math.PI) / 3 + Math.PI / 6;
      this.rod(new THREE.Vector3(x + Math.cos(a) * r, 0, z + Math.sin(a) * r), new THREE.Vector3(x, h, z), 0.022, mat);
    }
  }
  add(o: THREE.Object3D): THREE.Object3D { this.g.add(o); return o; }
  private put(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    this.g.add(mesh);
    return mesh;
  }
}

/** Distance (m) beyond which a detailed piece is drawn as its simple outline. */
export const LOD_DISTANCE = 28;

/** Detailed model near the camera, a body-coloured box of the footprint far away. */
export function withLod(detailed: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material): THREE.LOD {
  const lod = new THREE.LOD();
  const far = new THREE.Group();
  new Builder(far).block(w, h, d, 0, 0, 0, mat);
  lod.addLevel(detailed, 0);
  lod.addLevel(far, LOD_DISTANCE);
  return lod;
}
