import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useStore } from '../store';
import { useResolved } from '../components/ui';
import { buildVisualModel, type VisualFixture } from '../../core/visualizer/model';
import type { FixtureValues } from '../../core/model/schemas';

/**
 * 3D stage view (three.js) fed by the same renderer-agnostic VisualFixture model as the 2D canvas.
 * Beams are translucent additive cones sized from the profile beam angle and aimed by pan/tilt.
 * It is a visual aid, NOT a photometric simulation (no real light falloff, gobos or shadows).
 *
 * World axes: x = stage left/right, y = height, z = towards the audience (stage depth goes to -z).
 */
const DOWN = new THREE.Vector3(0, -1, 0);
const PAR_TILT_DEG = 35; // fixed fixtures are drawn aimed down-stage

function beamDirection(f: VisualFixture): THREE.Vector3 {
  const tilt = THREE.MathUtils.degToRad(f.movable ? f.tiltDeg : PAR_TILT_DEG);
  const pan = THREE.MathUtils.degToRad(f.rotation + (f.movable ? f.panDeg : 0));
  return new THREE.Vector3(Math.sin(tilt) * Math.sin(pan), -Math.cos(tilt), Math.sin(tilt) * Math.cos(pan)).normalize();
}

interface FixtureObjects {
  root: THREE.Group;
  body: THREE.Mesh;
  beam: THREE.Mesh;
  cells: THREE.Mesh[];
}

function makeFixture(f: VisualFixture): FixtureObjects {
  const root = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1b2130, roughness: 0.6, metalness: 0.3 });
  const body = f.movable
    ? new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.32, 20), bodyMat)
    : f.cells.length
      ? new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.6, f.cells.length * 0.18), 0.1, 0.12), bodyMat)
      : new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.22, 16), bodyMat);
  body.userData.fixtureId = f.id;
  root.add(body);
  const cells = f.cells.map((_, i) => {
    const w = Math.max(0.6, f.cells.length * 0.18) / f.cells.length;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, 0.02, 0.1), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    m.position.set(-((f.cells.length - 1) * w) / 2 + i * w, -0.06, 0);
    root.add(m);
    return m;
  });
  const beamGeo = new THREE.ConeGeometry(1, 1, 32, 1, true);
  beamGeo.translate(0, -0.5, 0); // apex at the origin, opening towards -y
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  root.add(beam);
  return { root, body, beam, cells };
}

function updateFixture(o: FixtureObjects, f: VisualFixture, selected: boolean, dimmed: boolean): void {
  o.root.position.set(f.x, f.height, -f.y);
  const dir = beamDirection(f);
  // Beam reaches the floor (capped), cone radius from the beam angle.
  const length = Math.min(30, f.height / Math.max(0.15, -dir.y));
  const radius = length * Math.tan(THREE.MathUtils.degToRad(f.beamAngle / 2));
  o.beam.scale.set(radius, length, radius);
  o.beam.quaternion.setFromUnitVectors(DOWN, dir);
  const mat = o.beam.material as THREE.MeshBasicMaterial;
  mat.color.set(f.color);
  mat.opacity = f.intensity > 0.01 ? (0.04 + 0.32 * f.intensity) * (dimmed ? 0.3 : 1) : 0;
  o.beam.visible = mat.opacity > 0;
  if (f.movable) o.body.quaternion.setFromUnitVectors(DOWN, dir);
  (o.body.material as THREE.MeshStandardMaterial).emissive.set(selected ? 0x8b5cf6 : 0x000000);
  f.cells.forEach((c, i) => (o.cells[i]?.material as THREE.MeshBasicMaterial | undefined)?.color.set(c));
}

export function Stage3D({ values, groupFilter }: { values?: FixtureValues; groupFilter?: string | null }) {
  const host = useRef<HTMLDivElement>(null);
  const live = useStore((s) => s.values);
  const project = useStore((s) => s.project!.project);
  const selection = useStore((s) => s.selection);
  const { fixtures } = useResolved();
  const model = useMemo(() => buildVisualModel(fixtures, values ?? live), [fixtures, values, live]);
  const [error, setError] = useState<string | null>(null);
  const ctx = useRef<{ scene: THREE.Scene; objects: Map<string, FixtureObjects>; stage: THREE.Group } | null>(null);
  const latest = useRef({ model, selection, group: groupFilter });
  latest.current = { model, selection, group: groupFilter };

  // One-time three.js setup.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (err) {
      setError(`WebGL indisponible : ${(err as Error).message}`);
      return;
    }
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07080c);
    scene.add(new THREE.HemisphereLight(0x8090b0, 0x101018, 0.6));
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    camera.position.set(0, 7, 14);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.5, -3);
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.update();
    const stage = new THREE.Group();
    scene.add(stage);
    const objects = new Map<string, FixtureObjects>();
    ctx.current = { scene, objects, stage };

    const resize = () => {
      const r = el.getBoundingClientRect();
      renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = Math.max(1, r.width) / Math.max(1, r.height);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // Click to select a fixture body.
    const ray = new THREE.Raycaster();
    let downAt = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return; // orbit drag, not a click
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects([...objects.values()].map((o) => o.body))[0];
      const id = hit?.object.userData.fixtureId as string | undefined;
      const st = useStore.getState();
      if (!id) st.setSelection([]);
      else if (e.ctrlKey || e.shiftKey) st.setSelection(st.selection.includes(id) ? st.selection.filter((x) => x !== id) : [...st.selection, id]);
      else st.setSelection([id]);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    let raf = 0;
    const loop = () => {
      const { model: m, selection: sel, group } = latest.current;
      const g = group ? useStore.getState().project?.project.groups.find((x) => x.id === group) : null;
      const ids = new Set(m.map((f) => f.id));
      for (const [id, o] of objects) if (!ids.has(id)) { scene.remove(o.root); objects.delete(id); }
      for (const f of m) {
        let o = objects.get(f.id);
        if (!o || o.cells.length !== f.cells.length || (o.body.geometry.type === 'CylinderGeometry') !== (f.movable || !f.cells.length)) {
          if (o) scene.remove(o.root);
          o = makeFixture(f);
          objects.set(f.id, o);
          scene.add(o.root);
        }
        updateFixture(o, f, sel.includes(f.id), !!g && !g.fixtureIds.includes(f.id));
      }
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
      ctx.current = null;
    };
  }, []);

  // Stage floor, trusses and audience marker (rebuilt when the stage size or rig heights change).
  const heights = [...new Set(model.map((f) => Math.round(f.height * 10) / 10))].join(',');
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    c.stage.clear();
    const W = project.visualizer.stageWidth, D = project.visualizer.stageDepth;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, D), new THREE.MeshStandardMaterial({ color: 0x10141d, roughness: 0.9 }));
    floor.position.set(0, -0.05, -D / 2);
    c.stage.add(floor);
    const grid = new THREE.GridHelper(Math.max(W, D), Math.max(W, D), 0x283142, 0x1a2030);
    grid.position.set(0, 0.002, -D / 2);
    c.stage.add(grid);
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x5a6070, metalness: 0.7, roughness: 0.4 });
    for (const h of heights ? heights.split(',').map(Number) : []) {
      if (h <= 0.3) continue;
      for (const f of model.filter((x) => Math.round(x.height * 10) / 10 === h)) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 0.12), trussMat);
        bar.position.set(f.x, h + 0.2, -f.y);
        c.stage.add(bar);
      }
    }
    const audience = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.5), new THREE.MeshBasicMaterial({ color: 0x1a2235, side: THREE.DoubleSide }));
    audience.rotation.x = -Math.PI / 2;
    audience.position.set(0, 0.001, 1.2);
    c.stage.add(audience);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt on stage size / height set only, not every value frame
  }, [project.visualizer.stageWidth, project.visualizer.stageDepth, heights, fixtures]);

  if (error) return <div className="empty">{error}. Utilisez la vue 2D.</div>;
  return <div ref={host} className="canvas-wrap" style={{ height: '100%' }} data-testid="stage-3d" />;
}
