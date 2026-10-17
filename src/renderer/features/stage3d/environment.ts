import * as THREE from 'three';
import type { VisualFixture } from '../../../core/visualizer/model';
import type { StageGeometry } from '../../../core/visualizer/beam';

/**
 * Stage set: deck, back wall (cyclorama catching the light), wings, audience floor, and box trusses built from
 * the rig (one truss per row of hanging fixtures, with ground-support towers at both ends).
 */
export function stageGeometry(width: number, depth: number, fixtures: readonly VisualFixture[]): StageGeometry {
  const top = Math.max(0, ...fixtures.map((f) => f.height));
  return { width, depth, wallHeight: Math.max(6, Math.ceil(top + 2)) };
}

function boxTruss(length: number, mat: THREE.Material, lattice: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const w = 0.29;
  const chord = new THREE.CylinderGeometry(0.024, 0.024, length, 8);
  chord.rotateZ(Math.PI / 2);
  for (const [y, z] of [[w / 2, w / 2], [w / 2, -w / 2], [-w / 2, w / 2], [-w / 2, -w / 2]] as const) {
    const m = new THREE.Mesh(chord, mat);
    m.position.set(0, y, z);
    g.add(m);
  }
  // Zig-zag lattice on the four faces (cheap line segments).
  const pts: number[] = [];
  const steps = Math.max(2, Math.round(length / 0.5));
  for (let i = 0; i < steps; i++) {
    const x0 = -length / 2 + (i * length) / steps, x1 = -length / 2 + ((i + 1) * length) / steps;
    const zag = (a: [number, number], b: [number, number]) => pts.push(x0, a[0], a[1], x1, b[0], b[1]);
    const h = w / 2;
    if (i % 2) { zag([h, h], [-h, h]); zag([h, -h], [-h, -h]); zag([h, h], [h, -h]); zag([-h, h], [-h, -h]); }
    else { zag([-h, h], [h, h]); zag([-h, -h], [h, -h]); zag([h, -h], [h, h]); zag([-h, -h], [-h, h]); }
  }
  const lines = new THREE.BufferGeometry();
  lines.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(lines, lattice));
  return g;
}

export function buildEnvironment(stage: StageGeometry, fixtures: readonly VisualFixture[]): THREE.Group {
  const env = new THREE.Group();
  const { width: W, depth: D, wallHeight: H } = stage;

  const deckMat = new THREE.MeshStandardMaterial({ color: 0x14171f, roughness: 0.85, metalness: 0.05 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W, 1, D), deckMat);
  deck.position.set(0, -0.5, -D / 2);
  env.add(deck);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: 0x8b5cf6 }));
  lip.position.set(0, 0.01, 0);
  env.add(lip);
  const grid = new THREE.GridHelper(Math.max(W, D), Math.max(W, D), 0x232a3a, 0x1a2030);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.5;
  grid.position.set(0, 0.002, -D / 2);
  grid.scale.set(W / Math.max(W, D), 1, D / Math.max(W, D));
  env.add(grid);

  // Audience floor in front of the stage, slightly lower and darker.
  const house = new THREE.Mesh(new THREE.PlaneGeometry(W + 20, 16), new THREE.MeshStandardMaterial({ color: 0x0c0e14, roughness: 1 }));
  house.rotation.x = -Math.PI / 2;
  house.position.set(0, -0.001, 8);
  env.add(house);

  // Cyclorama: matte light-grey surface so beams hitting it read clearly.
  const cyc = new THREE.Mesh(new THREE.PlaneGeometry(W + 2, H), new THREE.MeshStandardMaterial({ color: 0x23293a, roughness: 0.95 }));
  cyc.position.set(0, H / 2, -D);
  env.add(cyc);
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x0a0b10, roughness: 1, side: THREE.DoubleSide });
  for (const x of [-W / 2 - 0.5, W / 2 + 0.5]) {
    const wing = new THREE.Mesh(new THREE.PlaneGeometry(D, H), wingMat);
    wing.rotation.y = Math.PI / 2;
    wing.position.set(x, H / 2, -D / 2);
    env.add(wing);
  }

  // Trusses: one per row (height, depth) of hanging fixtures.
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x9aa3b5, metalness: 0.85, roughness: 0.3 });
  const lattice = new THREE.LineBasicMaterial({ color: 0x6b7385 });
  const rows = new Map<string, VisualFixture[]>();
  for (const f of fixtures) {
    if (f.mount !== 'hanging') continue;
    const k = `${Math.round(f.height * 2) / 2}|${Math.round(f.y)}`;
    rows.set(k, [...(rows.get(k) ?? []), f]);
  }
  for (const [k, list] of rows) {
    const [h, y] = k.split('|').map(Number) as [number, number];
    const minX = Math.min(...list.map((f) => f.x)) - 0.8, maxX = Math.max(...list.map((f) => f.x)) + 0.8;
    const len = Math.max(2, maxX - minX);
    const t = boxTruss(len, trussMat, lattice);
    t.position.set((minX + maxX) / 2, h + 0.2, -y);
    env.add(t);
    for (const x of [minX, maxX]) {
      const tower = boxTruss(h + 0.35, trussMat, lattice);
      tower.rotation.z = Math.PI / 2;
      tower.position.set(x, (h + 0.35) / 2, -y);
      env.add(tower);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.7), trussMat);
      foot.position.set(x, 0.015, -y);
      env.add(foot);
    }
  }
  return env;
}

export function disposeGroup(g: THREE.Object3D): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}
