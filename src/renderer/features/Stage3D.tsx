import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Camera, CircleStop, Cloud, Crosshair, Expand, Eye, ImageDown, Move3d, Plus, Rotate3d, Sparkles, Tag, Sun, Trash2, TriangleAlert, Video, X } from 'lucide-react';
import { useStore } from '../store';
import { act, call, newId } from '../api';
import { NumberInput, useResolved } from '../components/ui';
import { buildVisualModel, type VisualFixture } from '../../core/visualizer/model';
import type { Fixture, FixtureMount, FixtureValues, Truss } from '../../core/model/schemas';
import { followTruss, hangHeight, nearestOnTruss, snapToTrusses } from '../../core/visualizer/truss';
import { audienceGlare, beamDirection, type StageGeometry } from '../../core/visualizer/beam';
import { buildRig, disposeRig, rigKey, updateRig, type Rig } from './stage3d/rig';
import { buildEnvironment, buildLowFog, disposeGroup, setLowFog, stageGeometry, trussObjectName } from './stage3d/environment';
import { disposeTextures } from './stage3d/textures';

/**
 * 3D stage preview (three.js) fed by the renderer-agnostic VisualFixture model.
 * Volumetric-looking beams, light pools with gobos on the floor and cyclorama, strobe flashes, prism facets and
 * per-cell beams for LED bars. A visual aid only: no photometry, shadows or real light transport.
 */

type ViewId = 'foh' | 'front' | 'top' | 'left' | 'right';
const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'foh', label: 'Régie' }, { id: 'front', label: 'Face' }, { id: 'top', label: 'Dessus' }, { id: 'left', label: 'Jardin' }, { id: 'right', label: 'Cour' },
];

/** `view`: a built-in camera id or the id of a view saved in the project. */
interface Prefs { haze: number; glow: boolean; pools: boolean; labels: boolean; smoke: boolean; view: string; grid: number }
const DEFAULT_PREFS: Prefs = { haze: 0.55, glow: true, pools: true, labels: false, smoke: false, view: 'foh', grid: 0.25 };
/** Editor grid steps in meters (0 = free); rotations snap to 15° whenever a grid is on. */
const GRIDS = [0, 0.25, 0.5, 1];
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
function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem('luma.stage3d') ?? '{}') as Partial<Prefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}
function savePrefs(p: Prefs): void {
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

const MOUNTS: { id: FixtureMount; label: string }[] = [
  { id: 'auto', label: 'Auto (hauteur)' }, { id: 'hanging', label: 'Suspendu' }, { id: 'floor', label: 'Posé au sol' }, { id: 'wall', label: 'Mural' },
];

/** Hangs a fixture on a truss at the closest point of the truss to its current position. */
function hangOn(fixture: Fixture, t: Truss): void {
  const p = nearestOnTruss(t, fixture.position.x, fixture.position.y);
  void act({
    type: 'fixture.update', id: fixture.id,
    patch: { trussId: t.id, position: { x: r2(p.x), y: r2(p.y) }, height: r2(hangHeight(t)), ...(fixture.mount === 'floor' || fixture.mount === 'wall' ? { mount: 'hanging' as const } : {}) },
  });
}

function MountFields({ fixture, trusses }: { fixture: Fixture; trusses: readonly Truss[] }) {
  const update = (patch: Partial<Pick<Fixture, 'mount' | 'mountTilt' | 'trussId'>>) => void act({ type: 'fixture.update', id: fixture.id, patch });
  return (
    <div className="grid g2" style={{ gap: 6 }}>
      <label className="field"><span className="small muted">Accroche</span>
        <select className="select" value={fixture.mount ?? 'auto'} onChange={(e) => update({ mount: e.target.value as FixtureMount })} data-testid="mount">
          {MOUNTS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </label>
      <label className="field" title="Inclinaison de l’accroche : vers la salle (mural : vers le bas)"><span className="small muted">Inclinaison (°)</span>
        <NumberInput value={fixture.mountTilt ?? 0} min={-90} max={90} onChange={(v) => update({ mountTilt: v })} />
      </label>
      <label className="field" style={{ gridColumn: 'span 2' }}><span className="small muted">Structure</span>
        <select className="select" value={fixture.trussId ?? ''} data-testid="fixture-truss" onChange={(e) => {
          const t = trusses.find((x) => x.id === e.target.value);
          if (t) hangOn(fixture, t);
          else update({ trussId: null });
        }}>
          <option value="">{trusses.length ? 'Aucune (position libre)' : 'Aucune structure définie'}</option>
          {trusses.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
    </div>
  );
}

function TrussPanel({ t, trusses }: { t: Truss; trusses: readonly Truss[] }) {
  const shape = t.shape === 'line' ? 'Droite' : t.shape === 'circle' ? 'Cercle' : 'Carré';
  return (
    <div className="stage3d-panel" data-testid="stage3d-truss">
      <div className="row between"><b>{t.name}</b><span className="badge">{shape}</span></div>
      <div className="small muted">X {t.x.toFixed(2)} m · Y {t.y.toFixed(2)} m · H {t.height.toFixed(2)} m · {t.rotation.toFixed(0)}°</div>
      <div className="small muted">{t.shape === 'circle' ? 'Diamètre' : t.shape === 'square' ? 'Côté' : 'Longueur'} {t.length} m · {t.support === 'towers' ? 'sur pieds' : 'suspendue (moteurs)'}</div>
      <button className="btn sm" title="Supprimer la structure (les projecteurs restent en place, décrochés)" onClick={() => void act({ type: 'project.update', visualizer: { trusses: trusses.filter((x) => x.id !== t.id) } })}><Trash2 size={12} />Supprimer</button>
    </div>
  );
}

function InfoPanel({ f, fixture, trusses, following, onFollow }: { f: VisualFixture; fixture: Fixture | undefined; trusses: readonly Truss[]; following: boolean; onFollow: () => void }) {
  return (
    <div className="stage3d-panel" data-testid="stage3d-info">
      <div className="row between"><b>{f.name}</b><span className="badge">{f.type}</span></div>
      <div className="row small"><span className="swatch-btn" style={{ width: 16, height: 16, background: f.color }} />{f.color.toUpperCase()} · {Math.round(f.intensity * 100)} %</div>
      {f.movable && <div className="small muted">Pan {f.panDeg.toFixed(0)}° · Tilt {f.tiltDeg.toFixed(0)}°</div>}
      <div className="small muted">Faisceau {f.beamAngle.toFixed(0)}°{f.strobeHz ? ` · strobe ≈ ${f.strobeHz.toFixed(1)} Hz` : ''}{f.gobo ? ` · gobo ${f.gobo}` : ''}{f.prism ? ' · prisme' : ''}{f.cells.length ? ` · ${f.cells.length} cellules` : ''}</div>
      <div className="grid g2" style={{ gap: 6 }}>
        <label className="field"><span className="small muted">Hauteur (m)</span><NumberInput value={f.height} min={0} max={50} step={0.1} onChange={(v) => void act({ type: 'fixture.update', id: f.id, patch: { height: v } })} /></label>
        <label className="field"><span className="small muted">Rotation (°)</span><NumberInput value={f.rotation} min={-360} max={360} onChange={(v) => void act({ type: 'fixture.update', id: f.id, patch: { rotation: v } })} /></label>
      </div>
      {fixture && <MountFields fixture={fixture} trusses={trusses} />}
      <span className="small dim">{f.mount === 'floor' ? 'Posé au sol (faisceau vers le haut)' : f.mount === 'wall' ? 'Mural (faisceau vers l’avant)' : 'Suspendu (faisceau vers le bas)'}{(fixture?.mount ?? 'auto') === 'auto' ? ' — auto : au sol sous 1 m' : ''}</span>
      <button className={`btn sm ${following ? 'on' : ''}`} onClick={onFollow} data-testid="beam-view" title="Placer la caméra dans l’axe du faisceau pour régler un focus"><Crosshair size={12} />{following ? 'Quitter la vue projecteur' : 'Vue projecteur'}</button>
    </div>
  );
}

export function Stage3D({ values, groupFilter }: { values?: FixtureValues; groupFilter?: string | null }) {
  const wrap = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const live = useStore((s) => s.values);
  const project = useStore((s) => s.project!.project);
  const selection = useStore((s) => s.selection);
  const { fixtures } = useResolved();
  const model = useMemo(() => buildVisualModel(fixtures, values ?? live), [fixtures, values, live]);
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [hover, setHover] = useState<{ x: number; y: number; f: VisualFixture } | null>(null);
  const setPrefs = (p: Partial<Prefs>) => setPrefsState((cur) => { const n = { ...cur, ...p }; savePrefs(n); return n; });

  const vis = project.visualizer;
  const stage = useMemo(() => stageGeometry(vis, model), [vis, model]);
  const glare = useMemo(() => audienceGlare(model, stage), [model, stage]);
  const [follow, setFollow] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [edit, setEdit] = useState(false);
  const [tool, setTool] = useState<'translate' | 'rotate'>('translate');
  const [selTruss, setSelTruss] = useState<string | null>(null);
  const [dims, setDims] = useState<string | null>(null);
  const latest = useRef({ model, selection, groupFilter, prefs, stage, vis, follow, edit, tool, selTruss });
  latest.current = { model, selection, groupFilter, prefs, stage, vis, follow, edit, tool, selTruss };
  const api = useRef<{
    goTo: (v: string) => void;
    pose: () => { pos: THREE.Vector3; target: THREE.Vector3 };
    capture: () => void;
    record: (on: boolean) => void;
    setBloom: (on: boolean) => void;
  } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (err) {
      setError(`WebGL indisponible : ${(err as Error).message}`);
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05060a);
    scene.fog = new THREE.Fog(0x05060a, 30, 70);
    scene.add(new THREE.HemisphereLight(0x8899bb, 0x0b0d14, 0.5));
    const key = new THREE.DirectionalLight(0xb8c4ff, 0.35);
    key.position.set(-6, 12, 10);
    scene.add(key);
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
    const editedTruss = (): { before: Truss; after: Truss } | null => {
      const id = attached.startsWith('truss:') ? attached.split(':')[1]! : null;
      const before = id ? latest.current.vis.trusses.find((t) => t.id === id) : undefined;
      const obj = tc.object;
      if (!before || !obj) return null;
      const p = placementOf(obj);
      return { before, after: { ...before, x: p.x, y: p.y, height: r2(clamp(p.height, 0.5, 30)), rotation: p.rotation } };
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
      } else {
        const tr = editedTruss();
        if (!tr) return;
        // Hung fixtures ride along with the truss while it moves.
        for (const f of useStore.getState().project?.project.patch ?? []) {
          if (f.trussId !== tr.before.id) continue;
          const n = followTruss(tr.before, tr.after, f);
          overrides.set(f.id, { x: n.position.x, y: n.position.y, height: n.height, rotation: n.rotation });
        }
        setDims(describe({ ...p, height: tr.after.height }));
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
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.12);
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
    const pickTruss = (cx: number, cy: number): string | undefined => {
      if (!env) return undefined;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
      return ray.intersectObject(env, true).find((h) => h.object.userData.trussId)?.object.userData.trussId as string | undefined;
    };
    const onUp = (e: PointerEvent) => {
      if (e.button !== 0 || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return;
      if (tc.axis !== null || dragging) return; // click on the gizmo
      const id = pick(e.clientX, e.clientY);
      const st = useStore.getState();
      const trussId = !id && latest.current.edit ? pickTruss(e.clientX, e.clientY) : undefined;
      setSelTruss(trussId ?? null);
      if (trussId) st.setSelection([]);
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
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerleave', onLeave);

    let wantCapture = false;
    let recorder: MediaRecorder | null = null;
    api.current = {
      goTo: (v) => goTo(v),
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
    };

    let raf = 0;
    let frames = 0;
    let fpsStart = performance.now();
    const t0 = performance.now();
    const loop = () => {
      const now = performance.now();
      const { model: m, selection: sel, groupFilter: gf, prefs: p, stage: st, vis: cfg, follow: fid, edit: editing, tool: tl, selTruss: selT } = latest.current;
      // Environment follows the stage layout, stage points, explicit trusses and the rows of unattached hung fixtures.
      const k = `${JSON.stringify(st)}|${JSON.stringify(cfg.markers)}|${JSON.stringify(cfg.trusses)}|${editing ? selT : ''}|${m.filter((f) => f.mount === 'hanging' && !f.trussId).map((f) => `${f.x.toFixed(1)},${f.y.toFixed(1)},${f.height.toFixed(1)}`).join(';')}`;
      if (k !== envKey) {
        if (env) { scene.remove(env); disposeGroup(env); }
        if (fog) { scene.remove(fog); disposeGroup(fog); }
        env = buildEnvironment(st, m, cfg.markers, cfg.trusses, editing ? selT : null);
        fog = buildLowFog(st);
        scene.add(env, fog);
        envKey = k;
      }
      if (fog) setLowFog(fog, (now - t0) / 1000, p.smoke ? 0.25 + 0.5 * p.haze : 0);
      const group = gf ? useStore.getState().project?.project.groups.find((g) => g.id === gf) : null;
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
        updateRig(r, o ? { ...f, ...o } : f, { time: (now - t0) / 1000, haze: p.haze, pools: p.pools, labels: p.labels, selected: sel.includes(f.id), dimmed: !!group && !group.fixtureIds.includes(f.id), stage: st });
      }
      if (anim) {
        const k2 = Math.min(1, (now - anim.start) / 700);
        const e = k2 < 0.5 ? 2 * k2 * k2 : 1 - (-2 * k2 + 2) ** 2 / 2;
        camera.position.lerpVectors(anim.from, anim.to, e);
        controls.target.lerpVectors(anim.tFrom, anim.tTo, e);
        if (k2 >= 1) anim = null;
      }
      // Gizmo target: the selected truss, else the single selected fixture (edit mode only).
      const target = !editing || fid ? '' : selT ? `truss:${selT}:${env?.uuid}` : sel.length === 1 && m.some((f) => f.id === sel[0]) ? `fixture:${sel[0]}` : '';
      if (target !== attached && !dragging) {
        attached = target;
        const obj = target.startsWith('truss:') ? env?.getObjectByName(trussObjectName(selT!)) : target ? proxy : undefined;
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
        setFps(Math.round((frames * 1000) / (now - fpsStart)));
        frames = 0;
        fpsStart = now;
      }
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
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
      for (const r of rigs.values()) disposeRig(r, scene);
      if (env) disposeGroup(env);
      if (fog) disposeGroup(fog);
      disposeTextures();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, []);

  useEffect(() => api.current?.setBloom(prefs.glow), [prefs.glow]);

  const selected = selection.length === 1 ? model.find((f) => f.id === selection[0]) : undefined;
  const selectedTruss = edit && selTruss ? vis.trusses.find((t) => t.id === selTruss) : undefined;
  const pickView = (id: string) => { setFollow(null); setPrefs({ view: id }); api.current?.goTo(id); };
  const saveView = () => {
    const pose = api.current?.pose();
    if (!pose) return;
    const r = (v: THREE.Vector3) => ({ x: Math.round(v.x * 100) / 100, y: Math.round(v.y * 100) / 100, z: Math.round(v.z * 100) / 100 });
    const view = { id: newId(), name: `Vue ${vis.views.length + 1}`, pos: r(pose.pos), target: r(pose.target) };
    void act({ type: 'project.update', visualizer: { views: [...vis.views, view] } });
    setPrefs({ view: view.id });
  };
  const deleteView = (id: string) => void act({ type: 'project.update', visualizer: { views: vis.views.filter((v) => v.id !== id) } });
  const toggleRecord = () => { api.current?.record(!recording); setRecording(!recording); };
  const fullscreen = () => {
    const el = wrap.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen().catch(() => undefined);
  };

  if (error) return <div className="empty">{error}. Utilisez la vue 2D.</div>;
  return (
    <div ref={wrap} className="canvas-wrap stage3d" style={{ height: '100%' }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} data-testid="stage-3d" />
      <div className="stage3d-toolbar">
        <div className="chips" role="group" aria-label="Caméras">
          <Camera size={14} className="dim" />
          {VIEWS.map((v) => (
            <button key={v.id} className={`chip ${prefs.view === v.id && !follow ? 'on' : ''}`} data-testid={`cam-${v.id}`} onClick={() => pickView(v.id)}>{v.label}</button>
          ))}
          {vis.views.map((v) => (
            <span key={v.id} className={`chip ${prefs.view === v.id && !follow ? 'on' : ''}`} data-testid="cam-saved">
              <button className="chip-link" onClick={() => pickView(v.id)}>{v.name}</button>
              <button className="chip-link" onClick={() => deleteView(v.id)} title={`Supprimer « ${v.name} »`} aria-label={`Supprimer la vue ${v.name}`}><X size={10} /></button>
            </span>
          ))}
          {vis.views.length < 20 && <button className="chip" onClick={saveView} title="Enregistrer le point de vue actuel dans le projet" data-testid="cam-save"><Plus size={12} /></button>}
        </div>
        {glare.length > 0 && (
          <span className="badge warn" data-testid="glare" title={`Faisceau à hauteur des yeux du public : ${glare.map((f) => f.name).join(', ')}. Estimation sur l’axe du faisceau.`}>
            <TriangleAlert size={12} /> Éblouissement public : {glare.length}
          </span>
        )}
        <div className="grow" />
        <label className="row small" title="Densité de brume : visibilité des faisceaux dans l’air">
          <Sun size={13} className="dim" />Brume
          <input type="range" min={0} max={100} value={Math.round(prefs.haze * 100)} style={{ width: 90 }} onChange={(e) => setPrefs({ haze: Number(e.target.value) / 100 })} data-testid="haze" />
        </label>
        <button className={`chip ${prefs.glow ? 'on' : ''}`} onClick={() => setPrefs({ glow: !prefs.glow })} title="Halo lumineux (bloom)"><Sparkles size={12} /> Glow</button>
        <button className={`chip ${prefs.pools ? 'on' : ''}`} onClick={() => setPrefs({ pools: !prefs.pools })} title="Taches de lumière et gobos au sol et sur le cyclorama"><Eye size={12} /> Taches</button>
        <button className={`chip ${prefs.smoke ? 'on' : ''}`} onClick={() => setPrefs({ smoke: !prefs.smoke })} title="Fumée lourde au sol" data-testid="smoke"><Cloud size={12} /> Fumée</button>
        <button className={`chip ${prefs.labels ? 'on' : ''}`} onClick={() => setPrefs({ labels: !prefs.labels })} title="Noms des projecteurs"><Tag size={12} /> Noms</button>
        <button className={`chip ${edit ? 'on' : ''}`} onClick={() => { setEdit(!edit); setSelTruss(null); }} title="Édition directe : déplacer et pivoter projecteurs et structures" data-testid="edit3d"><Move3d size={12} /> Éditer</button>
        {edit && (
          <>
            <div className="chips" role="group" aria-label="Outil">
              <button className={`chip ${tool === 'translate' ? 'on' : ''}`} onClick={() => setTool('translate')} title="Déplacer (et monter / descendre)" data-testid="tool-move"><Move3d size={12} /></button>
              <button className={`chip ${tool === 'rotate' ? 'on' : ''}`} onClick={() => setTool('rotate')} title="Pivoter autour de la verticale" data-testid="tool-rotate"><Rotate3d size={12} /></button>
            </div>
            <label className="row small" title="Aimantation à la grille (et rotations par 15°)">Grille
              <select className="select" style={{ width: 82, height: 26 }} value={prefs.grid} onChange={(e) => setPrefs({ grid: Number(e.target.value) })} data-testid="grid">
                {GRIDS.map((g) => <option key={g} value={g}>{g ? `${String(g).replace('.', ',')} m` : 'Libre'}</option>)}
              </select>
            </label>
          </>
        )}
        <button className="chip" onClick={() => api.current?.capture()} title="Capture d’image (PNG)" data-testid="capture"><ImageDown size={12} /></button>
        <button className={`chip ${recording ? 'on' : ''}`} onClick={toggleRecord} title={recording ? 'Arrêter l’enregistrement' : 'Enregistrer une vidéo de la vue (WebM)'} data-testid="record">{recording ? <CircleStop size={12} /> : <Video size={12} />}</button>
        <button className="chip" onClick={fullscreen} title="Plein écran (Échap pour sortir)"><Expand size={12} /></button>
        <span className="mono small dim" data-testid="fps">{fps} i/s</span>
      </div>
      {hover && (
        <div className="stage3d-tip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <b>{hover.f.name}</b>
          <span className="small muted">{Math.round(hover.f.intensity * 100)} % · {hover.f.color.toUpperCase()}{hover.f.movable ? ` · P ${hover.f.panDeg.toFixed(0)}° T ${hover.f.tiltDeg.toFixed(0)}°` : ''}</span>
        </div>
      )}
      {dims && <div className="stage3d-dims mono small" data-testid="dims">{dims}</div>}
      {selectedTruss && <TrussPanel t={selectedTruss} trusses={vis.trusses} />}
      {selected && !selectedTruss && (
        <InfoPanel f={selected} fixture={project.patch.find((x) => x.id === selected.id)} trusses={vis.trusses} following={follow === selected.id} onFollow={() => setFollow(follow === selected.id ? null : selected.id)} />
      )}
      <div className="stage3d-hint small dim">{edit ? 'Édition : cliquer un projecteur ou une structure, puis tirer les flèches du gizmo · Ctrl+Z : annuler' : 'Glisser : orbite · clic droit : déplacer · molette : zoom · clic : sélection · aperçu non photométrique'}</div>
    </div>
  );
}

