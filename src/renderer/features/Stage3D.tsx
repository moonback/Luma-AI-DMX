import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Camera, CircleStop, Cloud, Lightbulb, Link2, Moon, Crosshair, Copy, Expand, Eye, Focus, ImageDown, Move3d, Orbit, Plus, Presentation, Rotate3d, ScanEye, SlidersHorizontal, Sparkles, SunMedium, Tag, Sun, Trash2, TriangleAlert, Video, X } from 'lucide-react';
import { confirmAction, useStore } from '../store';
import { act, newId } from '../api';
import { useResolved } from '../components/ui';
import { useT } from '../i18n';
import { buildVisualModel, type VisualFixture } from '../../core/visualizer/model';
import type { Fixture, FixtureValues, Project } from '../../core/model/schemas';
import { audienceGlare } from '../../core/visualizer/beam';
import { stageGeometry } from './stage3d/environment';
import { AMBIENCES, FLOORS, LIGHT_BUDGET, type AmbienceId, type FloorId } from './stage3d/quality';
import { DARK_LEVEL, performerLight } from '../../core/visualizer/lighting';
import { acceptLibraryDrag, dropLibraryItem, duplicateSceneElement, hangFixture, removeSceneElement } from '../sceneActions';
import type { SceneRef } from '../../core/visualizer/sceneEdit';
import { GRIDS, VIEWS, loadPrefs, mountStage3D, savePrefs, type CtxTarget, type Prefs, type StageApi } from './stage3d/scene';

/** Edit-mode right-click menu on a fixture, a truss or a set piece. */
function ContextMenu({ ctx, model, vis, patch, onClose }: { ctx: { x: number; y: number; target: CtxTarget }; model: readonly VisualFixture[]; vis: Project['visualizer']; patch: readonly Fixture[]; onClose: () => void }) {
  const [hanging, setHanging] = useState(false);
  const t = ctx.target;
  const f = t.kind === 'fixture' ? model.find((x) => x.id === t.id) : undefined;
  const fixture = t.kind === 'fixture' ? patch.find((x) => x.id === t.id) : undefined;
  const truss = t.kind === 'truss' ? vis.trusses.find((x) => x.id === t.id) : undefined;
  const prop = t.kind === 'prop' ? vis.props.find((x) => x.id === t.id) : undefined;
  const at = f ? { x: f.x, y: f.y, height: f.height } : truss ? { x: truss.x, y: truss.y, height: truss.height } : prop ? { x: prop.x, y: prop.y, height: prop.elevation + prop.height / 2 } : null;
  if (!at) return null;
  const run = (fn: () => void) => () => { onClose(); fn(); };
  const duplicate = () => {
    if (t.kind !== 'fixture') duplicateSceneElement(t);
    else void act({ type: 'fixture.duplicate', ids: [t.id] }).then((r) => r && useStore.getState().setSelection(r.ids));
  };
  const remove = async () => {
    if (t.kind !== 'fixture') { removeSceneElement(t); return; }
    if (await confirmAction({ title: 'Supprimer le projecteur', message: `« ${f?.name ?? ''} » sera retiré du patch.`, confirmLabel: 'Supprimer' })) void act({ type: 'fixture.remove', ids: [t.id] });
  };
  return (
    <div className="stage3d-pop stage3d-ctx" role="menu" aria-label="Actions" data-testid="ctx-menu" style={{ left: ctx.x, top: ctx.y }} onPointerDown={(e) => e.stopPropagation()}>
      <b className="small">{f?.name ?? truss?.name ?? prop?.name}</b>
      <button role="menuitem" className="btn ghost sm" onClick={run(duplicate)} data-testid="ctx-duplicate"><Copy size={12} />Dupliquer</button>
      <button role="menuitem" className="btn ghost sm" onClick={run(() => void remove())} data-testid="ctx-delete"><Trash2 size={12} />Supprimer</button>
      {fixture && (
        <>
          <button role="menuitem" className="btn ghost sm" aria-expanded={hanging} disabled={!vis.trusses.length} onClick={() => setHanging(!hanging)} data-testid="ctx-hang"><Link2 size={12} />Accrocher à…</button>
          {hanging && (
            <div className="col" style={{ paddingLeft: 14, gap: 2 }}>
              {vis.trusses.map((x) => <button key={x.id} role="menuitem" className={`btn ghost sm ${fixture.trussId === x.id ? 'on' : ''}`} onClick={run(() => hangFixture(fixture, x))}>{x.name}</button>)}
              {fixture.trussId && <button role="menuitem" className="btn ghost sm" onClick={run(() => void act({ type: 'fixture.update', id: fixture.id, patch: { trussId: null } }))}>Décrocher</button>}
            </div>
          )}
        </>
      )}
      <button role="menuitem" className="btn ghost sm" onClick={run(() => useStore.getState().frameOn(at))} data-testid="ctx-frame"><Focus size={12} />Centrer la vue</button>
      {f && <button role="menuitem" className="btn ghost sm" onClick={run(() => useStore.getState().setBeamView(f.id))} data-testid="ctx-beam"><Crosshair size={12} />Vue projecteur</button>}
    </div>
  );
}

/**
 * 3D stage preview (three.js) fed by the renderer-agnostic VisualFixture model.
 * Volumetric-looking beams, light pools with gobos on the floor and cyclorama, strobe flashes, prism facets and
 * per-cell beams for LED bars. A visual aid only: no photometry, shadows or real light transport.
 */
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
  const dark = useMemo(() => vis.performers.filter((pf) => performerLight(pf, vis.markers, model, vis.props).level < DARK_LEVEL), [vis.performers, vis.markers, vis.props, model]);
  const follow = useStore((s) => s.beamView);
  const setFollow = useStore((s) => s.setBeamView);
  const frame = useStore((s) => s.frame);
  const [ctx, setCtx] = useState<{ x: number; y: number; target: SceneRef | { kind: 'fixture'; id: string } } | null>(null);
  const [recording, setRecording] = useState(false);
  const [edit, setEdit] = useState(false);
  const [tool, setTool] = useState<'translate' | 'rotate'>('translate');
  // The selected truss is the shared stage selection (scene panel, 2D plan, Ctrl+D / Suppr).
  const sceneSel = useStore((s) => s.sceneSel);
  const placing = useStore((s) => s.placing);
  // Truss or set piece selected: highlighted, and moved by the gizmo in edit mode.
  const selSet = sceneSel && (sceneSel.kind === 'truss' || sceneSel.kind === 'prop') ? sceneSel : null;
  const [dims, setDims] = useState<string | null>(null);
  const [lights, setLights] = useState(0);
  const [shadows, setShadows] = useState(0);
  const [menu, setMenu] = useState(false);
  const [spin, setSpin] = useState(false);
  const [solo, setSolo] = useState(false);
  const [bare, setBare] = useState(false);
  const t = useT();
  const latest = useRef({ model, selection, groupFilter, prefs, stage, vis, follow, edit, tool, selSet, spin, solo });
  latest.current = { model, selection, groupFilter, prefs, stage, vis, follow, edit, tool, selSet, spin, solo };
  const api = useRef<StageApi | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const mounted = mountStage3D(el, latest, { setError, setDims, setHover, setCtx, setLights, setShadows, setFps });
    if (!mounted) return;
    api.current = mounted.api;
    return () => {
      mounted.dispose();
      api.current = null;
    };
  }, []);

  useEffect(() => api.current?.setBloom(prefs.glow), [prefs.glow]);
  // Framing requested by a double-click on a card (an older request is ignored when the view mounts).
  const frameSeq = useRef(frame?.seq);
  useEffect(() => {
    if (!frame || frame.seq === frameSeq.current) return;
    frameSeq.current = frame.seq;
    setFollow(null);
    api.current?.frame(frame);
  }, [frame, setFollow]);
  useEffect(() => () => useStore.getState().setBeamView(null), []);
  useEffect(() => {
    if (!ctx) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtx(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctx]);
  useEffect(() => { if (!edit) setCtx(null); }, [edit]);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

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
  /** Frames the selected fixtures (their centre), or goes back to the current camera without a selection. */
  const frameSelection = () => {
    const sel = model.filter((f) => selection.includes(f.id));
    setFollow(null);
    if (!sel.length) { api.current?.goTo(prefs.view); return; }
    const avg = (k: 'x' | 'y' | 'height') => sel.reduce((s, f) => s + f[k], 0) / sel.length;
    api.current?.frame({ x: avg('x'), y: avg('y'), height: avg('height') });
  };
  // View shortcuts (no modifier, not while typing): 1–5 cameras, F frame, R orbit, I solo, H presentation.
  const keys = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keys.current = (e) => {
    const el = e.target as HTMLElement;
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return;
    const view = VIEWS[Number(e.key) - 1];
    const k = e.key.toLowerCase();
    if (view) pickView(view.id);
    else if (k === 'f') frameSelection();
    else if (k === 'r') setSpin((v) => !v);
    else if (k === 'i') setSolo((v) => !v);
    else if (k === 'h') setBare((v) => !v);
    else return;
    e.preventDefault();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
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
      <div ref={host} style={{ position: 'absolute', inset: 0, cursor: placing ? 'crosshair' : undefined }} onPointerDown={() => { setMenu(false); setCtx(null); }} onDragOver={acceptLibraryDrag} onDrop={(e) => dropLibraryItem(e, api.current?.groundAt(e.clientX, e.clientY) ?? null)} data-testid="stage-3d" />
      <div className="stage3d-vignette" aria-hidden />
      {bare && <button className="chip stage3d-unbare" onClick={() => setBare(false)} title={t('stage3d.presentExit')} aria-label={t('stage3d.presentExit')} data-testid="present-exit"><Presentation size={12} /></button>}
      {!bare && <div className="stage3d-toolbar">
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
          {vis.views.length < 20 && <button className="chip" onClick={saveView} title="Enregistrer le point de vue actuel dans le projet" aria-label="Enregistrer la vue" data-testid="cam-save"><Plus size={12} /></button>}
        </div>
        <div className="grow" />
        <div className="chips" role="group">
          <button className="chip" onClick={frameSelection} title={t('stage3d.frameSel')} aria-label={t('stage3d.frameSel')} data-testid="frame-sel"><Focus size={12} /></button>
          <button className={`chip ${spin ? 'on' : ''}`} onClick={() => setSpin(!spin)} title={t('stage3d.spinTitle')} aria-pressed={spin} data-testid="spin"><Orbit size={12} /> {t('stage3d.spin')}</button>
          <button className={`chip ${solo ? 'on' : ''}`} onClick={() => setSolo(!solo)} title={t('stage3d.soloTitle')} aria-pressed={solo} data-testid="solo"><ScanEye size={12} /> {t('stage3d.solo')}</button>
        </div>
        <span className="stage3d-sep" />
        <button className={`chip ${edit ? 'on' : ''}`} onClick={() => setEdit(!edit)} title="Édition directe : déplacer et pivoter projecteurs et structures" data-testid="edit3d"><Move3d size={12} /> Éditer</button>
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
        <span className="stage3d-sep" />
        <button className={`chip ${menu ? 'on' : ''}`} onClick={() => setMenu(!menu)} aria-expanded={menu} title="Brume, halo, taches, fumée, ombres, ambiance, sol, noms" data-testid="render-menu"><SlidersHorizontal size={12} /> Rendu</button>
        <button className="chip" onClick={() => api.current?.capture()} title="Capture d’image (PNG)" aria-label="Capture d’image" data-testid="capture"><ImageDown size={12} /></button>
        <button className={`chip ${recording ? 'on' : ''}`} onClick={toggleRecord} title={recording ? 'Arrêter l’enregistrement' : 'Enregistrer une vidéo de la vue (WebM)'} aria-label={recording ? 'Arrêter l’enregistrement' : 'Enregistrer une vidéo'} data-testid="record">{recording ? <CircleStop size={12} /> : <Video size={12} />}</button>
        <button className="chip" onClick={fullscreen} title="Plein écran (Échap pour sortir)" aria-label="Plein écran"><Expand size={12} /></button>
        <button className="chip" onClick={() => setBare(true)} title={t('stage3d.present')} aria-label={t('stage3d.present')} data-testid="present"><Presentation size={12} /></button>
        <span className={`stage3d-fps mono ${fps >= 45 ? 'ok' : fps >= 25 ? 'mid' : 'low'}`} data-testid="fps">{fps} i/s</span>
        {menu && (
          <div className="stage3d-pop" role="dialog" aria-label="Réglages de rendu" data-testid="render-pop">
            <label className="row small" title="Densité de brume : visibilité des faisceaux dans l’air">
              <Sun size={13} className="dim" /><span className="grow">Brume</span>
              <input type="range" min={0} max={100} value={Math.round(prefs.haze * 100)} style={{ width: 130 }} onChange={(e) => setPrefs({ haze: Number(e.target.value) / 100 })} data-testid="haze" />
            </label>
            <label className="row small" title={t('stage3d.exposureTitle')}>
              <SunMedium size={13} className="dim" /><span className="grow">{t('stage3d.exposure')}</span>
              <input type="range" min={40} max={200} value={Math.round(prefs.exposure * 100)} style={{ width: 130 }} onChange={(e) => setPrefs({ exposure: Number(e.target.value) / 100 })} onDoubleClick={() => setPrefs({ exposure: 1 })} data-testid="exposure" />
            </label>
            <div className="chips">
              <button className={`chip ${prefs.glow ? 'on' : ''}`} onClick={() => setPrefs({ glow: !prefs.glow })} title="Halo lumineux (bloom)"><Sparkles size={12} /> Glow</button>
              <button className={`chip ${prefs.pools ? 'on' : ''}`} onClick={() => setPrefs({ pools: !prefs.pools })} title="Taches de lumière et gobos au sol et sur le cyclorama"><Eye size={12} /> Taches</button>
              <button className={`chip ${prefs.smoke ? 'on' : ''}`} onClick={() => setPrefs({ smoke: !prefs.smoke })} title="Fumée lourde au sol" data-testid="smoke"><Cloud size={12} /> Fumée</button>
              <button className={`chip ${prefs.labels ? 'on' : ''}`} onClick={() => setPrefs({ labels: !prefs.labels })} title="Noms des projecteurs"><Tag size={12} /> Noms</button>
              <button className={`chip ${prefs.real ? 'on' : ''}`} onClick={() => setPrefs({ real: !prefs.real })} title={`Éclairage réel avec ombres : les projecteurs les plus intenses (budget adaptatif ${LIGHT_BUDGET.min}–${LIGHT_BUDGET.max} sources, dont ${shadows || 'jusqu’à'} ombrées selon la carte graphique)`} data-testid="real-lights"><Lightbulb size={12} /> Ombres{prefs.real && lights ? ` · ${lights}` : ''}</button>
            </div>
            <label className="row small"><span className="grow">Ambiance</span>
              <select className="select" style={{ width: 160, height: 26 }} value={prefs.ambience} onChange={(e) => setPrefs({ ambience: e.target.value as AmbienceId })} data-testid="ambience">
                {(Object.keys(AMBIENCES) as AmbienceId[]).map((id) => <option key={id} value={id}>{AMBIENCES[id].label}</option>)}
              </select>
            </label>
            <label className="row small" title="Laqué / mouillé : reflets (un rendu de plus)"><span className="grow">Sol</span>
              <select className="select" style={{ width: 160, height: 26 }} value={prefs.floor} onChange={(e) => setPrefs({ floor: e.target.value as FloorId })} data-testid="floor">
                {(Object.keys(FLOORS) as FloorId[]).map((id) => <option key={id} value={id}>{FLOORS[id]}</option>)}
              </select>
            </label>
          </div>
        )}
      </div>}
      {hover && (
        <div className="stage3d-tip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <b>{hover.f.name}</b>
          <span className="small muted">{Math.round(hover.f.intensity * 100)} % · {hover.f.color.toUpperCase()}{hover.f.movable ? ` · P ${hover.f.panDeg.toFixed(0)}° T ${hover.f.tiltDeg.toFixed(0)}°` : ''}</span>
        </div>
      )}
      {dims && <div className="stage3d-dims mono small" data-testid="dims">{dims}</div>}
      {ctx && <ContextMenu ctx={ctx} model={model} vis={vis} patch={project.patch} onClose={() => setCtx(null)} />}
      {!bare && <div className="stage3d-status">
        {(dark.length > 0 || glare.length > 0) && (
          <div className="row" style={{ gap: 6 }}>
            {dark.length > 0 && (
              <span className="badge warn" data-testid="dark" title={`Visage peu ou pas éclairé : ${dark.map((x) => x.name).join(', ')}. Estimation sans occultation.`}>
                <Moon size={12} /> Dans le noir : {dark.length}
              </span>
            )}
            {glare.length > 0 && (
              <span className="badge warn" data-testid="glare" title={`Faisceau à hauteur des yeux du public : ${glare.map((f) => f.name).join(', ')}. Estimation sur l’axe du faisceau.`}>
                <TriangleAlert size={12} /> Éblouissement public : {glare.length}
              </span>
            )}
          </div>
        )}
        <div className="small dim">{edit ? 'Édition : cliquer un projecteur ou une structure, puis tirer les flèches du gizmo · clic droit : menu · Ctrl+Z : annuler' : 'Glisser : orbite · clic droit : déplacer · molette : zoom · clic : sélection · aperçu non photométrique'}<span className="stage3d-keys"> · {t('stage3d.keys')}</span></div>
      </div>}
    </div>
  );
}

