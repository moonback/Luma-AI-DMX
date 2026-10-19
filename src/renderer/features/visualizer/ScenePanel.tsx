import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Armchair, Boxes, Camera, Copy, Crosshair, LayoutTemplate, Library, MapPin, Monitor, PanelLeftClose, Redo2, Settings2, Theater, Trash2, Undo2, UserRound, Wand2 } from 'lucide-react';
import { confirmAction, useStore } from '../../store';
import { act, newId } from '../../api';
import { PHOTO_MAX_PX, sceneFromPhoto } from '../../sceneActions';
import { t, useT, type MessageKey } from '../../i18n';
import { useResolved } from '../../components/ui';
import { buildVisualModel } from '../../../core/visualizer/model';
import { setScreenVideo } from '../../screenMedia';
import { JUNCTION_ARMS } from '../../../core/visualizer/truss';
import { LIBRARY, LIBRARY_GROUPS, type LibraryGroup, type LibraryItem } from '../../../core/visualizer/library';
import { SCENE_LABEL, canAdd, findElement, type SceneKind } from '../../../core/visualizer/sceneEdit';
import { LIBRARY_MIME, addSceneElement, duplicateSceneElement, equipRig, removeSceneElement } from '../../sceneActions';
import { SCENE_TEMPLATES, hasSceneContent, sceneTemplate } from '../../../core/visualizer/templates';
import { shrinkImage, type Vis, Section, Num, MarkerCard, PropCard, TrussCard, PerformerCard, ScreenCard, ElementCard, FixtureCard } from './sceneCards';

/* Side panel shared by the 2D and 3D views: templates, library, element lists, selection inspector, undo / redo. */

const SHAPES: { id: Vis['shape']; label: string }[] = [
  { id: 'rect', label: 'Rectangle' }, { id: 'thrust', label: 'Avancée' }, { id: 'arena', label: 'Arène (360°)' },
];

/** Quick-add tile: "+" (next free spot) and "place with a click on the stage" for one kind of element. */
function AddBtn({ kind, label, icon, testId }: { kind: SceneKind; label: MessageKey; icon: ReactNode; testId: string }) {
  const tr = useT();
  const full = useStore((s) => !canAdd(s.project!.project.visualizer, kind));
  const placing = useStore((s) => s.placing?.kind === kind && !s.placing.preset);
  const name = SCENE_LABEL[kind].toLowerCase();
  return (
    <div className={`scene-add ${placing ? 'on' : ''}`}>
      <button className="scene-add-main" onClick={() => addSceneElement(kind)} disabled={full} title={tr('scene.addTitle', { name })} data-testid={testId}>{icon}<span>{tr(label)}</span></button>
      <button className="scene-add-place" onClick={() => useStore.getState().setPlacing(placing ? null : { kind, label: name })} disabled={full} aria-pressed={placing}
        title={tr('scene.placeTitle')} aria-label={tr('scene.placeLabel', { name })} data-testid={`${testId}-place`}><Crosshair size={11} /></button>
    </div>
  );
}

/** Always-visible add bar at the top of the build tab, so adding never needs scrolling to a section. */
function QuickAdd() {
  const tr = useT();
  return (
    <div className="scene-quickadd" role="toolbar" aria-label={tr('scene.addBar')}>
      <AddBtn kind="marker" label="scene.addMarker" icon={<MapPin size={14} />} testId="marker-add" />
      <AddBtn kind="truss" label="scene.addTruss" icon={<Boxes size={14} />} testId="truss-add" />
      <AddBtn kind="prop" label="scene.addProp" icon={<Armchair size={14} />} testId="prop-add" />
      <AddBtn kind="performer" label="scene.addPerformer" icon={<UserRound size={14} />} testId="performer-add" />
      <AddBtn kind="screen" label="scene.addScreen" icon={<Monitor size={14} />} testId="screen-add" />
    </div>
  );
}

/** One-click starting layouts; replacing a non-empty scene asks first (and stays undoable). */
function TemplatePicker({ vis }: { vis: Vis }) {
  const apply = async (t: (typeof SCENE_TEMPLATES)[number]) => {
    if (hasSceneContent(vis) && !(await confirmAction({
      title: 'Remplacer la scène',
      message: `Le modèle « ${t.label} » remplace le plateau, les points, structures, interprètes et écrans actuels.\nLes projecteurs restent en place. Ctrl+Z pour annuler.`,
      confirmLabel: 'Remplacer',
    }))) return;
    for (const sc of vis.screens) setScreenVideo(sc.id, null);
    void act({ type: 'project.update', visualizer: sceneTemplate(t.id, newId) });
  };
  return (
    <div className="scene-templates">
      {SCENE_TEMPLATES.map((t) => (
        <button key={t.id} className="scene-template" onClick={() => void apply(t)} data-testid={`template-${t.id}`}>
          <b>{t.label}</b><span className="small dim">{t.hint}</span>
        </button>
      ))}
    </div>
  );
}

/** Side panel shared by the 2D and 3D views: build the scene (template, library, elements) or inspect the selection. */
export function ScenePanel({ vis, mode }: { vis: Vis; mode: '2d' | '3d' | 'split' }) {
  const tr = useT();
  const tab = useStore((s) => s.scenePanel) ?? 'build';
  const setTab = useStore((s) => s.setScenePanel);
  const count = useStore((s) => (s.sceneSel ? 1 : s.selection.length));
  const update = (v: Partial<Vis>) => void act({ type: 'project.update', visualizer: v });
  return (
    <aside className="scene-panel" aria-label={tr('stagePanel.aria')}>
      <div className="scene-panel-head">
        <div className="chips grow" role="tablist" aria-label={tr('stagePanel.tabs')}>
          <button role="tab" aria-selected={tab === 'build'} className={`chip ${tab === 'build' ? 'on' : ''}`} onClick={() => setTab('build')} data-testid="panel-build"><Settings2 size={12} />{tr('stagePanel.build')}</button>
          <button role="tab" aria-selected={tab === 'selection'} className={`chip ${tab === 'selection' ? 'on' : ''}`} onClick={() => setTab('selection')} data-testid="panel-selection">{tr('stagePanel.selection')}{count ? ` (${count})` : ''}</button>
        </div>
        <button className="btn ghost sm icon" onClick={() => useStore.getState().setHelp('stage')} title={tr('stagePanel.wizardHint')} aria-label={tr('stagePanel.wizard')} data-testid="stage-wizard-open"><Wand2 size={14} /></button>
        <button className="btn ghost sm icon" onClick={() => setTab(null)} title={tr('stagePanel.close')} aria-label={tr('stagePanel.close')}><PanelLeftClose size={14} /></button>
      </div>
      {tab === 'selection' ? <div className="scene-panel-body" data-testid="stage-selection"><SelectionTab vis={vis} mode={mode} /></div> : (
      <div className="scene-panel-body" data-testid="stage-settings">
        <QuickAdd />
        <Section icon={<LayoutTemplate size={13} />} title="Partir d’un modèle" open={!hasSceneContent(vis)}>
          <TemplatePicker vis={vis} />
          <label className="btn sm" title={t('photo.buttonTitle')} data-testid="scene-from-photo">
            <Camera size={12} />{t('photo.button')}
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) shrinkImage(file, PHOTO_MAX_PX).then((img) => sceneFromPhoto(vis, img)).catch((err: Error) => useStore.getState().toast({ kind: 'error', title: t('photo.error'), detail: err.message }));
            }} />
          </label>
        </Section>
        <Section icon={<Theater size={13} />} title="Plateau">
          <div className="chips" role="group" aria-label="Forme du plateau">
            {SHAPES.map((sh) => <button key={sh.id} className={`chip ${vis.shape === sh.id ? 'on' : ''}`} data-testid={`shape-${sh.id}`} onClick={() => update({ shape: sh.id })}>{sh.label}</button>)}
          </div>
          <div className="scene-card-grid">
            <Num label="Largeur" title="Largeur du plateau, jardin ↔ cour (m)" value={vis.stageWidth} min={2} max={200} step={1} onChange={(v) => update({ stageWidth: v })} />
            <Num label="Profondeur" title="Profondeur du plateau (m)" value={vis.stageDepth} min={2} max={200} step={1} onChange={(v) => update({ stageDepth: v })} />
            {vis.shape !== 'arena' && (
              <label className="row small scene-check"><input type="checkbox" checked={vis.cyclo} onChange={(e) => update({ cyclo: e.target.checked })} data-testid="cyclo" />Cyclorama</label>
            )}
            {vis.shape === 'thrust' && (
              <>
                <Num label="Avancée L" title="Largeur de l’avancée (m)" value={vis.thrust.width} min={1} max={50} step={0.5} onChange={(v) => update({ thrust: { ...vis.thrust, width: v } })} />
                <Num label="Avancée P" title="Profondeur de l’avancée (m)" value={vis.thrust.depth} min={1} max={50} step={0.5} onChange={(v) => update({ thrust: { ...vis.thrust, depth: v } })} />
              </>
            )}
          </div>
        </Section>
        <Section icon={<Library size={13} />} title="Bibliothèque">
          <LibraryPicker />
        </Section>
        <Section icon={<MapPin size={13} />} title="Points de scène" count={vis.markers.length}>
          {vis.markers.map((m) => <MarkerCard key={m.id} m={m} vis={vis} />)}
          <p className="scene-hint">Repères « chanteur », « batteur »… déplaçables en 2D (Positionner).</p>
        </Section>
        <TrussSettings vis={vis} />
        <PropSettings vis={vis} />
        <PerformerSettings vis={vis} />
        <ScreenSettings vis={vis} />
      </div>
      )}
    </aside>
  );
}

/** Small top view of a library item (drawn, so every piece reads at a glance whatever the icon set). */
function LibraryGlyph({ item }: { item: LibraryItem }) {
  const s = { stroke: 'currentColor', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const };
  let body: ReactNode;
  if (item.kind === 'truss') {
    const p = item.preset;
    const arms = JUNCTION_ARMS[p.shape ?? 'line'];
    if (arms) body = <>{arms.map((a) => <line key={a} x1={14} y1={14} x2={14 + 10 * Math.cos((a * Math.PI) / 180)} y2={14 - 10 * Math.sin((a * Math.PI) / 180)} {...s} strokeWidth={4} />)}<rect x={11} y={11} width={6} height={6} fill="currentColor" /></>;
    else if (p.shape === 'totem') body = <><rect x={11} y={3} width={6} height={20} {...s} /><line x1={6} y1={25} x2={22} y2={25} {...s} /></>;
    else if (p.shape === 'circle') body = <circle cx={14} cy={14} r={10} {...s} strokeWidth={3} />;
    else if (p.shape === 'square') body = <rect x={4} y={4} width={20} height={20} {...s} strokeWidth={3} />;
    else {
      const len = Math.min(24, 4 + (p.length ?? 2) * 5);
      body = <><line x1={14 - len / 2} y1={14} x2={14 + len / 2} y2={14} {...s} strokeWidth={4} />{p.support === 'towers' && <><line x1={2} y1={14} x2={2} y2={26} {...s} /><line x1={26} y1={14} x2={26} y2={26} {...s} /></>}</>;
    }
  } else if (item.kind === 'prop') {
    const k = item.preset.kind;
    if (k === 'column' || k === 'mic') body = <><circle cx={14} cy={k === 'mic' ? 7 : 14} r={k === 'mic' ? 3 : 8} {...s} />{k === 'mic' && <line x1={14} y1={10} x2={14} y2={25} {...s} />}</>;
    else if (k === 'stairs') body = <path d="M4 24h6v-6h6v-6h6v-6h2" {...s} />;
    else if (k === 'drape') body = <path d="M4 4v20M9 4v20M14 4v20M19 4v20M24 4v20" {...s} strokeWidth={1.5} />;
    else if (k === 'monitor') body = <path d="M4 22h20L8 10z" {...s} />;
    else if (k === 'speaker') body = <><rect x={8} y={3} width={12} height={22} {...s} /><circle cx={14} cy={17} r={4} {...s} /></>;
    else if (k === 'table') body = <path d="M3 10h22M6 10v14M22 10v14" {...s} />;
    else body = <rect x={k === 'riser' ? 2 : 6} y={k === 'riser' ? 9 : 6} width={k === 'riser' ? 24 : 16} height={k === 'riser' ? 10 : 16} {...s} />;
  } else if (item.kind === 'performer') body = <><circle cx={14} cy={7} r={4} {...s} /><path d="M7 25c0-6 3-10 7-10s7 4 7 10" {...s} /></>;
  else if (item.kind === 'screen') body = <rect x={3} y={7} width={22} height={13} {...s} />;
  else body = <path d="M14 4l8 10-8 10-8-10z" {...s} />;
  return <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden>{body}</svg>;
}

/** Lower-case, accent-free text for the library search ("Écran" matches "ecran"). */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Library of pieces: click a tile then the stage, or drag the tile onto the 2D / 3D view. */
function LibraryPicker() {
  const [group, setGroup] = useState<LibraryGroup>('truss');
  const [query, setQuery] = useState('');
  const tr = useT();
  const placing = useStore((s) => s.placing);
  const q = fold(query.trim());
  // A search looks through every category, so a piece is found without knowing where it lives.
  const items = q ? LIBRARY.filter((x) => fold(x.label).includes(q)) : LIBRARY.filter((x) => x.group === group);
  return (
    <>
      <input className="input" type="search" placeholder={tr('scene.libSearch')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={tr('scene.libSearch')} data-testid="lib-search" />
      {!q && (
        <div className="chips" role="tablist" aria-label="Catégories">
          {LIBRARY_GROUPS.map((g) => <button key={g.id} role="tab" aria-selected={group === g.id} className={`chip ${group === g.id ? 'on' : ''}`} onClick={() => setGroup(g.id)} data-testid={`lib-group-${g.id}`}>{g.label}</button>)}
        </div>
      )}
      {q && !items.length && <p className="scene-hint">{tr('scene.libNone', { q: query.trim() })}</p>}
      <div className="scene-library">
        {items.map((item) => (
          <button key={item.id} className={`scene-lib-item ${placing?.label === item.label ? 'on' : ''}`} draggable data-testid={`lib-${item.id}`}
            title={`${item.label} — cliquer puis cliquer sur le plateau, ou glisser sur la vue`}
            onClick={() => useStore.getState().setPlacing(placing?.label === item.label ? null : { kind: item.kind, label: item.label, preset: { ...item.preset } })}
            onDragStart={(e) => { e.dataTransfer.setData(LIBRARY_MIME, item.id); e.dataTransfer.effectAllowed = 'copy'; }}>
            <LibraryGlyph item={item} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <p className="scene-hint">Les pièces se raccordent bout à bout quand on les approche (aimantation 35 cm) et prennent la hauteur de la pièce rejointe.</p>
    </>
  );
}

/** At most this many fixture cards in the inspector (a whole rig selected stays readable). */
const MAX_FIXTURE_CARDS = 12;

/** Inspector tab: the cards of what is selected in the 2D / 3D view. */
function SelectionTab({ vis, mode }: { vis: Vis; mode: '2d' | '3d' | 'split' }) {
  const selection = useStore((s) => s.selection);
  const sceneSel = useStore((s) => s.sceneSel);
  const values = useStore((s) => s.preview?.values ?? s.values);
  const patch = useStore((s) => s.project!.project.patch);
  const { fixtures } = useResolved();
  const model = useMemo(() => buildVisualModel(fixtures.filter((f) => selection.includes(f.fixture.id)), values), [fixtures, selection, values]);
  if (sceneSel && findElement(vis, sceneSel)) {
    return (
      <div className="col" style={{ gap: 8 }} data-testid="selection-element">
        <ElementCard sel={sceneSel} vis={vis} />
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => duplicateSceneElement(sceneSel)} title="Dupliquer (Ctrl+D)"><Copy size={12} />Dupliquer</button>
          <button className="btn sm" onClick={() => removeSceneElement(sceneSel)} title="Supprimer (Suppr)"><Trash2 size={12} />Supprimer</button>
        </div>
        <p className="scene-hint">Double-clic sur la carte : cadrer la vue 3D.</p>
      </div>
    );
  }
  if (!model.length) return <p className="scene-hint" data-testid="selection-empty">Cliquez un projecteur ou un élément de scène dans la vue (Ctrl / Maj : plusieurs projecteurs).</p>;
  return (
    <div className="col" style={{ gap: 8 }}>
      {model.slice(0, MAX_FIXTURE_CARDS).map((f) => <FixtureCard key={f.id} f={f} fixture={patch.find((x) => x.id === f.id)} trusses={vis.trusses} beamView={mode === '3d'} />)}
      {model.length > MAX_FIXTURE_CARDS && <p className="scene-hint">… et {model.length - MAX_FIXTURE_CARDS} autre(s) projecteur(s).</p>}
      <p className="scene-hint">Double-clic sur une carte : cadrer la vue 3D.</p>
    </div>
  );
}

/** Set pieces (risers, stairs, speakers, monitors, mic stands, tables, drapes, boxes, columns). */
function PropSettings({ vis }: { vis: Vis }) {
  return (
    <Section icon={<Armchair size={13} />} title="Décor" count={vis.props.length}>
      {vis.props.map((p) => <PropCard key={p.id} p={p} vis={vis} />)}
      <p className="scene-hint">Plus de modèles dans la bibliothèque (onglet Décor) ; en mode Positionner, glisser pour déplacer.</p>
    </Section>
  );
}

/** Explicit trusses: hung fixtures follow them (handled by the main process when a truss changes). */
function TrussSettings({ vis }: { vis: Vis }) {
  const { fixtures } = useResolved();
  const selection = useStore((s) => s.selection);
  return (
    <Section icon={<Boxes size={13} />} title="Structures (truss)" count={vis.trusses.length}>
      {vis.trusses.length > 0 && fixtures.length > 0 && (
        <button className="btn sm primary" onClick={() => equipRig(buildVisualModel(fixtures, {}))} data-testid="equip"
          title="Répartir les projecteurs sur les structures : lyres en contre, projecteurs fixes en face (Ctrl+Z pour annuler)">
          <Wand2 size={12} />{selection.length ? `Équiper avec la sélection (${selection.length})` : 'Équiper les structures'}
        </button>
      )}
      {vis.trusses.map((t) => <TrussCard key={t.id} t={t} vis={vis} />)}
      <p className="scene-hint">Les projecteurs accrochés suivent la structure ; aimantation au dépôt.</p>
    </Section>
  );
}

/** Performer and instrument silhouettes; their face shows the light received (2D disc, 3D tint). */
function PerformerSettings({ vis }: { vis: Vis }) {
  return (
    <Section icon={<UserRound size={13} />} title="Interprètes et instruments" count={vis.performers.length}>
      {vis.performers.map((pf) => <PerformerCard key={pf.id} pf={pf} vis={vis} />)}
      <p className="scene-hint">Lâché sur un point de scène en 2D, l’interprète s’y pose et le suit ; sur un praticable, il monte dessus.</p>
    </Section>
  );
}

/** LED screens / video surfaces with a light spill on their surroundings. */
function ScreenSettings({ vis }: { vis: Vis }) {
  return (
    <Section icon={<Monitor size={13} />} title="Écrans LED" count={vis.screens.length}>
      {vis.screens.map((sc) => <ScreenCard key={sc.id} sc={sc} vis={vis} />)}
      <p className="scene-hint">Couleur, image, vidéo (non enregistrée) ou pixel mapping des barres LED.</p>
    </Section>
  );
}

/** Scene-layout undo / redo (main-process history), with Ctrl+Z / Ctrl+Y outside text fields. */
export function SceneHistory() {
  const history = useStore((s) => s.project?.sceneHistory);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); void act({ type: 'scene.undo' }); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); void act({ type: 'scene.redo' }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      <button className="btn icon" title="Annuler la dernière modification de scène (Ctrl+Z)" disabled={!history?.undo} onClick={() => void act({ type: 'scene.undo' })} data-testid="scene-undo"><Undo2 size={14} /></button>
      <button className="btn icon" title="Rétablir (Ctrl+Y)" disabled={!history?.redo} onClick={() => void act({ type: 'scene.redo' })} data-testid="scene-redo"><Redo2 size={14} /></button>
    </>
  );
}
