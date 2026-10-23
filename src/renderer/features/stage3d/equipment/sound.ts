import * as THREE from 'three';
import type { StageProp } from '../../../../core/model/schemas';
import { boolParam, lineArrayAngles, lineArrayModules, numParam, strParam } from '../../../../core/visualizer/equipment';
import { Builder, withLod, type Mats } from './kit';

/* Sound equipment: line arrays (modules, splay, bumper, rigging), subs, front-of-house and column speakers, speakers
   on stands, audio racks. Front of every cabinet towards local +z. */

const DEG = Math.PI / 180;
/** Height of the bumper frame above the top module. */
const BUMPER_H = 0.1;

/** Round driver facing the audience (+z), centred at (x, y) on the front face z. */
function driver(b: Builder, dia: number, x: number, y: number, z: number, m: Mats): void {
  const cone = b.cyl(dia, 0.03, x, y, z, m.grille, 24);
  cone.rotation.x = Math.PI / 2;
  const cap = b.cyl(dia * 0.28, 0.035, x, y, z + 0.005, m.dark, 16);
  cap.rotation.x = Math.PI / 2;
}

/**
 * Line array: `modules` cabinets hung from a bumper (or ground-stacked on it), each one angled from the previous by
 * the splay (per-module list or uniform), the whole array tilted by the bumper site angle. Flown arrays show their
 * rigging points: two chains up to a motor.
 */
export function lineArray(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  const b = new Builder(g);
  const n = lineArrayModules(p);
  const bumper = boolParam(p, 'bumper');
  const flown = boolParam(p, 'flown');
  const angles = lineArrayAngles(p);
  const { width: w, depth: d } = p;
  const mh = Math.max(0.05, (p.height - (bumper ? BUMPER_H : 0)) / n);
  // Pivot travels along the back-to-front centre line, down (flown) or up (stacked) one module at a time.
  const dir = flown ? -1 : 1;
  let angle = numParam(p, 'tilt') * DEG;
  const pivot = new THREE.Vector3(0, flown ? p.height - (bumper ? BUMPER_H : 0) : bumper ? BUMPER_H : 0, 0);
  if (bumper) {
    b.box(w * 1.06, BUMPER_H * 0.6, d * 1.15, 0, flown ? p.height - BUMPER_H / 2 : BUMPER_H / 2, 0, m.metal);
    for (const s of [-1, 1]) b.box(0.04, BUMPER_H, d * 1.15, (s * w * 1.06) / 2, flown ? p.height - BUMPER_H / 2 : BUMPER_H / 2, 0, m.metal);
  }
  for (let i = 0; i < n; i++) {
    const mod = new THREE.Group();
    mod.position.copy(pivot);
    mod.rotation.x = angle * (flown ? 1 : -1);
    const mb = new Builder(mod);
    const cy = (dir * mh) / 2;
    // Trapezoid look: cabinet slightly narrower at the back, grille on the front, waveguide slit in the middle.
    mb.box(w, mh * 0.96, d, 0, cy, 0, m.body);
    mb.box(w * 0.92, mh * 0.82, 0.012, 0, cy, d / 2 + 0.006, m.grille);
    mb.box(w * 0.08, mh * 0.7, 0.014, 0, cy, d / 2 + 0.01, m.dark);
    for (const s of [-1, 1]) mb.box(0.03, mh * 0.5, d * 0.6, (s * (w + 0.03)) / 2, cy, -d * 0.1, m.metal); // rigging links
    g.add(mod);
    // Next module hinges on the bottom (top when stacked) of this one.
    pivot.add(new THREE.Vector3(0, dir * mh, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), mod.rotation.x));
    angle += (angles[i] ?? 0) * DEG;
  }
  if (flown) {
    // Rigging: two chains from the bumper up to the hoist point, 1 m above.
    const top = p.height;
    for (const s of [-1, 1]) b.rod(new THREE.Vector3((s * w) / 3, top, 0), new THREE.Vector3(0, top + 0.9, 0), 0.015, m.metal, 6);
    b.box(0.22, 0.3, 0.22, 0, top + 1.05, 0, m.dark);
  }
  return withLod(g, w, p.height, d, m.body);
}

export function sub(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  const b = new Builder(g);
  const { width: w, height: h, depth: d } = p;
  b.block(w, h, d, 0, 0, 0, m.body);
  b.box(w * 0.94, h * 0.9, 0.01, 0, h / 2, d / 2 + 0.005, m.grille);
  const drivers = strParam(p, 'drivers');
  const dia = Math.min(h * 0.82, drivers === '1x21' ? 0.53 : 0.46);
  if (drivers === '2x18') for (const s of [-1, 1]) driver(b, dia, (s * w) / 4, h / 2, d / 2 + 0.012, m);
  else driver(b, dia, 0, h / 2, d / 2 + 0.012, m);
  for (const s of [-1, 1]) b.box(0.12, 0.03, 0.04, (s * w) / 2.6, 0.015, d / 2 - 0.02, m.dark); // skids
  return g;
}

/** Front-of-house speaker: box cabinet with horn and woofer, or a slim column of small drivers on a base. */
export function speaker(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  const b = new Builder(g);
  const { width: w, height: h, depth: d } = p;
  if (strParam(p, 'style') === 'column') {
    b.block(w * 1.6, 0.03, d * 1.4, 0, 0, 0, m.dark);
    b.block(0.035, h * 0.35, 0.035, 0, 0, 0, m.metal);
    b.block(w, h * 0.65, d, 0, h * 0.35, 0, m.body);
    const k = Math.max(3, Math.round((h * 0.6) / 0.11));
    for (let i = 0; i < k; i++) driver(b, Math.min(w * 0.7, 0.09), 0, h * 0.37 + ((i + 0.5) * h * 0.6) / k, d / 2 + 0.006, m);
    return g;
  }
  b.block(w, h, d, 0, 0, 0, m.body);
  b.box(w * 0.88, h * 0.92, 0.01, 0, h / 2, d / 2 + 0.005, m.grille);
  driver(b, Math.min(w * 0.8, h * 0.5), 0, h * 0.32, d / 2 + 0.012, m);
  b.box(w * 0.5, h * 0.16, 0.05, 0, h * 0.78, d / 2 - 0.01, m.dark); // horn
  return g;
}

export function paStand(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  const b = new Builder(g);
  const { width: w, height: h, depth: d } = p;
  const box = Math.min(0.7, h * 0.35);
  const pole = h - box;
  b.tripod(Math.max(0.35, w), pole * 0.45, 0, 0, m.metal);
  b.cyl(0.035, pole, 0, pole / 2, 0, m.metal, 10);
  b.block(w, box, d * 0.85, 0, pole, 0, m.body);
  b.box(w * 0.86, box * 0.9, 0.01, 0, pole + box / 2, (d * 0.85) / 2 + 0.005, m.grille);
  driver(b, w * 0.7, 0, pole + box * 0.38, (d * 0.85) / 2 + 0.012, m);
  return g;
}

export function audioRack(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  const b = new Builder(g);
  const { width: w, height: h, depth: d } = p;
  const wheels = boolParam(p, 'wheels');
  const base = wheels ? 0.1 : 0;
  b.block(w, h - base, d, 0, base, 0, m.dark);
  const units = Math.round(numParam(p, 'units', 12));
  const u = (h - base - 0.08) / units;
  for (let i = 0; i < units; i++) {
    const y = base + 0.04 + (i + 0.5) * u;
    b.box(w * 0.86, u * 0.86, 0.01, 0, y, d / 2 + 0.005, i % 3 ? m.body : m.metal);
    b.box(0.015, 0.015, 0.01, w * 0.36, y, d / 2 + 0.012, m.glow(i % 4 ? 0x22c55e : 0x3b82f6, 2));
  }
  if (wheels) for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) b.cyl(0.08, 0.025, (x * w) / 2.4, 0.04, (z * d) / 2.4, m.grille, 12).rotation.z = Math.PI / 2;
  return g;
}
