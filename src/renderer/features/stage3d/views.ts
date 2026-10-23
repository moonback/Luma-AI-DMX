import * as THREE from 'three';
import type { StageGeometry } from '../../../core/visualizer/beam';

/* Built-in cameras of the 3D view and small file helpers (captures, recordings). */

export type ViewId = 'foh' | 'front' | 'top' | 'left' | 'right';
export const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'foh', label: 'Régie' }, { id: 'front', label: 'Face' }, { id: 'top', label: 'Dessus' }, { id: 'left', label: 'Jardin' }, { id: 'right', label: 'Cour' },
];

export function viewPose(id: ViewId, st: StageGeometry): { pos: THREE.Vector3; target: THREE.Vector3 } {
  const { width: W, wallHeight: H } = st;
  // Frame the whole playing area: deck plus thrust.
  const front = st.thrust?.depth ?? 0;
  const D = st.depth + front;
  const span = Math.max(W, D);
  const target = new THREE.Vector3(0, Math.min(2, H / 3), front - D / 2);
  switch (id) {
    case 'front': return { pos: new THREE.Vector3(0, 1.7, front + span * 0.9), target };
    case 'top': return { pos: new THREE.Vector3(0, span * 1.6, target.z + 0.01), target: new THREE.Vector3(0, 0, target.z) };
    case 'left': return { pos: new THREE.Vector3(-span * 1.1, H * 0.6, target.z), target };
    case 'right': return { pos: new THREE.Vector3(span * 1.1, H * 0.6, target.z), target };
    default: return { pos: new THREE.Vector3(0, H * 0.75, front + span * 1.25), target };
  }
}


export function download(url: string, name: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}
export const stamp = () => new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');

