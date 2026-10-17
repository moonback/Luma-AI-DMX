import * as THREE from 'three';
import type { VisualFixture } from '../../../core/visualizer/model';
import type { StageGeometry } from '../../../core/visualizer/beam';
import type { Project, StageMarker } from '../../../core/model/schemas';
import { labelSprite } from './rig';

/**
 * Stage set: deck, back wall (cyclorama catching the light), wings, audience floor, and box trusses built from
 * the rig (one truss per row of hanging fixtures, with ground-support towers at both ends).
 */
export function stageGeometry(vis: Project['visualizer'], fixtures: readonly VisualFixture[]): StageGeometry {
  const top = Math.max(0, ...fixtures.map((f) => f.height));
  return {
    width: vis.stageWidth,
    depth: vis.stageDepth,
    wallHeight: Math.max(6, Math.ceil(top + 2)),
    wall: vis.cyclo && vis.shape !== 'arena',
    thrust: vis.shape === 'thrust' ? vis.thrust : null,
    arena: vis.shape === 'arena',
  };
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

export function buildEnvironment(stage: StageGeometry, fixtures: readonly VisualFixture[], markers: readonly StageMarker[] = []): THREE.Group {
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

  if (stage.thrust) {
    const { width: tw, depth: td } = stage.thrust;
    const runway = new THREE.Mesh(new THREE.BoxGeometry(tw, 1, td), deckMat);
    runway.position.set(0, -0.5, td / 2);
    env.add(runway);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(tw, td)),
      new THREE.LineBasicMaterial({ color: 0x8b5cf6 }),
    );
    edges.rotation.x = -Math.PI / 2;
    edges.position.set(0, 0.01, td / 2);
    env.add(edges);
  }

  // Audience floor, slightly lower and darker: in front of the stage, or all around in arena.
  const house = new THREE.Mesh(
    stage.arena ? new THREE.PlaneGeometry(W + 20, D + 30) : new THREE.PlaneGeometry(W + 20, 16),
    new THREE.MeshStandardMaterial({ color: 0x0c0e14, roughness: 1 }),
  );
  house.rotation.x = -Math.PI / 2;
  house.position.set(0, -0.001, stage.arena ? -D / 2 : 8);
  env.add(house);

  if (stage.wall !== false && !stage.arena) {
    // Cyclorama: matte light-grey surface so beams hitting it read clearly.
    const cyc = new THREE.Mesh(new THREE.PlaneGeometry(W + 2, H), new THREE.MeshStandardMaterial({ color: 0x23293a, roughness: 0.95 }));
    cyc.position.set(0, H / 2, -D);
    env.add(cyc);
  }
  if (!stage.arena) {
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x0a0b10, roughness: 1, side: THREE.DoubleSide });
    for (const x of [-W / 2 - 0.5, W / 2 + 0.5]) {
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(D, H), wingMat);
      wing.rotation.y = Math.PI / 2;
      wing.position.set(x, H / 2, -D / 2);
      env.add(wing);
    }
  }

  // Stage points: floor disc, thin pole up to the aiming height, name tag.
  const markMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  for (const m of markers) {
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 24), markMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(m.x, 0.012, -m.y);
    env.add(disc);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, Math.max(0.01, m.height), 6), markMat);
    pole.position.set(m.x, m.height / 2, -m.y);
    env.add(pole);
    const tag = labelSprite(m.name);
    tag.position.set(m.x, m.height + 0.25, -m.y);
    env.add(tag);
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

const FOG_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uDensity;
  uniform float uLayer;
  varying vec2 vUv;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    vec2 p = vWorld.xz * 0.35 + vec2(uTime * 0.05, uTime * 0.02) + uLayer * 7.0;
    float n = 0.6 * noise(p) + 0.4 * noise(p * 2.7 - uTime * 0.04);
    // Fade towards the plane borders so the sheet has no visible edge.
    float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x) * smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.82, vUv.y);
    float a = uDensity * smoothstep(0.3, 0.85, n) * edge * (0.28 - uLayer * 0.08);
    gl_FragColor = vec4(vec3(0.42, 0.46, 0.56), a);
  }`;
const FOG_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

/** Low smoke (heavy fog machine): three stacked noise sheets just above the floor. Animate with `setLowFog`. */
export function buildLowFog(stage: StageGeometry): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(stage.width + 6, stage.depth + (stage.thrust?.depth ?? 0) + 6);
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDensity: { value: 0 }, uLayer: { value: i } },
      vertexShader: FOG_VERT,
      fragmentShader: FOG_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0.06 + i * 0.14, (stage.thrust?.depth ?? 0) / 2 - stage.depth / 2);
    mesh.renderOrder = 1;
    g.add(mesh);
  }
  return g;
}

export function setLowFog(g: THREE.Group, time: number, density: number): void {
  g.visible = density > 0.01;
  for (const m of g.children as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[]) {
    m.material.uniforms.uTime!.value = time;
    m.material.uniforms.uDensity!.value = density;
  }
}

export function disposeGroup(g: THREE.Object3D): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    // Sprite labels own their canvas texture.
    if (o instanceof THREE.Sprite) o.material.map?.dispose();
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}
