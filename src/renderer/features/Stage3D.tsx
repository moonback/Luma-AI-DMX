import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Camera, CircleStop, Cloud, Lightbulb, Link2, Moon, Crosshair, Copy, Expand, Eye, Focus, ImageDown, Move3d, Orbit, Plus, Presentation, Rotate3d, ScanEye, SlidersHorizontal, Sparkles, SunMedium, Tag, Sun, Trash2, TriangleAlert, Video, X } from 'lucide-react';
import { confirmAction, useStore } from '../store';
import { act, newId } from '../api';
import { useResolved } from '../components/ui';
import { useT, type MessageKey } from '../i18n';
import { buildVisualModel, type VisualFixture } from '../../core/visualizer/model';
import type { Fixture, FixtureValues, Project } from '../../core/model/schemas';
import { audienceGlare } from '../../core/visualizer/beam';
import { stageGeometry } from './stage3d/environment';
import { AMBIENCES, FLOORS, LIGHT_BUDGET, type AmbienceId, type FloorId } from './stage3d/quality';
import { DARK_LEVEL, performerLight } from '../../core/visualizer/lighting';
import { acceptLibraryDrag, dropLibraryItem, duplicateSceneElement, hangFixture, removeSceneElement } from '../sceneActions';
import { findElement, SCENE_LABEL, type SceneRef } from '../../core/visualizer/sceneEdit';
import { GRIDS, QUALITY_PRESETS, VIEWS, loadPrefs, mountStage3D, savePrefs, type CtxTarget, type Prefs, type StageApi } from './stage3d/scene';

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

/** Contextual inspector showing properties of the current selection (fixture or scene element). */
function Inspector3D({
  selection,
  sceneSel,
  model,
  vis,
  t,
  onClose,
}: {
  selection: readonly string[];
  sceneSel: SceneRef | null;
  model: readonly VisualFixture[];
  vis: Project['visualizer'];
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  onClose: () => void;
}) {
  const f = selection.length === 1 ? model.find((x) => x.id === selection[0]) : null;
  const elem = sceneSel ? findElement(vis, sceneSel) : null;

  if (!f && !elem && selection.length === 0) return null;

  return (
    <aside className="stage3d-inspector" data-testid="stage3d-inspector" aria-label={t('stage3d.inspector')}>
      <div className="stage3d-inspector-head">
        <span className="stage3d-inspector-title">
          {f ? f.name : elem ? elem.name : t('stage3d.fixtures', { count: selection.length })}
        </span>
        <button className="chip-link" onClick={onClose} aria-label={t('stage3d.inspectorClose')} title={t('stage3d.inspectorClose')}><X size={12} /></button>
      </div>

      {f && (
        <>
          <div className="stage3d-inspector-grid">
            <div className="stage3d-inspector-cell">
              <span className="dim">{t('stage3d.inspectorType')}</span>
              <span>{f.type}</span>
            </div>
            <div className="stage3d-inspector-cell">
              <span className="dim">{t('stage3d.inspectorIntensity')}</span>
              <span>{Math.round(f.intensity * 100)} %</span>
            </div>
            <div className="stage3d-inspector-cell">
              <span className="dim">{t('stage3d.inspectorX')}</span>
              <span className="mono">{f.x.toFixed(2)} m</span>
            </div>
            <div className="stage3d-inspector-cell">
              <span className="dim">{t('stage3d.inspectorY')}</span>
              <span className="mono">{f.y.toFixed(2)} m</span>
            </div>
            <div className="stage3d-inspector-cell">
              <span className="dim">{t('stage3d.inspectorHeight')}</span>
              <span className="mono">{f.height.toFixed(2)} m</span>
            </div>
            <div className="stage3d-inspector-cell">
              <span className="dim">{t('stage3d.inspectorColor')}</span>
              <span className="stage3d-inspector-color mono">
                <span className="stage3d-inspector-swatch" style={{ backgroundColor: f.color }} />
                {f.color.toUpperCase()}
              </span>
            </div>
            {f.movable && (
              <>
                <div className="stage3d-inspector-cell">
                  <span className="dim">{t('stage3d.inspectorPan')}</span>
                  <span className="mono">{f.panDeg.toFixed(0)}°</span>
                </div>
                <div className="stage3d-inspector-cell">
                  <span className="dim">{t('stage3d.inspectorTilt')}</span>
                  <span className="mono">{f.tiltDeg.toFixed(0)}°</span>
                </div>
              </>
            )}
            {f.beamAngle > 0 && (
              <div className="stage3d-inspector-cell">
                <span className="dim">{t('stage3d.inspectorBeam')}</span>
                <span className="mono">{f.beamAngle.toFixed(0)}°</span>
              </div>
            )}
            {f.strobeHz > 0 && (
              <div className="stage3d-inspector-cell">
                <span className="dim">{t('stage3d.inspectorStrobe')}</span>
                <span className="mono">{f.strobeHz.toFixed(1)} Hz</span>
              </div>
            )}
          </div>
          <button
            className="btn ghost sm"
            style={{ marginTop: 4, justifyContent: 'center' }}
            onClick={() => useStore.getState().setStagePanels({ inspect: true })}
          >
            {t('stage3d.inspectorEdit')}
          </button>
        </>
      )}

      {elem && sceneSel && (
        <>
          <div className="stage3d-inspector-grid">
            <div className="stage3d-inspector-cell">
              <span className="dim">{t('stage3d.inspectorCat')}</span>
              <span>{SCENE_LABEL[sceneSel.kind]}</span>
            </div>
            <div className="stage3d-inspector-cell">
              <span className="dim">{t('stage3d.inspectorX')}</span>
              <span className="mono">{elem.x.toFixed(2)} m</span>
            </div>
            <div className="stage3d-inspector-cell">
              <span className="dim">{t('stage3d.inspectorY')}</span>
              <span className="mono">{elem.y.toFixed(2)} m</span>
            </div>
            {'height' in elem && (
              <div className="stage3d-inspector-cell">
                <span className="dim">{t('stage3d.inspectorHeight')}</span>
                <span className="mono">{(elem.height as number).toFixed(2)} m</span>
              </div>
            )}
            {'elevation' in elem && (
              <div className="stage3d-inspector-cell">
                <span className="dim">{t('stage3d.inspectorElevation')}</span>
                <span className="mono">{(elem.elevation as number).toFixed(2)} m</span>
              </div>
            )}
            {'length' in elem && (
              <div className="stage3d-inspector-cell">
                <span className="dim">{t('stage3d.inspectorLength')}</span>
                <span className="mono">{(elem.length as number).toFixed(2)} m</span>
              </div>
            )}
            {sceneSel.kind === 'truss' && 'rotationDeg' in elem && typeof (elem as { rotationDeg?: number }).rotationDeg === 'number' && (
              <div className="stage3d-inspector-cell">
                <span className="dim">{t('stage3d.inspectorRotation')}</span>
                <span className="mono">{(elem as { rotationDeg: number }).rotationDeg}°</span>
              </div>
            )}
          </div>
          <button
            className="btn ghost sm"
            style={{ marginTop: 4, justifyContent: 'center' }}
            onClick={() => useStore.getState().setStagePanels({ inspect: true })}
          >
            {t('stage3d.inspectorEdit')}
          </button>
        </>
      )}

      {!f && !elem && selection.length > 1 && (
        <div className="col" style={{ gap: 4 }}>
          <span className="small muted">{t('stage3d.inspectorMulti', { count: selection.length })}</span>
          <button
            className="btn ghost sm"
            style={{ marginTop: 4, justifyContent: 'center' }}
            onClick={() => useStore.getState().setStagePanels({ inspect: true })}
          >
            {t('stage3d.inspectorEdit')}
          </button>
        </div>
      )}
    </aside>
  );
}

/**
 * 3D stage preview (three.js) fed by the renderer-agnostic VisualFixture model.
 * Volumetric-looking beams, light pools with gobos on the floor and cyclorama, strobe flashes, prism facets and
 * per-cell beams for LED bars. A visual aid only: no photometry, shadows or real light transport.
 */
/** `inspector`: floating summary of the selection (off on the Stage page, whose side panel inspects it). */
export function Stage3D({ values, groupFilter, inspector = true }: { values?: FixtureValues; groupFilter?: string | null; inspector?: boolean }) {
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
  const [_shadows, setShadows] = useState(0);
  const [menu, setMenu] = useState(false);
  const [spin, setSpin] = useState(false);
  const [solo, setSolo] = useState(false);
  const [bare, setBare] = useState(false);
  const [showInspector, setShowInspector] = useState(true);
  const selKey = `${selection.join(',')}|${selSet ? `${selSet.kind}:${selSet.id}` : ''}`;
  const prevSelKey = useRef(selKey);
  useEffect(() => {
    if (prevSelKey.current !== selKey) {
      prevSelKey.current = selKey;
      setShowInspector(true);
    }
  }, [selKey]);
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

  if (error) return <div className="empty">{error}. {t('stage3d.errorFallback')}</div>;
  return (
    <div ref={wrap} className="canvas-wrap stage3d" style={{ height: '100%' }}>
      <div ref={host} style={{ position: 'absolute', inset: 0, cursor: placing ? 'crosshair' : undefined }} onPointerDown={() => { setMenu(false); setCtx(null); }} onDragOver={acceptLibraryDrag} onDrop={(e) => dropLibraryItem(e, api.current?.groundAt(e.clientX, e.clientY) ?? null)} data-testid="stage-3d" />
      <div className="stage3d-vignette" aria-hidden />
      {bare && <button className="chip stage3d-unbare" onClick={() => setBare(false)} title={t('stage3d.presentExit')} aria-label={t('stage3d.presentExit')} data-testid="present-exit"><Presentation size={12} /></button>}
      {!bare && <div className="stage3d-toolbar">
        {/* Caméras */}
        <div className="stage3d-group stage3d-cam-group" role="group" aria-label={t('stage3d.cameras')}>
          <span className="stage3d-cam-icon" title={t('stage3d.cameras')}><Camera size={13} /></span>
          <div className="stage3d-seg">
            {VIEWS.map((v) => (
              <button key={v.id} className={`chip stage3d-btn ${prefs.view === v.id && !follow ? 'on' : ''}`} data-testid={`cam-${v.id}`} onClick={() => pickView(v.id)}>{v.label}</button>
            ))}
            {vis.views.map((v) => (
              <span key={v.id} className={`chip stage3d-btn stage3d-saved-cam ${prefs.view === v.id && !follow ? 'on' : ''}`} data-testid="cam-saved">
                <button className="chip-link" onClick={() => pickView(v.id)}>{v.name}</button>
                <button className="chip-link chip-del" onClick={() => deleteView(v.id)} title={t('stage3d.viewDelete', { name: v.name })} aria-label={t('stage3d.viewDeleteAria', { name: v.name })}><X size={10} /></button>
              </span>
            ))}
          </div>
          {vis.views.length < 20 && <button className="chip stage3d-btn stage3d-add-cam" onClick={saveView} title={t('stage3d.viewSaveTitle')} aria-label={t('stage3d.viewSaveAria')} data-testid="cam-save"><Plus size={12} /></button>}
        </div>

        <div className="grow" />

        {/* Outils de vue */}
        <div className="stage3d-group stage3d-tools-group" role="group">
          <button className="chip stage3d-btn" onClick={frameSelection} title={t('stage3d.frameSel')} aria-label={t('stage3d.frameSel')} data-testid="frame-sel"><Focus size={13} /> <span className="lbl">{t('stage3d.frame')}</span></button>
          <button className={`chip stage3d-btn ${spin ? 'on' : ''}`} onClick={() => setSpin(!spin)} title={t('stage3d.spinTitle')} aria-pressed={spin} data-testid="spin"><Orbit size={13} /> <span className="lbl">{t('stage3d.spin')}</span></button>
          <button className={`chip stage3d-btn ${solo ? 'on' : ''}`} onClick={() => setSolo(!solo)} title={t('stage3d.soloTitle')} aria-pressed={solo} data-testid="solo"><ScanEye size={13} /> <span className="lbl">{t('stage3d.solo')}</span></button>
          <button className={`chip stage3d-btn ${prefs.room > 0 ? 'on' : ''}`} onClick={() => setPrefs({ room: prefs.room > 0 ? 0 : 0.7 })} title={t('stage3d.lightTitle')} aria-pressed={prefs.room > 0} data-testid="room-light"><SunMedium size={13} /> <span className="lbl">{t('stage3d.light')}</span></button>
        </div>

        {/* Édition 3D */}
        <div className={`stage3d-group stage3d-edit-group ${edit ? 'stage3d-edit-active' : ''}`} role="group">
          <button className={`chip stage3d-btn ${edit ? 'on' : ''}`} onClick={() => setEdit(!edit)} title={t('stage3d.editTitle')} data-testid="edit3d"><Move3d size={13} /> <span className="lbl">{t('stage3d.edit')}</span></button>
          {edit && (
            <>
              <div className="stage3d-subgroup" role="group" aria-label={t('stage3d.toolGroup')}>
                <button className={`chip stage3d-btn icon-only ${tool === 'translate' ? 'on' : ''}`} onClick={() => setTool('translate')} title={t('stage3d.editTitle')} aria-label={t('stage3d.move')} data-testid="tool-move"><Move3d size={12} /></button>
                <button className={`chip stage3d-btn icon-only ${tool === 'rotate' ? 'on' : ''}`} onClick={() => setTool('rotate')} title={t('stage3d.editTitle')} aria-label={t('stage3d.rotate')} data-testid="tool-rotate"><Rotate3d size={12} /></button>
              </div>
              <label className="stage3d-grid-label" title={t('stage3d.gridTitle')}>
                <span className="lbl dim">{t('stage3d.gridLabel')}</span>
                <select className="select stage3d-grid-select" value={prefs.grid} onChange={(e) => setPrefs({ grid: Number(e.target.value) })} data-testid="grid">
                  {GRIDS.map((g) => <option key={g} value={g}>{g ? `${String(g).replace('.', ',')} m` : t('stage3d.gridFree')}</option>)}
                </select>
              </label>
            </>
          )}
        </div>

        {/* Rendu */}
        <div className="stage3d-group stage3d-render-anchor">
          <button className={`chip stage3d-btn ${menu ? 'on' : ''}`} onClick={() => setMenu(!menu)} aria-expanded={menu} title={t('stage3d.renderTitle')} data-testid="render-menu"><SlidersHorizontal size={13} /> <span className="lbl">{t('stage3d.renderBtn')}</span></button>
          {menu && (
          <div className="stage3d-pop" role="dialog" aria-label={t('stage3d.renderDialog')} data-testid="render-pop">
            <div className="stage3d-presets" role="group" aria-label={t('stage3d.presetsTitle')}>
              {QUALITY_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className="chip"
                  title={t(preset.hintKey)}
                  onClick={() => setPrefs(preset.patch)}
                  data-testid={`preset-${preset.id}`}
                >
                  {t(preset.labelKey)}
                </button>
              ))}
            </div>
            <label className="row small" title={t('stage3d.hazeTitle')}>
              <Sun size={13} className="dim" /><span className="grow">{t('stage3d.hazeLabel')}</span>
              <input type="range" min={0} max={100} value={Math.round(prefs.haze * 100)} style={{ width: 130 }} onChange={(e) => setPrefs({ haze: Number(e.target.value) / 100 })} data-testid="haze" />
            </label>
            <label className="row small" title={t('stage3d.exposureTitle')}>
              <SunMedium size={13} className="dim" /><span className="grow">{t('stage3d.exposure')}</span>
              <input type="range" min={40} max={200} value={Math.round(prefs.exposure * 100)} style={{ width: 130 }} onChange={(e) => setPrefs({ exposure: Number(e.target.value) / 100 })} onDoubleClick={() => setPrefs({ exposure: 1 })} data-testid="exposure" />
            </label>
            <label className="row small" title={t('stage3d.roomTitle')}>
              <Lightbulb size={13} className="dim" /><span className="grow">{t('stage3d.room')}</span>
              <input type="range" min={0} max={100} value={Math.round(prefs.room * 100)} style={{ width: 130 }} onChange={(e) => setPrefs({ room: Number(e.target.value) / 100 })} onDoubleClick={() => setPrefs({ room: 0 })} data-testid="room" />
            </label>
            <div className="chips">
              <button className={`chip ${prefs.glow ? 'on' : ''}`} onClick={() => setPrefs({ glow: !prefs.glow })} title={t('stage3d.glowTitle')}><Sparkles size={12} /> {t('stage3d.glowBtn')}</button>
              <button className={`chip ${prefs.pools ? 'on' : ''}`} onClick={() => setPrefs({ pools: !prefs.pools })} title={t('stage3d.poolsTitle')}><Eye size={12} /> {t('stage3d.poolsBtn')}</button>
              <button className={`chip ${prefs.smoke ? 'on' : ''}`} onClick={() => setPrefs({ smoke: !prefs.smoke })} title={t('stage3d.smokeTitle')} data-testid="smoke"><Cloud size={12} /> {t('stage3d.smokeBtn')}</button>
              <button className={`chip ${prefs.labels ? 'on' : ''}`} onClick={() => setPrefs({ labels: !prefs.labels })} title={t('stage3d.labelsTitle')}><Tag size={12} /> {t('stage3d.labelsBtn')}</button>
              <button className={`chip ${prefs.real ? 'on' : ''}`} onClick={() => setPrefs({ real: !prefs.real })} title={`${t('stage3d.shadowsBtn')} (${LIGHT_BUDGET.min}–${LIGHT_BUDGET.max})`} data-testid="real-lights"><Lightbulb size={12} /> {prefs.real && lights ? t('stage3d.shadowsBtnActive', { n: lights }) : t('stage3d.shadowsBtn')}</button>
            </div>
            <label className="row small"><span className="grow">{t('stage3d.ambienceLabel')}</span>
              <select className="select" style={{ width: 160, height: 26 }} value={prefs.ambience} onChange={(e) => setPrefs({ ambience: e.target.value as AmbienceId })} data-testid="ambience">
                {(Object.keys(AMBIENCES) as AmbienceId[]).map((id) => <option key={id} value={id}>{AMBIENCES[id].label}</option>)}
              </select>
            </label>
            <label className="row small" title={t('stage3d.floorTitle')}><span className="grow">{t('stage3d.floorLabel')}</span>
              <select className="select" style={{ width: 160, height: 26 }} value={prefs.floor} onChange={(e) => setPrefs({ floor: e.target.value as FloorId })} data-testid="floor">
                {(Object.keys(FLOORS) as FloorId[]).map((id) => <option key={id} value={id}>{FLOORS[id]}</option>)}
              </select>
            </label>
          </div>
        )}
      </div>

      {/* Groupe 5 : Utilitaires Média & Plein écran */}
      <div className="stage3d-group stage3d-actions-group" role="group">
        <button className="chip stage3d-btn icon-only" onClick={() => api.current?.capture()} title={t('stage3d.captureTitle')} aria-label={t('stage3d.captureAria')} data-testid="capture">
          <ImageDown size={14} />
        </button>
        <button className={`chip stage3d-btn icon-only ${recording ? 'on recording' : ''}`} onClick={toggleRecord} title={recording ? t('stage3d.recordStopTitle') : t('stage3d.recordStartTitle')} aria-label={recording ? t('stage3d.recordStopAria') : t('stage3d.recordStartAria')} data-testid="record">
          {recording ? <CircleStop size={14} style={{ color: '#ef4444' }} /> : <Video size={14} />}
        </button>
        <button className="chip stage3d-btn icon-only" onClick={fullscreen} title={t('stage3d.fullscreenTitle')} aria-label={t('stage3d.fullscreenAria')}>
          <Expand size={14} />
        </button>
        <button className="chip stage3d-btn icon-only" onClick={() => setBare(true)} title={t('stage3d.present')} aria-label={t('stage3d.present')} data-testid="present">
          <Presentation size={14} />
        </button>
      </div>
    </div>}
      {hover && (
        <div className="stage3d-tip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <b>{hover.f.name}</b>
          <span className="small muted">{Math.round(hover.f.intensity * 100)} % · {hover.f.color.toUpperCase()}{hover.f.movable ? ` · P ${hover.f.panDeg.toFixed(0)}° T ${hover.f.tiltDeg.toFixed(0)}°` : ''}</span>
        </div>
      )}
      {dims && <div className="stage3d-dims mono small" data-testid="dims">{dims}</div>}
      {ctx && <ContextMenu ctx={ctx} model={model} vis={vis} patch={project.patch} onClose={() => setCtx(null)} />}
      {!bare && inspector && showInspector && (selection.length > 0 || selSet !== null) && (
        <Inspector3D
          selection={selection}
          sceneSel={selSet}
          model={model}
          vis={vis}
          t={t}
          onClose={() => setShowInspector(false)}
        />
      )}
      {!bare && (
        <div className="stage3d-status">
          <div className="stage3d-status-meta">
            <span className={`badge ${edit ? 'violet' : ''}`}>{edit ? t('stage3d.modeEdit') : t('stage3d.modeOrbit')}</span>
            <span className="small">{t('stage3d.fixtures', { count: model.length })}</span>
            {edit && <span className="small dim">· {prefs.grid > 0 ? t('stage3d.gridStep', { grid: prefs.grid }) : t('stage3d.gridFree')}</span>}
            <span className={`stage3d-fps mono ${fps >= 45 ? 'ok' : fps >= 25 ? 'mid' : 'low'}`} data-testid="fps">{fps} i/s</span>
            {(dark.length > 0 || glare.length > 0) && (
              <div className="row" style={{ gap: 6 }}>
                {dark.length > 0 && (
                  <span className="badge warn" data-testid="dark" title={t('stage3d.darkTitle', { names: dark.map((x) => x.name).join(', ') })}>
                    <Moon size={12} /> {t('stage3d.darkBadge', { n: dark.length })}
                  </span>
                )}
                {glare.length > 0 && (
                  <span className="badge warn" data-testid="glare" title={`Faisceau à hauteur des yeux du public : ${glare.map((f) => f.name).join(', ')}. Estimation sur l’axe du faisceau.`}>
                    <TriangleAlert size={12} /> Éblouissement public : {glare.length}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="small dim">{edit ? t('stage3d.helpEdit') : t('stage3d.helpOrbit')}<span className="stage3d-keys"> · {t('stage3d.keys')}</span></div>
        </div>
      )}
    </div>
  );
}

