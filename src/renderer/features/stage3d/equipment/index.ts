import * as THREE from 'three';
import type { StageProp } from '../../../../core/model/schemas';
import type { PropKind } from '../../../../core/visualizer/equipment';
import { materials, SELECTED_EMISSIVE, type Mats } from './kit';
import { audioRack, lineArray, paStand, speaker, sub } from './sound';
import { amp, cymbal, drums, guitar, keyboard, mic, musicStand, piano } from './backline';
import { arch, backdrop, barrier, cable, canopy, chair, co2Jet, consoleDesk, djBooth, flightCase, fogMachine, hoist, sparkMachine, trussBase } from './scenery';
import { modelInstance } from './models';

/** Procedural model of each equipment kind; the other kinds (riser, stairs, drape…) keep the set-piece builder. */
const BUILDERS: Partial<Record<PropKind, (p: StageProp, m: Mats) => THREE.Object3D>> = {
  speaker, 'line-array': lineArray, sub, 'pa-stand': paStand, 'audio-rack': audioRack,
  drums, cymbal, guitar, amp, keyboard, piano, 'music-stand': musicStand, mic,
  'truss-base': trussBase, hoist, canopy, 'fog-machine': fogMachine, 'spark-machine': sparkMachine, 'co2-jet': co2Jet,
  backdrop, arch, 'dj-booth': djBooth, console: consoleDesk, 'flight-case': flightCase, chair, barrier, cable,
};

export const hasEquipmentModel = (kind: PropKind) => kind in BUILDERS;

/** Selection tint on an imported model: its shared materials are swapped for tinted copies on this instance only. */
function tint(o: THREE.Object3D): void {
  o.traverse((x) => {
    const mesh = x as THREE.Mesh;
    if (!(mesh.material instanceof THREE.MeshStandardMaterial)) return;
    const mt = mesh.material.clone();
    mt.emissive = new THREE.Color(SELECTED_EMISSIVE);
    mt.userData.shared = false;
    mesh.material = mt;
  });
}

/**
 * Model of a piece in its own frame (bottom centre at the origin, front towards +z): the imported GLB once loaded,
 * else the procedural model of its kind; null when the kind has none (the caller draws it).
 */
export function buildEquipment(p: StageProp, selected: boolean): THREE.Object3D | null {
  if (p.model) {
    const inst = modelInstance(p.model, p);
    if (inst) { if (selected) tint(inst); return inst; }
  }
  const make = BUILDERS[p.kind];
  return make ? make(p, materials(p.color, selected)) : null;
}
