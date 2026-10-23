import * as THREE from 'three';
import { useEffect, useState } from 'react';
import { propSchema } from '../../../core/model/schemas';
import type { LibraryItem } from '../../../core/visualizer/library';
import { buildEquipment } from './equipment';
import { disposeGroup } from './environment';

/*
 * Library thumbnails rendered from the same procedural models as the 3D view (what you see is what you place): one
 * small off-screen renderer, one image per item, cached for the session and produced one per frame so the panel
 * never stalls. Without WebGL (or for kinds without a model) the caller keeps its drawn glyph.
 */
const SIZE = 96;
const cache = new Map<string, string | null>();
const queue: { item: LibraryItem; done: (url: string | null) => void }[] = [];
let renderer: THREE.WebGLRenderer | null | undefined;
let busy = false;

function getRenderer(): THREE.WebGLRenderer | null {
  if (renderer !== undefined) return renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
  } catch {
    renderer = null;
  }
  return renderer;
}

function render(item: LibraryItem): string | null {
  if (item.kind !== 'prop') return null;
  const parsed = propSchema.safeParse({ id: 'thumb', name: 'thumb', x: 0, y: 0, rotation: 0, width: 1, depth: 1, height: 1, elevation: 0, color: '#444444', ...item.preset });
  const r = parsed.success ? getRenderer() : null;
  if (!r || !parsed.success) return null;
  const model = buildEquipment(parsed.data, false);
  if (!model) return null;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdde6ff, 0x20232c, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2, 4, 5);
  scene.add(key, model);
  if (model instanceof THREE.LOD) model.autoUpdate = false; // always the detailed level
  const box = new THREE.Box3().setFromObject(model instanceof THREE.LOD ? model.levels[0]!.object : model);
  const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.62;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 200);
  // Keyboards and pianos are seen from the musician's side (their keys), the rest from the audience.
  const back = parsed.data.kind === 'keyboard' || parsed.data.kind === 'piano';
  cam.position.copy(centre).add(new THREE.Vector3(0.75, back ? 0.7 : 0.45, back ? -1.15 : 1.15).normalize().multiplyScalar(radius / Math.tan((15 * Math.PI) / 180)));
  cam.lookAt(centre);
  if (model instanceof THREE.LOD) model.levels[1]!.object.visible = false;
  r.render(scene, cam);
  const url = r.domElement.toDataURL('image/png');
  disposeGroup(model);
  return url;
}

function pump(): void {
  if (busy) return;
  const next = queue.shift();
  if (!next) return;
  busy = true;
  requestAnimationFrame(() => {
    let url: string | null = null;
    try { url = render(next.item); } catch { url = null; }
    cache.set(next.item.id, url);
    next.done(url);
    busy = false;
    pump();
  });
}

/** Thumbnail data URL of a library item, null while pending or when it has none. */
export function useThumbnail(item: LibraryItem): string | null {
  const [url, setUrl] = useState<string | null>(() => cache.get(item.id) ?? null);
  useEffect(() => {
    if (cache.has(item.id)) { setUrl(cache.get(item.id) ?? null); return; }
    let live = true;
    queue.push({ item, done: (u) => { if (live) setUrl(u); } });
    pump();
    return () => { live = false; };
  }, [item]);
  return url;
}
