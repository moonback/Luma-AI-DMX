import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/*
 * Imported GLB models of set pieces (stored in the project as a data URL, never fetched from the network): parsed
 * asynchronously once per distinct file, cached, and instanced by cloning (geometry and materials shared). While a
 * model loads, or when it cannot be read, the piece keeps its procedural geometry and the panel says so.
 */
export type ModelStatus = 'loading' | 'ready' | 'error';
interface Entry { status: ModelStatus; scene?: THREE.Group; size?: THREE.Vector3; error?: string }

const MAX_CACHED = 24;
const cache = new Map<string, Entry>();
let version = 0;
const listeners = new Set<() => void>();

/** Bumped whenever a model finishes loading (or fails): the 3D view rebuilds the set then. */
export const modelVersion = () => version;
export function onModelChange(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
const changed = () => { version++; for (const fn of listeners) fn(); };

function decode(dataUrl: string): ArrayBuffer {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Cache entry of a model, starting its parse on first request. */
export function modelEntry(dataUrl: string): Entry {
  let e = cache.get(dataUrl);
  if (e) return e;
  e = { status: 'loading' };
  cache.set(dataUrl, e);
  if (cache.size > MAX_CACHED) {
    const [oldest] = cache.keys();
    if (oldest !== undefined && oldest !== dataUrl) cache.delete(oldest);
  }
  const entry = e;
  try {
    new GLTFLoader().parse(decode(dataUrl), '', (gltf) => {
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.userData.shared = true;
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const mt of mats) mt.userData.shared = true;
      });
      entry.scene = gltf.scene;
      entry.size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
      entry.status = 'ready';
      changed();
    }, (err) => { entry.status = 'error'; entry.error = String((err as unknown as Error)?.message ?? err); changed(); });
  } catch (err) {
    entry.status = 'error';
    entry.error = (err as Error).message;
    queueMicrotask(changed);
  }
  return entry;
}

export const modelStatus = (dataUrl: string): ModelStatus => modelEntry(dataUrl).status;

/** Clone of a loaded model scaled uniformly into width × height × depth, centred, resting on y = 0. Null until ready. */
export function modelInstance(dataUrl: string, box: { width: number; height: number; depth: number }): THREE.Object3D | null {
  const e = modelEntry(dataUrl);
  if (e.status !== 'ready' || !e.scene || !e.size) return null;
  const inst = e.scene.clone(true);
  const k = Math.min(box.width / Math.max(1e-6, e.size.x), box.height / Math.max(1e-6, e.size.y), box.depth / Math.max(1e-6, e.size.z));
  inst.scale.setScalar(k);
  const bb = new THREE.Box3().setFromObject(inst);
  const c = bb.getCenter(new THREE.Vector3());
  inst.position.set(-c.x, -bb.min.y, -c.z);
  const g = new THREE.Group();
  g.add(inst);
  return g;
}

/** Max size of an imported GLB file (the project stores it). */
export const MODEL_MAX_BYTES = 4 * 1024 * 1024;
