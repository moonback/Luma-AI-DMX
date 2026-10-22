import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { useStore } from '../../store';
import { act, call } from '../../api';
import { type VisualFixture } from '../../../core/visualizer/model';
import type { Project, StageProp, Truss } from '../../../core/model/schemas';
import { followTruss, snapToTrusses, snapTrussEnds } from '../../../core/visualizer/truss';
import { beamDirection, type StageGeometry } from '../../../core/visualizer/beam';
import { buildRig, disposeGeometries, disposeRig, rigKey, updateRig, type Rig } from './rig';
import { buildEnvironment, buildLowFog, disposeGroup, propObjectName, setLowFog, trussObjectName } from './environment';
import { disposeTextures } from './textures';
import { buildPerformer, buildScreen, disposeScreen, screenKey, updatePerformer, updateScreen, type PerformerRig, type ScreenRig } from './actors';
import { LIGHT_BUDGET, RealLights, applyAmbience, buildFloorReflector, disposeReflector, type AmbienceId, type FloorId } from './quality';
import { screenMediaVersion } from '../../screenMedia';
import { addSceneElement } from '../../sceneActions';
import type { SceneRef } from '../../../core/visualizer/sceneEdit';
import type { MessageKey } from '../../i18n';

/*
 * Imperative three.js side of the 3D stage view: renderer, cameras, rig and environment objects, gizmo and pointer
 * interactions, render loop. The React component (Stage3D.tsx) owns the UI state and reads/writes it through `latest`
 * and the `ui` callbacks.
 */

export type ViewId = 'foh' | 'front' | 'top' | 'left' | 'right';
export const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'foh', label: 'Régie' }, { id: 'front', label: 'Face' }, { id: 'top', label: 'Dessus' }, { id: 'left', label: 'Jardin' }, { id: 'right', label: 'Cour' },
];

/** `view`: a built-in camera id or the id of a view saved in the project. */
export interface Prefs { haze: number; glow: boolean; pools: boolean; labels: boolean; smoke: boolean; view: string; grid: number; real: boolean; ambience: AmbienceId; floor: FloorId; exposure: number; room: number }
const DEFAULT_PREFS: Prefs = { haze: 0.55, glow: true, pools: true, labels: false, smoke: false, view: 'foh', grid: 0.25, real: false, ambience: 'black', floor: 'matte', exposure: 1, room: 0 };

/** Quality presets: a coherent set of rendering options selectable in one click. */
export type QualityPresetId = 'edit' | 'balanced' | 'quality' | 'present';
export const QUALITY_PRESETS: { id: QualityPresetId; labelKey: MessageKey; hintKey: MessageKey; patch: Partial<Prefs> }[] = [
  { id: 'edit',     labelKey: 'stage3d.preset.edit',     hintKey: 'stage3d.preset.editHint',     patch: { glow: false, pools: false, smoke: false, real: false, haze: 0.3,  exposure: 1,   ambience: 'work',    floor: 'matte'  } },
  { id: 'balanced', labelKey: 'stage3d.preset.balanced', hintKey: 'stage3d.preset.balancedHint', patch: { glow: true,  pools: true,  smoke: false, real: false, haze: 0.55, exposure: 1,   ambience: 'black',   floor: 'matte'  } },
  { id: 'quality',  labelKey: 'stage3d.preset.quality',  hintKey: 'stage3d.preset.qualityHint',  patch: { glow: true,  pools: true,  smoke: false, real: true,  haze: 0.65, exposure: 1,   ambience: 'black',   floor: 'lacquer'} },
  { id: 'present',  labelKey: 'stage3d.preset.present',  hintKey: 'stage3d.preset.presentHint',  patch: { glow: true,  pools: true,  smoke: true,  real: false, haze: 0.8,  exposure: 1.1, ambience: 'club',    floor: 'wet'    } },
];

/** Editor grid steps in meters (0 = free); rotations snap to 15° whenever a grid is on. */
export const GRIDS = [0, 0.25, 0.5, 1];
const ROTATION_SNAP_DEG = 15;
/** A fixture dropped this close (vertically) to a truss' hanging height snaps onto it. */
const SNAP_HEIGHT = 1;

type Placement = { x: number; y: number; height: number; rotation: number };
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Degrees in [-180, 180]. */
const wrapDeg = (d: number) => r2(((((d + 180) % 360) + 360) % 360) - 180);
/** Stage placement of a 3D object (world z points to the audience, stage y upstage). */
const placementOf = (o: THREE.Object3D): Placement => ({
  x: r2(clamp(o.position.x, -100, 100)), y: r2(clamp(-o.position.z, -100, 100)), height: r2(o.position.y), rotation: wrapDeg(THREE.MathUtils.radToDeg(o.rotation.y)),
});
export function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem('luma.stage3d') ?? '{}') as Partial<Prefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}
export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem('luma.stage3d', JSON.stringify(p));
  } catch {
    // preferences simply not persisted
  }
}

function viewPose(id: ViewId, st: StageGeometry): { pos: THREE.Vector3; target: THREE.Vector3 } {
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


function download(url: string, name: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');

export type CtxTarget = SceneRef | { kind: 'fixture'; id: string };

/** Imperative handle of a mounted 3D view. */
export interface StageApi {
  goTo: (v: string) => void;
  groundAt: (cx: number, cy: number) => { x: number; y: number } | null;
  pose: () => { pos: THREE.Vector3; target: THREE.Vector3 };
  capture: () => void;
  record: (on: boolean) => void;
  setBloom: (on: boolean) => void;
  frame: (at: { x: number; y: number; height: number }) => void;
}

/** Component state read by the render loop and the interactions on every frame. */
export interface StageLatest {
  model: VisualFixture[];
  selection: string[];
  groupFilter: string | null | undefined;
  prefs: Prefs;
  stage: StageGeometry;
  vis: Project['visualizer'];
  follow: string | null;
  edit: boolean;
  tool: 'translate' | 'rotate';
  selSet: SceneRef | null;
  /** Turntable camera, and fixtures outside the selection dimmed. */
  spin: boolean;
  solo: boolean;
}

/** UI feedback from the 3D view (React state setters). */
export interface StageUi {
  setError: (msg: string | null) => void;
  setDims: (s: string | null) => void;
  setHover: (h: { x: number; y: number; f: VisualFixture } | null) => void;
  setCtx: (c: { x: number; y: number; target: CtxTarget } | null) => void;
  setLights: (n: number) => void;
  setShadows: (n: number) => void;
  setFps: (n: number) => void;
}

/** Mounts the 3D view in `el`; null when WebGL is unavailable (the error goes to `ui.setError`). */
export function mountStage3D(el: HTMLDivElement, latest: { readonly current: StageLatest }, ui: StageUi): { api: StageApi; dispose: () => void } | null {
  const { setError, setDims, setHover, setCtx, setLights, setShadows, setFps } = ui;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    setError(`WebGL indisponible : ${(err as Error).message}`);
    return null;
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060a);
  scene.fog = new THREE.Fog(0x05060a, 30, 70);
  const hemi = new THREE.HemisphereLight(0x8899bb, 0x0b0d14, 0.5);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xb8c4ff, 0.35);
  key.position.set(-6, 12, 10);
  scene.add(key);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const real = new RealLights(scene, renderer.capabilities.maxTextures);
  let ambienceKey = '';
  let lightKey = '';
  let floorGroup: THREE.Group | null = null;
  const performers = new Map<string, PerformerRig>();
  const screens = new Map<string, ScreenRig>();
  let mediaVersion = -1;
  let budgetAt = performance.now();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 300);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 1.5;
  controls.maxDistance = 120;

  // Direct editing: a gizmo on the selected fixture (through a proxy, the rig follows the model) or truss group.
  const tc = new TransformControls(camera, renderer.domElement);
  tc.setSpace('world');
  tc.size = 0.8;
  scene.add(tc.getHelper());
  const proxy = new THREE.Object3D();
  scene.add(proxy);
  /** Placements shown while dragging and until the main process confirms the edit. */
  const overrides = new Map<string, Placement>();
  let attached = '';
  let gizmoCfg = '';
  let dragging = false;
  const describe = (p: Placement, extra = '') => `X ${p.x.toFixed(2)} m · Y ${p.y.toFixed(2)} m · H ${p.height.toFixed(2)} m · ${p.rotation.toFixed(0)}°${extra}`;
  /** Truss a fixture would hang on if dropped here (close horizontally and near the hanging height). */
  const trussSnap = (p: Placement) => {
    const snap = snapToTrusses(latest.current.vis.trusses, p.x, p.y);
    return snap && Math.abs(p.height - snap.height) <= SNAP_HEIGHT ? snap : null;
  };
  const editedTruss = (): { before: Truss; after: Truss; joint?: Truss } | null => {
    const id = attached.startsWith('truss:') ? attached.split(':')[1]! : null;
    const trusses = latest.current.vis.trusses;
    const before = id ? trusses.find((t) => t.id === id) : undefined;
    const obj = tc.object;
    if (!before || !obj) return null;
    const p = placementOf(obj);
    const after = { ...before, x: p.x, y: p.y, height: r2(clamp(p.height, 0.5, 30)), rotation: p.rotation };
    // Moved close to another piece: end to end on it, at its height.
    const snap = latest.current.tool === 'translate' ? snapTrussEnds(after, trusses) : null;
    return snap ? { before, after: { ...after, x: snap.x, y: snap.y, height: snap.height }, joint: snap.to } : { before, after };
  };
  const editedProp = (): { before: StageProp; after: StageProp } | null => {
    const id = attached.startsWith('prop:') ? attached.split(':')[1]! : null;
    const before = id ? latest.current.vis.props.find((x) => x.id === id) : undefined;
    const obj = tc.object;
    if (!before || !obj) return null;
    const p = placementOf(obj);
    return { before, after: { ...before, x: p.x, y: p.y, elevation: r2(clamp(p.height, 0, 20)), rotation: p.rotation } };
  };
  const onChange = () => {
    const obj = tc.object;
    if (!obj || !dragging) return;
    const p = placementOf(obj);
    if (obj === proxy) {
      const id = attached.split(':')[1]!;
      overrides.set(id, p);
      const snap = latest.current.tool === 'translate' ? trussSnap(p) : null;
      setDims(describe(p, snap ? ` · accroche : ${snap.truss.name}` : ''));
    } else if (attached.startsWith('prop:')) {
      const pr = editedProp();
      if (pr) setDims(describe({ ...p, height: pr.after.elevation }, ' (élévation)'));
    } else {
      const tr = editedTruss();
      if (!tr) return;
      // Hung fixtures ride along with the truss while it moves.
      for (const f of useStore.getState().project?.project.patch ?? []) {
        if (f.trussId !== tr.before.id) continue;
        const n = followTruss(tr.before, tr.after, f);
        overrides.set(f.id, { x: n.position.x, y: n.position.y, height: n.height, rotation: n.rotation });
      }
      setDims(describe(tr.after, tr.joint ? ` · raccord : ${tr.joint.name}` : ''));
    }
  };
  const commit = () => {
    const obj = tc.object;
    setDims(null);
    if (!obj) return;
    if (obj === proxy) {
      const id = attached.split(':')[1]!;
      const fixture = useStore.getState().project?.project.patch.find((f) => f.id === id);
      if (!fixture) { overrides.delete(id); return; }
      const p = placementOf(proxy);
      const patch: { position: { x: number; y: number }; height: number; rotation: number; trussId?: string | null } = {
        position: { x: p.x, y: p.y }, height: r2(clamp(p.height, 0, 50)), rotation: p.rotation,
      };
      if (latest.current.tool === 'translate') {
        const snap = trussSnap(p);
        if (snap) Object.assign(patch, { position: { x: snap.x, y: snap.y }, height: snap.height, trussId: snap.truss.id });
        else if (fixture.trussId) patch.trussId = null;
      }
      overrides.set(id, { x: patch.position.x, y: patch.position.y, height: patch.height, rotation: p.rotation });
      void act({ type: 'fixture.update', id, patch }).finally(() => overrides.delete(id));
    } else if (attached.startsWith('prop:')) {
      const pr = editedProp();
      if (!pr) return;
      const props = latest.current.vis.props.map((x) => (x.id === pr.before.id ? pr.after : x));
      void call({ type: 'project.update', visualizer: { props } }).catch(() => { envKey = ''; });
    } else {
      const tr = editedTruss();
      if (!tr) return;
      const trusses = latest.current.vis.trusses.map((t) => (t.id === tr.before.id ? tr.after : t));
      void call({ type: 'project.update', visualizer: { trusses } })
        .catch(() => { envKey = ''; }) // refused: rebuild the set at its saved place
        .finally(() => overrides.clear());
    }
  };
  tc.addEventListener('dragging-changed', (e) => {
    dragging = !!e.value;
    if (!dragging) commit();
  });
  tc.addEventListener('objectChange', onChange);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.2);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  bloom.enabled = latest.current.prefs.glow;

  let env: THREE.Group | null = null;
  let fog: THREE.Group | null = null;
  let envKey = '';
  const rigs = new Map<string, Rig>();

  // Camera transitions.
  let anim: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; start: number } | null = null;
  const goTo = (v: string, instant = false) => {
    const { stage: st, vis: cfg } = latest.current;
    const saved = cfg.views.find((x) => x.id === v);
    const pose = saved
      ? { pos: new THREE.Vector3(saved.pos.x, saved.pos.y, saved.pos.z), target: new THREE.Vector3(saved.target.x, saved.target.y, saved.target.z) }
      : viewPose(VIEWS.some((x) => x.id === v) ? (v as ViewId) : 'foh', st);
    if (instant) {
      camera.position.copy(pose.pos);
      controls.target.copy(pose.target);
      controls.update();
    } else anim = { from: camera.position.clone(), to: pose.pos, tFrom: controls.target.clone(), tTo: pose.target, start: performance.now() };
  };
  goTo(latest.current.prefs.view, true);

  const resize = () => {
    const r = el.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(el);

  // Picking (click = select, hover = tooltip).
  const ray = new THREE.Raycaster();
  const pick = (cx: number, cy: number): string | undefined => {
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects([...rigs.values()].flatMap((x) => x.bodies))[0];
    return hit?.object.userData.fixtureId as string | undefined;
  };
  let downAt = { x: 0, y: 0 };
  let lastHover = 0;
  const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY }; };
  /** Truss or set piece under the pointer. */
  const pickSet = (cx: number, cy: number): SceneRef | undefined => {
    if (!env) return undefined;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
    const o = ray.intersectObject(env, true).find((h) => h.object.userData.trussId || h.object.userData.propId)?.object;
    return o ? (o.userData.trussId ? { kind: 'truss', id: o.userData.trussId as string } : { kind: 'prop', id: o.userData.propId as string }) : undefined;
  };
  /** Stage point under the pointer, where the view ray meets the floor (click placement, library drop). */
  const groundAt = (cx: number, cy: number): { x: number; y: number } | null => {
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
    const at = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    return at ? { x: at.x, y: -at.z } : null;
  };
  const onUp = (e: PointerEvent) => {
    if (e.button !== 0 || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return;
    if (tc.axis !== null || dragging) return; // click on the gizmo
    const placing = useStore.getState().placing;
    if (placing) {
      const at = groundAt(e.clientX, e.clientY);
      if (at) addSceneElement(placing.kind, at, placing.preset);
      return;
    }
    const id = pick(e.clientX, e.clientY);
    const st = useStore.getState();
    const set = !id ? pickSet(e.clientX, e.clientY) : undefined;
    st.setSceneSel(set ?? null);
    if (set) st.setSelection([]);
    else if (!id) st.setSelection([]);
    else if (e.ctrlKey || e.shiftKey) st.setSelection(st.selection.includes(id) ? st.selection.filter((x) => x !== id) : [...st.selection, id]);
    else st.setSelection([id]);
  };
  const onMove = (e: PointerEvent) => {
    const now = performance.now();
    if (e.buttons || now - lastHover < 60) return;
    lastHover = now;
    const id = pick(e.clientX, e.clientY);
    const f = id ? latest.current.model.find((m) => m.id === id) : undefined;
    const r = el.getBoundingClientRect();
    setHover(f ? { x: e.clientX - r.left, y: e.clientY - r.top, f } : null);
  };
  const onLeave = () => setHover(null);
  // Edit mode: right click on a fixture, truss or set piece opens its menu (a right drag still pans the camera).
  const onContext = (e: MouseEvent) => {
    if (!latest.current.edit || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return;
    const id = pick(e.clientX, e.clientY);
    const set = id ? undefined : pickSet(e.clientX, e.clientY);
    if (!id && !set) return;
    e.preventDefault();
    const st = useStore.getState();
    if (id) { if (!st.selection.includes(id)) st.setSelection([id]); } else st.setSceneSel(set!);
    const r = el.getBoundingClientRect();
    setCtx({ x: e.clientX - r.left, y: e.clientY - r.top, target: id ? { kind: 'fixture', id } : set! });
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerleave', onLeave);
  renderer.domElement.addEventListener('contextmenu', onContext);

  let wantCapture = false;
  let recorder: MediaRecorder | null = null;
  const api: StageApi = {
    goTo: (v) => goTo(v),
    groundAt,
    pose: () => ({ pos: camera.position.clone(), target: controls.target.clone() }),
    capture: () => { wantCapture = true; },
    record: (on) => {
      if (!on) { recorder?.stop(); return; }
      const chunks: Blob[] = [];
      recorder = new MediaRecorder(renderer.domElement.captureStream(30), { mimeType: 'video/webm' });
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
        download(url, `scene-${stamp()}.webm`);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        recorder = null;
      };
      recorder.start(1000);
    },
    setBloom: (on) => { bloom.enabled = on; },
    frame: (at) => {
      // Same viewing direction, target on the element, 3 to 8 m away.
      const tTo = new THREE.Vector3(at.x, at.height, -at.y);
      const off = camera.position.clone().sub(controls.target);
      off.setLength(clamp(off.length(), 3, 8));
      anim = { from: camera.position.clone(), to: tTo.clone().add(off), tFrom: controls.target.clone(), tTo, start: performance.now() };
    },
  };

  let raf = 0;
  let frames = 0;
  let fpsStart = performance.now();
  const t0 = performance.now();
  const loop = () => {
    const now = performance.now();
    const { model: m, selection: sel, groupFilter: gf, prefs: p, stage: st, vis: cfg, follow: fid, edit: editing, tool: tl, selSet: selS, spin, solo } = latest.current;
    // Environment follows the stage layout, stage points, trusses, set pieces and the selection (fixtures never add a truss).
    const k = `${JSON.stringify(st)}|${JSON.stringify(cfg.markers)}|${JSON.stringify(cfg.trusses)}|${JSON.stringify(cfg.props)}|${selS?.id ?? ''}`;
    if (k !== envKey) {
      if (env) { scene.remove(env); disposeGroup(env); }
      if (fog) { scene.remove(fog); disposeGroup(fog); }
      env = buildEnvironment(st, cfg.markers, cfg.trusses, selS?.id ?? null, cfg.props);
      // Real-lighting mode: the set receives shadows, the trusses cast them.
      env.traverse((o) => { if (o instanceof THREE.Mesh) { o.receiveShadow = true; o.castShadow = !!(o.userData.trussId || o.userData.propId); } });
      fog = buildLowFog(st);
      scene.add(env, fog);
      envKey = k;
      ambienceKey = ''; // the floor mirror follows the stage outline
    }
    const ak = `${p.ambience}|${p.floor}|${envKey}`;
    const lk = `${p.ambience}|${p.room}`;
    if (lk !== lightKey) { lightKey = lk; applyAmbience(p.ambience, scene, hemi, key, p.room); }
    if (ak !== ambienceKey) {
      ambienceKey = ak;
      if (floorGroup) { scene.remove(floorGroup); disposeReflector(floorGroup); }
      floorGroup = buildFloorReflector(p.floor, st, renderer.getDrawingBufferSize(new THREE.Vector2()));
      if (floorGroup) scene.add(floorGroup);
    }
    // Performers and screens: rebuilt when added/removed or when their structure changes, updated every frame.
    for (const [id, r] of performers) {
      const pf = cfg.performers.find((x) => x.id === id);
      if (!pf || r.group.userData.kind !== `${pf.kind}|${pf.name}`) { scene.remove(r.group); disposeGroup(r.group); performers.delete(id); }
    }
    for (const pf of cfg.performers) {
      let r = performers.get(pf.id);
      if (!r) { r = buildPerformer(pf); r.group.userData.kind = `${pf.kind}|${pf.name}`; performers.set(pf.id, r); scene.add(r.group); }
      updatePerformer(r, pf, cfg.markers, m, { realLights: p.real, labels: p.labels }, cfg.props);
    }
    const mv = screenMediaVersion();
    for (const [id, r] of screens) {
      const sc = cfg.screens.find((x) => x.id === id);
      if (!sc || r.key !== screenKey(sc) || mv !== mediaVersion) { scene.remove(r.group); disposeScreen(r); screens.delete(id); }
    }
    mediaVersion = mv;
    for (const sc of cfg.screens) {
      let r = screens.get(sc.id);
      if (!r) { r = buildScreen(sc); screens.set(sc.id, r); scene.add(r.group); }
      updateScreen(r, sc, m, p.haze);
    }
    if (fog) setLowFog(fog, (now - t0) / 1000, p.smoke ? 0.25 + 0.5 * p.haze : 0);
    const group = gf ? useStore.getState().project?.project.groups.find((g) => g.id === gf) : null;
    const dim = (id: string) => (!!group && !group.fixtureIds.includes(id)) || (solo && sel.length > 0 && !sel.includes(id));
    const ids = new Set(m.map((f) => f.id));
    for (const [id, r] of rigs) if (!ids.has(id)) { disposeRig(r, scene); rigs.delete(id); }
    for (const f of m) {
      let r = rigs.get(f.id);
      if (!r || r.key !== rigKey(f)) {
        if (r) disposeRig(r, scene);
        r = buildRig(f, scene);
        rigs.set(f.id, r);
      }
      const o = overrides.get(f.id);
      updateRig(r, o ? { ...f, ...o } : f, { time: (now - t0) / 1000, haze: p.haze, pools: p.pools && !p.real, labels: p.labels, selected: sel.includes(f.id), dimmed: dim(f.id), stage: st });
    }
    real.setEnabled(p.real);
    real.update(m, (f) => dim(f.id));
    renderer.toneMappingExposure = 1.1 * p.exposure;
    if (anim) {
      const k2 = Math.min(1, (now - anim.start) / 700);
      const e = k2 < 0.5 ? 2 * k2 * k2 : 1 - (-2 * k2 + 2) ** 2 / 2;
      camera.position.lerpVectors(anim.from, anim.to, e);
      controls.target.lerpVectors(anim.tFrom, anim.tTo, e);
      if (k2 >= 1) anim = null;
    }
    // Gizmo target: the selected truss, else the single selected fixture (edit mode only).
    const target = !editing || fid ? '' : selS ? `${selS.kind}:${selS.id}:${env?.uuid}` : sel.length === 1 && m.some((f) => f.id === sel[0]) ? `fixture:${sel[0]}` : '';
    if (target !== attached && !dragging) {
      attached = target;
      const obj = selS && !target.startsWith('fixture:') && target ? env?.getObjectByName(selS.kind === 'truss' ? trussObjectName(selS.id) : propObjectName(selS.id)) : target ? proxy : undefined;
      if (obj) tc.attach(obj);
      else tc.detach();
    }
    if (attached.startsWith('fixture:') && !dragging) {
      const f = m.find((x) => x.id === attached.split(':')[1]);
      const o = f && (overrides.get(f.id) ?? f);
      if (o) {
        proxy.position.set(o.x, o.height, -o.y);
        proxy.rotation.set(0, THREE.MathUtils.degToRad(o.rotation), 0);
      }
    }
    const cfgKey = `${tl}|${p.grid}`;
    if (cfgKey !== gizmoCfg) {
      gizmoCfg = cfgKey;
      tc.setMode(tl);
      tc.showX = tc.showZ = tl === 'translate';
      tc.setTranslationSnap(p.grid || null);
      tc.setRotationSnap(p.grid ? THREE.MathUtils.degToRad(ROTATION_SNAP_DEG) : null);
    }
    // Beam's-eye view: the camera rides just ahead of the lens along the beam axis (orbit disabled meanwhile).
    const followed = fid ? m.find((f) => f.id === fid) : undefined;
    controls.enabled = !followed && !dragging;
    controls.autoRotate = spin && !followed && !dragging;
    controls.autoRotateSpeed = 0.8;
    if (followed) {
      const d = beamDirection(followed);
      const dir = new THREE.Vector3(d.x, d.y, d.z);
      camera.position.set(followed.x, followed.height, -followed.y).addScaledVector(dir, 0.45);
      camera.lookAt(camera.position.clone().addScaledVector(dir, 10));
      anim = null;
    } else controls.update();
    if (bloom.enabled) composer.render();
    else renderer.render(scene, camera);
    if (wantCapture) {
      // Read back in the same task as the render: the drawing buffer is not preserved afterwards.
      wantCapture = false;
      download(renderer.domElement.toDataURL('image/png'), `scene-${stamp()}.png`);
    }
    frames++;
    if (now - fpsStart > 1000) {
      const rate = (frames * 1000) / (now - fpsStart);
      // Adaptive shadow budget: fewer lights below 30 i/s, more above 50 i/s (at most one step every 3 s).
      if (p.real && now - budgetAt > 3000) {
        const n = real.budget;
        if (rate < 30 && n > LIGHT_BUDGET.min) { real.setBudget(n - LIGHT_BUDGET.step); budgetAt = now; }
        else if (rate > 50 && n < LIGHT_BUDGET.max) { real.setBudget(n + LIGHT_BUDGET.step); budgetAt = now; }
      }
      setLights(p.real ? real.budget : 0);
      setShadows(real.shadows);
      setFps(Math.round(rate));
      frames = 0;
      fpsStart = now;
    }
    raf = requestAnimationFrame(loop);
  };
  loop();

  const dispose = () => {
    cancelAnimationFrame(raf);
    if (recorder?.state === 'recording') recorder.stop();
    ro.disconnect();
    tc.detach();
    tc.dispose();
    controls.dispose();
    renderer.domElement.removeEventListener('pointerdown', onDown);
    renderer.domElement.removeEventListener('pointerup', onUp);
    renderer.domElement.removeEventListener('pointermove', onMove);
    renderer.domElement.removeEventListener('pointerleave', onLeave);
    renderer.domElement.removeEventListener('contextmenu', onContext);
    for (const r of rigs.values()) disposeRig(r, scene);
    if (env) disposeGroup(env);
    if (fog) disposeGroup(fog);
    if (floorGroup) disposeReflector(floorGroup);
    for (const r of performers.values()) disposeGroup(r.group);
    for (const r of screens.values()) disposeScreen(r);
    real.dispose();
    disposeTextures();
    disposeGeometries();
    composer.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
  return { api, dispose };
}
