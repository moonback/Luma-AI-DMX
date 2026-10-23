import * as THREE from 'three';
import type { StageProp } from '../../../../core/model/schemas';
import { boolParam, numParam, strParam } from '../../../../core/visualizer/equipment';
import { Builder, withLod, type Mats } from './kit';

/* Instruments and backline, modelled at a nominal size then stretched to the piece's own width × height × depth, so
   each one keeps its look when resized. The musician's side is local -z (upstage), the audience +z. */

/** Model built at nominal size (nw × nh × nd) fitted to the piece footprint. */
function fitted(p: StageProp, nw: number, nh: number, nd: number, build: (b: Builder) => void): THREE.Group {
  const inner = new THREE.Group();
  build(new Builder(inner));
  inner.scale.set(p.width / nw, p.height / nh, p.depth / nd);
  const g = new THREE.Group();
  g.add(inner);
  return g;
}

/** Drum shell lying with its heads along z (bass drum) or standing (snare, toms), `tilt` towards the drummer. */
function drum(b: Builder, dia: number, depth: number, x: number, y: number, z: number, m: Mats, lying = false, tilt = 0): void {
  const shell = new THREE.Group();
  shell.position.set(x, y, z);
  shell.rotation.x = lying ? Math.PI / 2 : -tilt;
  const s = new Builder(shell);
  s.cyl(dia, depth, 0, 0, 0, m.body, 24);
  s.cyl(dia * 0.97, depth + 0.006, 0, 0, 0, m.light, 24);
  s.ring(dia * 1.01, 0, depth / 2, 0, m.chrome);
  s.ring(dia * 1.01, 0, -depth / 2, 0, m.chrome);
  b.add(shell);
}

function cymbalOn(b: Builder, dia: number, x: number, y: number, z: number, m: Mats, tilt = 0.18): void {
  b.tripod(0.25, 0.45, x, z, m.chrome);
  b.rod(new THREE.Vector3(x, 0.4, z), new THREE.Vector3(x, y, z), 0.018, m.chrome, 6);
  const c = b.cyl(dia, 0.008, x, y, z, m.glow(0xc9a43b, 0.08), 28);
  c.rotation.x = tilt;
  b.cyl(0.06, 0.02, x, y + 0.01, z, m.chrome, 10);
}

/** Drum kit (4, 5 or 7 shells) with hi-hat, cymbals and throne; nominal 1.8 × 1.4 × 1.5 m. */
export function drums(p: StageProp, m: Mats): THREE.Object3D {
  const kit = strParam(p, 'kit');
  const cymbals = Math.round(numParam(p, 'cymbals', 3));
  const g = fitted(p, 1.8, 1.4, 1.5, (b) => {
    drum(b, 0.56, 0.42, 0, 0.29, 0.25, m, true);
    for (const s of [-1, 1]) b.rod(new THREE.Vector3(s * 0.22, 0, 0.42), new THREE.Vector3(s * 0.18, 0.12, 0.3), 0.02, m.chrome, 6); // spurs
    drum(b, 0.36, 0.14, -0.38, 0.64, -0.05, m, false, 0.12); // snare
    b.tripod(0.18, 0.45, -0.38, -0.05, m.chrome);
    const racks = kit === '4' ? [0] : kit === '7' ? [-0.3, 0, 0.3] : [-0.15, 0.15];
    racks.forEach((x, i) => drum(b, 0.25 + i * 0.03, 0.2, x, 0.82 + Math.abs(x) * 0.1, 0.15, m, false, 0.35));
    const floors = kit === '7' ? [0.45, 0.72] : kit === '4' ? [0.5] : [0.5];
    for (const x of floors) {
      drum(b, 0.4, 0.38, x, 0.48, -0.12, m);
      for (const s of [-1, 1]) b.rod(new THREE.Vector3(x + s * 0.18, 0, -0.12), new THREE.Vector3(x + s * 0.17, 0.3, -0.12), 0.012, m.chrome, 6);
    }
    // Hi-hat: two cymbals on a stand left of the snare.
    b.tripod(0.22, 0.4, -0.68, -0.05, m.chrome);
    b.rod(new THREE.Vector3(-0.68, 0.3, -0.05), new THREE.Vector3(-0.68, 0.95, -0.05), 0.015, m.chrome, 6);
    for (const dy of [0.9, 0.93]) b.cyl(0.36, 0.006, -0.68, dy, -0.05, m.glow(0xc9a43b, 0.08), 24);
    const spots: [number, number, number][] = [[-0.55, 1.2, 0.35], [0.6, 1.25, 0.3], [0.8, 1.05, -0.3], [-0.2, 1.3, 0.55], [0.25, 1.32, 0.55], [-0.85, 1.1, 0.2]];
    for (const [x, y, z] of spots.slice(0, cymbals)) cymbalOn(b, 0.42, x, y, z, m);
    // Throne behind the kit.
    b.cyl(0.36, 0.08, 0, 0.52, -0.55, m.dark, 18);
    b.tripod(0.22, 0.45, 0, -0.55, m.chrome);
  });
  return withLod(g, p.width, p.height, p.depth, m.body);
}

export function cymbal(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  cymbalOn(new Builder(g), numParam(p, 'size', 0.45), 0, p.height, 0, m);
  return g;
}

/** Electric, acoustic or bass guitar, upright on a stand or alone; nominal height 1 m (bass 1.2 m). */
export function guitar(p: StageProp, m: Mats): THREE.Object3D {
  const style = strParam(p, 'style');
  const onStand = boolParam(p, 'stand');
  const nh = style === 'bass' ? 1.2 : 1;
  const g = fitted(p, 0.4, nh, 0.4, (b) => {
    const gt = new THREE.Group();
    gt.position.set(0, onStand ? 0.12 : 0.02, 0);
    gt.rotation.x = -0.18; // leaning back on the stand
    const s = new Builder(gt);
    const acoustic = style === 'acoustic';
    const t = acoustic ? 0.1 : 0.045;
    const lower = acoustic ? 0.38 : 0.34, upper = acoustic ? 0.29 : 0.26;
    const body = (dia: number, y: number) => { const c = s.cyl(dia, t, 0, y, 0, m.body, 28); c.rotation.x = Math.PI / 2; };
    body(lower, lower / 2);
    body(upper, lower * 0.95);
    if (acoustic) { const hole = s.cyl(0.09, 0.012, 0, lower * 0.95, t / 2, m.grille, 20); hole.rotation.x = Math.PI / 2; }
    else {
      s.box(0.16, 0.04, 0.012, 0, lower * 0.6, t / 2 + 0.004, m.light); // pickguard / pickups
      for (const y of [0.18, 0.27]) s.box(0.08, 0.018, 0.014, 0, y, t / 2 + 0.008, m.chrome);
    }
    const neckTop = nh - 0.08;
    s.box(0.05, neckTop - lower * 1.2, 0.025, 0, (lower * 1.2 + neckTop) / 2, 0, m.wood);
    s.box(0.08, 0.16, 0.02, 0, neckTop + 0.04, -0.005, m.dark); // headstock
    s.box(0.012, neckTop - lower * 0.3, 0.004, 0, (lower * 0.3 + neckTop) / 2, t / 2 + 0.01, m.chrome); // strings
    b.add(gt);
    if (onStand) {
      b.tripod(0.18, 0.12, 0, -0.04, m.dark);
      b.rod(new THREE.Vector3(0, 0.12, -0.04), new THREE.Vector3(0, nh * 0.62, -0.13), 0.02, m.dark, 6);
    }
  });
  return withLod(g, p.width * 0.8, p.height, p.depth * 0.3, m.body);
}

/** Speaker cabinet with `n` × `k` drivers on its front (grille cloth). */
function cabinet(b: Builder, w: number, h: number, d: number, y: number, cols: number, rows: number, m: Mats): void {
  b.block(w, h, d, 0, y, 0, m.body);
  b.box(w * 0.9, h * 0.86, 0.008, 0, y + h / 2, d / 2 + 0.004, m.grille);
  const dia = Math.min((w * 0.85) / cols, (h * 0.8) / rows) * 0.85;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const c = b.cyl(dia, 0.01, -w * 0.42 + ((i + 0.5) * w * 0.84) / cols, y + h * 0.08 + ((j + 0.5) * h * 0.84) / rows, d / 2 + 0.01, m.dark, 18);
    c.rotation.x = Math.PI / 2;
  }
}
/** Amp head (or combo panel): control strip with knobs. */
function head(b: Builder, w: number, h: number, d: number, y: number, m: Mats): void {
  b.block(w, h, d, 0, y, 0, m.body);
  b.box(w * 0.92, h * 0.4, 0.01, 0, y + h * 0.55, d / 2 + 0.005, m.chrome);
  for (let i = 0; i < 6; i++) { const k = b.cyl(0.025, 0.02, -w * 0.35 + (i * w * 0.7) / 5, y + h * 0.55, d / 2 + 0.015, m.dark, 10); k.rotation.x = Math.PI / 2; }
}

export function amp(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  const b = new Builder(g);
  const { width: w, height: h, depth: d } = p;
  const style = strParam(p, 'style');
  if (style === 'stack') {
    const ch = (h - h * 0.14) / 2;
    cabinet(b, w, ch, d, 0, 2, 2, m);
    cabinet(b, w, ch, d, ch, 2, 2, m);
    head(b, w, h * 0.14, d * 0.85, ch * 2, m);
  } else if (style === 'bass') {
    cabinet(b, w, h * 0.82, d, 0, 2, 4, m);
    head(b, w * 0.95, h * 0.18, d * 0.8, h * 0.82, m);
  } else {
    cabinet(b, w, h * 0.78, d, 0, 2, 1, m);
    head(b, w, h * 0.22, d, h * 0.78, m);
  }
  return g;
}

/** Keyboard / synth on an X stand, one or two tiers. */
export function keyboard(p: StageProp, m: Mats): THREE.Object3D {
  const tiers = Math.round(numParam(p, 'tiers', 1));
  const nh = tiers > 1 ? 1.25 : 1;
  const g = fitted(p, 1.2, nh, 0.45, (b) => {
    for (const s of [-1, 1]) {
      // X stand legs on each side.
      b.rod(new THREE.Vector3(s * 0.4, 0, 0.18), new THREE.Vector3(s * 0.4, 0.82, -0.12), 0.03, m.dark, 6);
      b.rod(new THREE.Vector3(s * 0.4, 0, -0.18), new THREE.Vector3(s * 0.4, 0.82, 0.12), 0.03, m.dark, 6);
    }
    const deck = (y: number, z: number, w: number) => {
      b.block(w, 0.1, 0.36, 0, y, z, m.body);
      b.block(w * 0.86, 0.02, 0.15, 0, y + 0.06, z - 0.08, m.light); // white keys (musician side)
      const n = Math.round((w * 0.86) / 0.0165 / 7) * 5;
      for (let i = 0; i < n; i++) {
        if ([1, 4].includes(i % 5)) continue; // gaps between the black-key groups
        b.block(0.009, 0.015, 0.09, -w * 0.43 + ((i + 0.5) * w * 0.86) / n, y + 0.08, z - 0.05, m.grille);
      }
      b.box(w * 0.3, 0.012, 0.06, w * 0.2, y + 0.105, z + 0.1, m.dark); // display / panel
    };
    deck(0.82, 0, 1.2);
    if (tiers > 1) {
      b.rod(new THREE.Vector3(-0.35, 0.92, 0.1), new THREE.Vector3(-0.35, 1.12, 0.12), 0.02, m.dark, 6);
      b.rod(new THREE.Vector3(0.35, 0.92, 0.1), new THREE.Vector3(0.35, 1.12, 0.12), 0.02, m.dark, 6);
      deck(1.12, 0.06, 1.0);
    }
  });
  return withLod(g, p.width, p.height, p.depth, m.body);
}

/** Grand piano (curved case, open lid, keyboard on the musician side) or upright. */
export function piano(p: StageProp, m: Mats): THREE.Object3D {
  if (strParam(p, 'style') === 'upright') {
    return fitted(p, 1.5, 1.3, 0.6, (b) => {
      b.block(1.5, 1.3, 0.38, 0, 0, 0.11, m.body);
      b.block(1.5, 0.06, 0.24, 0, 0.7, -0.18, m.body);
      b.block(1.3, 0.02, 0.15, 0, 0.74, -0.2, m.light);
      for (const s of [-1, 1]) b.block(0.06, 0.68, 0.06, s * 0.7, 0, -0.27, m.body);
    });
  }
  const g = fitted(p, 1.55, 1, 2.1, (b) => {
    // Case outline seen from above (local x, z): straight bass side, curved treble side, keyboard at -z.
    const s = new THREE.Shape();
    s.moveTo(-0.775, -1.05); s.lineTo(0.775, -1.05); s.lineTo(0.775, -0.2);
    s.bezierCurveTo(0.775, 0.5, 0.1, 0.4, 0.05, 1.05); s.lineTo(-0.775, 1.05); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.32, bevelEnabled: false, curveSegments: 16 });
    geo.rotateX(Math.PI / 2);
    const body = new THREE.Mesh(geo, m.body);
    body.position.y = 0.95;
    b.add(body);
    b.block(1.45, 0.05, 0.28, 0, 0.66, -1.12, m.body); // key bed
    b.block(1.3, 0.02, 0.16, 0, 0.71, -1.16, m.light);
    for (const [x, z] of [[-0.65, -0.9], [0.65, -0.9], [-0.55, 0.85]] as const) b.block(0.09, 0.63, 0.09, x, 0, z, m.body);
    if (boolParam(p, 'open')) {
      const lid = new THREE.Mesh(geo, m.body);
      // Hinged on the straight side (x = 0.775): rotate, then bring the hinge line back on top of the case.
      const a = -0.6, hinge = new THREE.Vector2(0.775, 0).rotateAround(new THREE.Vector2(), a);
      lid.scale.set(1, 0.06, 1);
      lid.rotation.z = a;
      lid.position.set(0.775 - hinge.x, 0.97 - hinge.y, 0);
      b.add(lid);
      b.rod(new THREE.Vector3(-0.3, 0.95, 0), new THREE.Vector3(-0.3, 0.97 + Math.tan(-a) * 1.075 - 0.02, 0), 0.015, m.dark, 6); // lid prop
    } else b.block(1.55, 0.02, 2.1, 0, 0.95, 0, m.body);
  });
  return withLod(g, p.width, p.height, p.depth, m.body);
}

export function musicStand(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  const b = new Builder(g);
  const h = p.height;
  b.tripod(Math.max(0.2, p.width / 2), h * 0.4, 0, 0, m.dark);
  b.rod(new THREE.Vector3(0, h * 0.35, 0), new THREE.Vector3(0, h - 0.15, 0), 0.02, m.dark, 6);
  const desk = b.box(p.width, 0.32, 0.01, 0, h - 0.12, 0.02, m.dark);
  desk.rotation.x = -0.4;
  return g;
}

/** Mic stand: straight pole on a round base, or tripod with a boom towards the singer. */
export function mic(p: StageProp, m: Mats): THREE.Object3D {
  const g = new THREE.Group();
  const b = new Builder(g);
  const h = p.height;
  if (strParam(p, 'style') === 'boom') {
    b.tripod(p.width / 2, h * 0.45, 0, 0, m.body);
    b.rod(new THREE.Vector3(0, h * 0.4, 0), new THREE.Vector3(0, h * 0.8, 0), 0.018, m.body, 6);
    const tip = new THREE.Vector3(0, h, -0.35);
    b.rod(new THREE.Vector3(0, h * 0.72, 0.15), tip, 0.014, m.body, 6);
    b.sphere(0.06, tip.x, tip.y, tip.z - 0.06, m.chrome);
    return g;
  }
  b.cyl(p.width, 0.02, 0, 0.01, 0, m.body, 20);
  b.cyl(0.02, h, 0, h / 2, 0, m.body, 8);
  b.rod(new THREE.Vector3(0, h, 0), new THREE.Vector3(0, h + 0.02, -0.12), 0.025, m.body, 8);
  b.sphere(0.055, 0, h + 0.03, -0.17, m.chrome);
  return g;
}
