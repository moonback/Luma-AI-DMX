import * as THREE from 'three';
import type { StageProp } from '../../../../core/model/schemas';
import { boolParam, numParam, strParam } from '../../../../core/visualizer/equipment';
import { Builder, type Mats } from './kit';

/* Rigging accessories, special-effect machines, scenery (backdrops, arches, roof) and stage accessories (DJ booth,
   consoles, flight cases, chairs, barriers, cable ramps). Every piece fills its own width × height × depth box. */

export function trussBase(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  const b = new Builder(g);
  const { width: w, height: h, depth: d } = p;
  b.block(w, Math.min(0.02, h), d, 0, 0, 0, m.metal);
  b.block(0.3, h, 0.3, 0, 0, 0, m.metal);
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) b.cyl(0.05, 0.03, (x * w) / 2.4, 0.015, (z * d) / 2.4, m.dark, 10);
  return g;
}

/** Chain hoist: motor body on the truss with its chain hanging up to the roof (`chain` metres). */
export function hoist(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  const b = new Builder(g);
  const { width: w, height: h, depth: d } = p;
  b.block(w, h * 0.7, d, 0, 0, 0, m.body);
  b.block(w * 0.5, h * 0.3, d * 0.5, 0, h * 0.7, 0, m.dark);
  b.box(0.04, 0.12, 0.04, 0, -0.06, 0, m.metal); // hook
  const chain = numParam(p, 'chain', 3);
  b.cyl(0.018, chain, 0, h + chain / 2, 0, m.metal, 6);
  return g;
}

/** Roof canopy over a ground support: pitched, arched or flat, with its fabric sides. */
export function canopy(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  const { width: w, height: h, depth: d } = p;
  const style = strParam(p, 'style');
  const cloth = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.9, side: THREE.DoubleSide, emissive: m.body.emissive });
  let geo: THREE.BufferGeometry;
  if (style === 'flat') geo = new THREE.BoxGeometry(w, Math.min(0.2, h), d).translate(0, Math.min(0.1, h / 2), 0);
  else {
    // Profile across the width extruded along the depth.
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    if (style === 'arched') s.quadraticCurveTo(0, h * 2, w / 2, 0);
    else { s.lineTo(0, h); s.lineTo(w / 2, 0); }
    s.lineTo(w / 2, 0.05);
    if (style === 'arched') s.quadraticCurveTo(0, h * 2 + 0.05, -w / 2, 0.05);
    else { s.lineTo(0, h + 0.05); s.lineTo(-w / 2, 0.05); }
    geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 12 }).translate(0, 0, -d / 2);
  }
  g.add(new THREE.Mesh(geo, cloth));
  // Front valance with the rigging-free look of a festival roof.
  new Builder(g).box(w, 0.6, 0.02, 0, -0.3, d / 2, cloth);
  return g;
}

/** Fog, haze or low-fog machine: housing with its nozzle towards the audience; a low-fog unit has its tank on top. */
export function fogMachine(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  const b = new Builder(g);
  const { width: w, height: h, depth: d } = p;
  const style = strParam(p, 'style');
  b.block(w, h * 0.85, d, 0, 0.03, 0, m.body);
  for (const s of [-1, 1]) b.block(0.03, 0.03, d, (s * w) / 2.3, 0, 0, m.dark);
  const nozzle = b.cyl(style === 'low' ? h * 0.35 : 0.06, 0.08, 0, h * 0.45, d / 2 + 0.04, m.metal, 14);
  nozzle.rotation.x = Math.PI / 2;
  b.box(w * 0.3, h * 0.25, 0.01, -w * 0.25, h * 0.5, d / 2 + 0.005, m.glow(style === 'haze' ? 0x38bdf8 : 0x22c55e, 0.8));
  if (style === 'low') b.block(w * 0.5, h * 0.25, d * 0.6, 0, h * 0.88, 0, m.light);
  return g;
}

export function sparkMachine(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  const b = new Builder(g);
  const { width: w, height: h, depth: d } = p;
  b.block(w, h * 0.9, d, 0, 0, 0, m.body);
  b.cyl(w * 0.35, h * 0.1, 0, h * 0.95, 0, m.metal, 16);
  b.box(w * 0.2, 0.02, 0.01, 0, h * 0.3, d / 2 + 0.005, m.glow(0xf59e0b));
  return g;
}

export function co2Jet(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  const b = new Builder(g);
  const { width: w, height: h } = p;
  b.block(w * 0.9, 0.06, w * 0.9, 0, 0, 0, m.dark);
  b.cyl(0.12, h * 0.7, 0, h * 0.4, 0, m.body, 14);
  const nozzle = b.cyl(0.05, 0.15, 0, h * 0.82, 0.04, m.metal, 10);
  nozzle.rotation.x = 0.35;
  return g;
}

/** Backdrop: plain panel on feet, stretched canvas in a frame, or an empty decorative frame. */
export function backdrop(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  const b = new Builder(g);
  const { width: w, height: h, depth: d } = p;
  const style = strParam(p, 'style');
  const t = Math.min(0.08, d);
  if (style !== 'canvas') {
    if (style === 'panel') b.block(w, h, t, 0, 0, 0, m.body);
    else for (const [bw, bh, x, y] of [[w, t, 0, 0], [w, t, 0, h - t], [t, h, -w / 2 + t / 2, 0], [t, h, w / 2 - t / 2, 0]] as const) b.block(bw, bh, t, x, y, 0, m.body);
  } else {
    for (const [bw, bh, x, y] of [[w, 0.05, 0, 0], [w, 0.05, 0, h - 0.05], [0.05, h, -w / 2 + 0.025, 0], [0.05, h, w / 2 - 0.025, 0]] as const) b.block(bw, bh, 0.05, x, y, 0, m.metal);
    b.block(w - 0.1, h - 0.1, 0.01, 0, 0.05, 0, m.body);
  }
  // Stage braces (feet) behind.
  for (const s of [-1, 1]) b.rod(new THREE.Vector3((s * w) / 3, 0, -Math.max(0.5, d)), new THREE.Vector3((s * w) / 3, h * 0.5, -t / 2), 0.03, m.dark, 6);
  return g;
}

/** Decorative arch (rounded or square opening) with an optional LED edge. */
export function arch(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  const { width: w, height: h, depth: d } = p;
  const t = Math.min(numParam(p, 'thickness', 0.3), w / 3, h / 3);
  const outer = new THREE.Shape();
  outer.moveTo(-w / 2, 0); outer.lineTo(w / 2, 0);
  const round = strParam(p, 'style') === 'round';
  const legH = round ? Math.max(0, h - w / 2) : h;
  outer.lineTo(w / 2, legH);
  if (round) outer.absarc(0, legH, w / 2, 0, Math.PI, false); else outer.lineTo(-w / 2, h);
  outer.lineTo(-w / 2, 0);
  const iw = w / 2 - t;
  const hole = new THREE.Path();
  hole.moveTo(-iw, 0);
  if (round) { hole.lineTo(-iw, legH); hole.absarc(0, legH, iw, Math.PI, 0, true); } else { hole.lineTo(-iw, h - t); hole.lineTo(iw, h - t); }
  hole.lineTo(iw, 0); hole.lineTo(-iw, 0);
  outer.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(outer, { depth: d, bevelEnabled: false, curveSegments: 24 }).translate(0, 0, -d / 2);
  g.add(new THREE.Mesh(geo, m.body));
  if (boolParam(p, 'leds')) {
    const pts = hole.getPoints(48).map((v) => new THREE.Vector3(v.x, v.y, d / 2 + 0.01));
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xa78bfa })));
  }
  return g;
}

/** DJ booth: front panel (LED face optional), table top, two decks and a mixer on the DJ side. */
export function djBooth(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  const b = new Builder(g);
  const { width: w, height: h, depth: d } = p;
  b.block(w, h - 0.05, 0.05, 0, 0, d / 2 - 0.025, m.body);
  for (const s of [-1, 1]) b.block(0.05, h - 0.05, d, (s * (w - 0.05)) / 2, 0, 0, m.body);
  if (boolParam(p, 'led')) b.box(w * 0.9, (h - 0.05) * 0.6, 0.01, 0, h * 0.5, d / 2 + 0.006, m.glow(p.color === '#111318' ? 0x7c3aed : p.color, 0.9));
  b.block(w, 0.05, d, 0, h - 0.05, 0, m.dark);
  if (boolParam(p, 'decks')) {
    for (const s of [-1, 1]) {
      b.block(0.45, 0.06, 0.36, s * 0.5, h, -0.05, m.dark);
      b.cyl(0.3, 0.012, s * 0.5, h + 0.066, -0.05, m.grille, 24);
    }
    b.block(0.32, 0.08, 0.38, 0, h, -0.05, m.metal);
  }
  return g;
}

/** Sound or lighting desk: console with faders (or playback buttons) and screens, on its table. */
export function consoleDesk(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  const b = new Builder(g);
  const { width: w, height: h, depth: d } = p;
  const desk = boolParam(p, 'desk');
  const top = desk ? Math.max(0.2, h - 0.15) : 0;
  if (desk) {
    b.block(w, 0.04, d, 0, top - 0.04, 0, m.dark);
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) b.block(0.04, top - 0.04, 0.04, (x * (w - 0.08)) / 2, 0, (z * (d - 0.08)) / 2, m.metal);
  }
  const surface = new THREE.Group();
  surface.position.set(0, top, -d * 0.05);
  surface.rotation.x = 0.12;
  const s = new Builder(surface);
  s.block(w * 0.92, 0.08, d * 0.75, 0, 0, 0, m.body);
  const light = strParam(p, 'style') === 'light';
  const n = Math.max(4, Math.round((w * 0.8) / 0.05));
  for (let i = 0; i < n; i++) s.block(0.012, 0.012, 0.09, -w * 0.4 + ((i + 0.5) * w * 0.8) / n, 0.08, -d * 0.2, light && i % 2 ? m.glow(0xf59e0b, 0.6) : m.light);
  g.add(surface);
  const screen = b.box(light ? w * 0.4 : w * 0.25, 0.22, 0.02, light ? 0 : w * 0.25, top + 0.25, d * 0.3, m.glow(0x1d4ed8, 0.5));
  screen.rotation.x = -0.25;
  return g;
}

export function flightCase(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  const b = new Builder(g);
  const { width: w, height: h, depth: d } = p;
  const base = boolParam(p, 'wheels') ? 0.1 : 0;
  b.block(w, h - base, d, 0, base, 0, m.body);
  // Aluminium edges and corner balls.
  for (const y of [base, h - 0.02]) for (const z of [-d / 2, d / 2]) b.box(w + 0.01, 0.025, 0.025, 0, y + 0.0125, z, m.metal);
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) b.box(0.025, h - base, 0.025, x, base + (h - base) / 2, z, m.metal);
  for (const s of [-1, 1]) b.box(0.15, 0.03, 0.02, (s * w) / 4, base + (h - base) * 0.6, d / 2 + 0.012, m.chrome); // latches
  if (base) for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) b.cyl(0.08, 0.03, (x * w) / 2.5, 0.04, (z * d) / 2.5, m.grille, 12).rotation.z = Math.PI / 2;
  return g;
}

export function chair(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  const b = new Builder(g);
  const { width: w, height: h, depth: d } = p;
  const stool = strParam(p, 'style') === 'stool';
  const seat = stool ? h - 0.04 : Math.min(0.47, h * 0.52);
  if (stool) b.cyl(w, 0.04, 0, seat + 0.02, 0, m.body, 20);
  else b.block(w, 0.04, d, 0, seat, 0, m.body);
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) b.rod(new THREE.Vector3((x * w) / 2.3, 0, (z * d) / 2.3), new THREE.Vector3((x * w) / 2.8, seat, (z * d) / 2.8), 0.025, m.metal, 6);
  if (!stool) b.block(w, h - seat - 0.04, 0.04, 0, seat + 0.04, -d / 2 + 0.02, m.body); // back rest on the upstage side
  return g;
}

/** Crowd-control barrier: crash barrier (sloped front plate, base plate on the audience side) or a Vauban rail. */
export function barrier(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  const b = new Builder(g);
  const { width: w, height: h, depth: d } = p;
  if (strParam(p, 'style') === 'vauban') {
    for (const y of [0.15, h - 0.03]) b.box(w, 0.03, 0.03, 0, y, 0, m.metal);
    const n = Math.max(2, Math.round(w / 0.12));
    for (let i = 0; i <= n; i++) b.box(0.015, h - 0.18, 0.015, -w / 2 + (i * w) / n, (h + 0.12) / 2, 0, m.metal);
    for (const s of [-1, 1]) b.block(0.04, 0.03, Math.max(0.5, d), (s * w) / 2, 0, 0, m.metal);
    return g;
  }
  b.block(w, 0.02, d, 0, 0, 0, m.body); // base plate (audience stands on it, +z)
  const plate = b.box(w, h, 0.02, 0, h / 2, -d * 0.1, m.body);
  plate.rotation.x = -0.12;
  for (const s of [-1, 1]) b.rod(new THREE.Vector3((s * w) / 2.2, 0, -d / 2), new THREE.Vector3((s * w) / 2.2, h * 0.9, -d * 0.1), 0.04, m.metal, 6);
  b.box(w, 0.06, 0.12, 0, h, -d * 0.1, m.metal);
  return g;
}

/** Cable ramp: low trapezoid with yellow lids over its channels. */
export function cable(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  const b = new Builder(g);
  const { width: w, height: h, depth: d } = p;
  b.block(w, h * 0.7, d, 0, 0, 0, m.dark);
  const n = Math.round(numParam(p, 'channels', 3));
  for (let i = 0; i < n; i++) b.block(w, h * 0.3, (d * 0.6) / n * 0.9, 0, h * 0.7, -d * 0.3 + ((i + 0.5) * d * 0.6) / n, m.body);
  return g;
}
