import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Camera, Expand, Eye, Sparkles, Tag, Sun } from 'lucide-react';
import { useStore } from '../store';
import { act } from '../api';
import { NumberInput, useResolved } from '../components/ui';
import { buildVisualModel, type VisualFixture } from '../../core/visualizer/model';
import type { FixtureValues } from '../../core/model/schemas';
import { buildRig, disposeRig, rigKey, updateRig, type Rig } from './stage3d/rig';
import { buildEnvironment, disposeGroup, stageGeometry } from './stage3d/environment';
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

interface Prefs { haze: number; glow: boolean; pools: boolean; labels: boolean; view: ViewId }
const DEFAULT_PREFS: Prefs = { haze: 0.55, glow: true, pools: true, labels: false, view: 'foh' };
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

function viewPose(id: ViewId, W: number, D: number, H: number): { pos: THREE.Vector3; target: THREE.Vector3 } {
  const span = Math.max(W, D);
  const target = new THREE.Vector3(0, Math.min(2, H / 3), -D / 2);
  switch (id) {
    case 'front': return { pos: new THREE.Vector3(0, 1.7, span * 0.9), target };
    case 'top': return { pos: new THREE.Vector3(0, span * 1.6, -D / 2 + 0.01), target: new THREE.Vector3(0, 0, -D / 2) };
    case 'left': return { pos: new THREE.Vector3(-span * 1.1, H * 0.6, -D / 2), target };
    case 'right': return { pos: new THREE.Vector3(span * 1.1, H * 0.6, -D / 2), target };
    default: return { pos: new THREE.Vector3(0, H * 0.75, span * 1.25), target };
  }
}


function InfoPanel({ f }: { f: VisualFixture }) {
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
      <span className="small dim">{f.mount === 'floor' ? 'Posé au sol (faisceau vers le haut)' : 'Accroché (faisceau vers le bas)'} — seuil 1 m</span>
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

  const W = project.visualizer.stageWidth, D = project.visualizer.stageDepth;
  const stage = useMemo(() => stageGeometry(W, D, model), [W, D, model]);
  const latest = useRef({ model, selection, groupFilter, prefs, stage });
  latest.current = { model, selection, groupFilter, prefs, stage };
  const api = useRef<{ goTo: (v: ViewId) => void; rebuildEnv: () => void; setBloom: (on: boolean) => void } | null>(null);

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

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.12);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    bloom.enabled = latest.current.prefs.glow;

    let env: THREE.Group | null = null;
    let envKey = '';
    const rigs = new Map<string, Rig>();

    // Camera transitions.
    let anim: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; start: number } | null = null;
    const goTo = (v: ViewId, instant = false) => {
      const st = latest.current.stage;
      const pose = viewPose(v, st.width, st.depth, st.wallHeight);
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
    const onUp = (e: PointerEvent) => {
      if (e.button !== 0 || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return;
      const id = pick(e.clientX, e.clientY);
      const st = useStore.getState();
      if (!id) st.setSelection([]);
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

    api.current = {
      goTo: (v) => goTo(v),
      rebuildEnv: () => { envKey = ''; },
      setBloom: (on) => { bloom.enabled = on; },
    };

    let raf = 0;
    let frames = 0;
    let fpsStart = performance.now();
    const t0 = performance.now();
    const loop = () => {
      const now = performance.now();
      const { model: m, selection: sel, groupFilter: gf, prefs: p, stage: st } = latest.current;
      // Environment follows the stage size and truss rows.
      const k = `${st.width}|${st.depth}|${st.wallHeight}|${m.filter((f) => f.mount === 'hanging').map((f) => `${f.x.toFixed(1)},${f.y.toFixed(1)},${f.height.toFixed(1)}`).join(';')}`;
      if (k !== envKey) {
        if (env) { scene.remove(env); disposeGroup(env); }
        env = buildEnvironment(st, m);
        scene.add(env);
        envKey = k;
      }
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
        updateRig(r, f, { time: (now - t0) / 1000, haze: p.haze, pools: p.pools, labels: p.labels, selected: sel.includes(f.id), dimmed: !!group && !group.fixtureIds.includes(f.id), stage: st });
      }
      if (anim) {
        const k2 = Math.min(1, (now - anim.start) / 700);
        const e = k2 < 0.5 ? 2 * k2 * k2 : 1 - (-2 * k2 + 2) ** 2 / 2;
        camera.position.lerpVectors(anim.from, anim.to, e);
        controls.target.lerpVectors(anim.tFrom, anim.tTo, e);
        if (k2 >= 1) anim = null;
      }
      controls.update();
      if (bloom.enabled) composer.render();
      else renderer.render(scene, camera);
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
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      for (const r of rigs.values()) disposeRig(r, scene);
      if (env) disposeGroup(env);
      disposeTextures();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, []);

  useEffect(() => api.current?.setBloom(prefs.glow), [prefs.glow]);

  const selected = selection.length === 1 ? model.find((f) => f.id === selection[0]) : undefined;
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
            <button key={v.id} className={`chip ${prefs.view === v.id ? 'on' : ''}`} data-testid={`cam-${v.id}`} onClick={() => { setPrefs({ view: v.id }); api.current?.goTo(v.id); }}>{v.label}</button>
          ))}
        </div>
        <div className="grow" />
        <label className="row small" title="Densité de brume : visibilité des faisceaux dans l’air">
          <Sun size={13} className="dim" />Brume
          <input type="range" min={0} max={100} value={Math.round(prefs.haze * 100)} style={{ width: 90 }} onChange={(e) => setPrefs({ haze: Number(e.target.value) / 100 })} data-testid="haze" />
        </label>
        <button className={`chip ${prefs.glow ? 'on' : ''}`} onClick={() => setPrefs({ glow: !prefs.glow })} title="Halo lumineux (bloom)"><Sparkles size={12} /> Glow</button>
        <button className={`chip ${prefs.pools ? 'on' : ''}`} onClick={() => setPrefs({ pools: !prefs.pools })} title="Taches de lumière et gobos au sol et sur le cyclorama"><Eye size={12} /> Taches</button>
        <button className={`chip ${prefs.labels ? 'on' : ''}`} onClick={() => setPrefs({ labels: !prefs.labels })} title="Noms des projecteurs"><Tag size={12} /> Noms</button>
        <button className="chip" onClick={fullscreen} title="Plein écran (Échap pour sortir)"><Expand size={12} /></button>
        <span className="mono small dim" data-testid="fps">{fps} i/s</span>
      </div>
      {hover && (
        <div className="stage3d-tip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <b>{hover.f.name}</b>
          <span className="small muted">{Math.round(hover.f.intensity * 100)} % · {hover.f.color.toUpperCase()}{hover.f.movable ? ` · P ${hover.f.panDeg.toFixed(0)}° T ${hover.f.tiltDeg.toFixed(0)}°` : ''}</span>
        </div>
      )}
      {selected && <InfoPanel f={selected} />}
      <div className="stage3d-hint small dim">Glisser : orbite · clic droit : déplacer · molette : zoom · clic : sélection · aperçu non photométrique</div>
    </div>
  );
}

