import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Armchair, ArrowLeft, Boxes, Cable, Guitar, Speaker, Camera, ChevronUp, Crosshair, Layers, LayoutTemplate, Lightbulb, MapPin, Monitor, Music2, PanelLeftClose, Presentation, Radio, Redo2, Shapes, Sparkles, Theater, Undo2, Unplug, UserRound, Wand2 } from 'lucide-react';
import type { EquipDistributionMode } from '../../../core/visualizer/sceneEdit';
import { confirmAction, useStore } from '../../store';
import { act, newId } from '../../api';
import { PHOTO_MAX_PX, sceneFromPhoto } from '../../sceneActions';
import { t, useT, type MessageKey } from '../../i18n';
import { useResolved } from '../../components/ui';
import { buildVisualModel } from '../../../core/visualizer/model';
import { setScreenVideo } from '../../screenMedia';
import { LIBRARY, type LibraryGroup, type LibraryItem } from '../../../core/visualizer/library';
import { LibraryHome, LibraryTiles, fold } from './libraryTiles';
import { SceneAssistant } from './SceneAssistant';
import { SCENE_LABEL, canAdd, type SceneKind } from '../../../core/visualizer/sceneEdit';
import { EQUIPMENT } from '../../../core/visualizer/equipment';
import { LIBRARY_MIME, addSceneElement, equipRig, unhangRig } from '../../sceneActions';
export { LibraryGlyph, fold } from './libraryTiles';
import { SCENE_TEMPLATES, hasSceneContent, sceneTemplate, type SceneTemplateId } from '../../../core/visualizer/templates';
import { channelCount } from '../../../core/fixtures/profiles';
import { FIXTURE_TYPES, type FixtureProfile, type FixtureType } from '../../../core/model/schemas';
import { shrinkImage, type Vis, Section, Num, MarkerCard, PropCard, TrussCard, PerformerCard, ScreenCard } from './sceneCards';

/* Left panel of the Stage page: the five Construire categories, their catalogues (real fixture profiles and the stage
   element library), the elements of each kind already on stage, the stage shape and starting templates. */

export type BuildCat = 'point' | 'structure' | 'sound' | 'backline' | 'decor' | 'performer' | 'screen' | 'accessory';

/** Categories of the library: the library group they list (fixture profiles for 'point', plus the effect machines). */
const CATS: { id: BuildCat; icon: ReactNode; group?: LibraryGroup; items: (x: LibraryItem) => boolean }[] = [
  { id: 'point', icon: <Lightbulb size={22} />, group: 'light', items: (x) => x.group === 'light' },
  { id: 'structure', icon: <Boxes size={22} />, group: 'structure', items: (x) => x.group === 'structure' },
  { id: 'sound', icon: <Speaker size={22} />, group: 'sound', items: (x) => x.group === 'sound' },
  { id: 'backline', icon: <Guitar size={22} />, group: 'backline', items: (x) => x.group === 'backline' },
  { id: 'decor', icon: <Armchair size={22} />, group: 'decor', items: (x) => x.group === 'decor' },
  { id: 'performer', icon: <UserRound size={22} />, items: (x) => x.kind === 'performer' || x.kind === 'marker' },
  { id: 'screen', icon: <Monitor size={22} />, group: 'video', items: (x) => x.kind === 'screen' },
  { id: 'accessory', icon: <Cable size={22} />, group: 'accessory', items: (x) => x.group === 'accessory' },
];

const SHAPES: { id: Vis['shape']; label: string }[] = [
  { id: 'rect', label: 'Rectangle' }, { id: 'thrust', label: 'Avancée' }, { id: 'arena', label: 'Arène (360°)' },
];

/** Métadonnées visuelles pour chaque modèle de scène. */
const TEMPLATE_META: Record<SceneTemplateId, { icon: ReactNode; dims: string }> = {
  concert: { icon: <Music2 size={15} className="tpl-accent" />, dims: '12 × 8 m' },
  theatre: { icon: <Theater size={15} className="tpl-accent" />, dims: '10 × 8 m' },
  club: { icon: <Radio size={15} className="tpl-accent" />, dims: '8 × 5 m' },
  conference: { icon: <Presentation size={15} className="tpl-accent" />, dims: '8 × 5 m' },
  arena: { icon: <Shapes size={15} className="tpl-accent" />, dims: '10 × 10 m' },
  catwalk: { icon: <Sparkles size={15} className="tpl-accent" />, dims: '10 × 5 m' },
  festival: { icon: <Music2 size={15} className="tpl-accent" />, dims: '16 × 10 m' },
  acoustic: { icon: <Theater size={15} className="tpl-accent" />, dims: '6 × 4 m' },
  tv: { icon: <Monitor size={15} className="tpl-accent" />, dims: '10 × 7 m' },
  gala: { icon: <Sparkles size={15} className="tpl-accent" />, dims: '8 × 5 m' },
};


/** Quick-add tile: "+" (next free spot) and "place with a click on the stage" for one kind of element. */
function AddBtn({ kind, label, icon, testId }: { kind: SceneKind; label: MessageKey; icon: ReactNode; testId: string }) {
  const tr = useT();
  const full = useStore((s) => !canAdd(s.project!.project.visualizer, kind));
  const placing = useStore((s) => s.placing?.kind === kind && !('preset' in s.placing && s.placing.preset));
  const name = SCENE_LABEL[kind].toLowerCase();
  return (
    <div className={`scene-add ${placing ? 'on' : ''}`}>
      <button className="scene-add-main" onClick={() => addSceneElement(kind)} disabled={full} title={tr('scene.addTitle', { name })} data-testid={testId}>{icon}<span>{tr(label)}</span></button>
      <button className="scene-add-place" onClick={() => useStore.getState().setPlacing(placing ? null : { kind, label: name })} disabled={full} aria-pressed={placing}
        title={tr('scene.placeTitle')} aria-label={tr('scene.placeLabel', { name })} data-testid={`${testId}-place`}><Crosshair size={11} /></button>
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
      {SCENE_TEMPLATES.map((t) => {
        const meta = TEMPLATE_META[t.id];
        return (
          <button key={t.id} className="scene-template" onClick={() => void apply(t)} data-testid={`template-${t.id}`} title={`${t.label} (${meta?.dims ?? ''}) : ${t.hint}`}>
            <div className="scene-template-head">
              {meta?.icon}
              <b className="grow">{t.label}</b>
              {meta?.dims && <span className="scene-template-dims">{meta.dims}</span>}
            </div>
            <span className="small dim scene-template-hint">{t.hint}</span>
          </button>
        );
      })}
    </div>
  );
}


/** Left column of the Stage page: title card, the Construire categories (always listed) and the catalogue of the active one. */
export function ScenePanel({ vis, modeLabel }: { vis: Vis; modeLabel: string }) {
  const tr = useT();
  const [cat, setCat] = useState<BuildCat | null>(null);
  const [catsOpen, setCatsOpen] = useState(true);
  const [stageOpen, setStageOpen] = useState(false);
  const [stageTab, setStageTab] = useState<'dimensions' | 'templates'>('dimensions');
  const current = CATS.find((c) => c.id === cat);
  return (
    <aside className="stage-side build-side" aria-label={tr('build.title')}>
      <div className="stage-card stage-title-card">
        <div className="row" style={{ gap: 10 }}>
          <Layers size={22} className="stage-accent" />
          <h1 className="grow">{tr('stagePage.title')}</h1>
          <span className="stage-mode-badge">{modeLabel}</span>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <span className="grow small muted">{tr('build.title')} · {tr('build.sub')}</span>
          <button className="btn ghost sm icon" onClick={() => useStore.getState().setStagePanels({ build: false })} title={tr('build.collapse')} aria-label={tr('build.collapse')} data-testid="build-collapse"><PanelLeftClose size={14} /></button>
        </div>
      </div>
      <div className="stage-card build-card" data-testid="stage-settings">
        <button className="stage-card-head" aria-expanded={catsOpen} onClick={() => setCatsOpen(!catsOpen)}>
          <Shapes size={15} className="stage-accent" /><h2 className="grow">{tr('build.title')}</h2><ChevronUp size={15} className={catsOpen ? '' : 'flip'} />
        </button>
        <EquipButton vis={vis} />
        <StageDimensionsBar vis={vis} open={stageOpen} onToggle={() => setStageOpen(!stageOpen)} />
        <div
          className="build-stage-expanded"
          data-testid="stage-dimensions-expanded"
          style={stageOpen ? undefined : { display: 'none' }}
        >
          <div className="build-stage-tabs" role="tablist">
            <button
              type="button"
              className={`build-stage-tab ${stageTab === 'dimensions' ? 'on' : ''}`}
              onClick={() => setStageTab('dimensions')}
              role="tab"
              aria-selected={stageTab === 'dimensions'}
            >
              <Shapes size={13} />
              <span>Dimensions & Forme</span>
            </button>
            <button
              type="button"
              className={`build-stage-tab ${stageTab === 'templates' ? 'on' : ''}`}
              onClick={() => setStageTab('templates')}
              role="tab"
              aria-selected={stageTab === 'templates'}
            >
              <LayoutTemplate size={13} />
              <span>Modèles prêts à l'emploi ({SCENE_TEMPLATES.length})</span>
            </button>
          </div>
          <div style={stageTab === 'dimensions' ? undefined : { display: 'none' }}>
            <StageSettingsFields vis={vis} />
          </div>
          <div style={stageTab === 'templates' ? undefined : { display: 'none' }} className="build-stage-templates-wrap">
            <TemplatePicker vis={vis} />
            <label className="btn sm build-photo-btn" title={t('photo.buttonTitle')} data-testid="scene-from-photo">
              <Camera size={13} />
              <span>{t('photo.button')}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) shrinkImage(file, PHOTO_MAX_PX).then((img) => sceneFromPhoto(vis, img)).catch((err: Error) => useStore.getState().toast({ kind: 'error', title: t('photo.error'), detail: err.message }));
              }} />
            </label>
          </div>
        </div>
        <div className="stage-card-body">
          {catsOpen && !current && <SceneAssistant />}
          {catsOpen && (
            <div style={current ? { display: 'none' } : undefined}>
            <LibraryHome>
            <nav
              className="build-cats"
              aria-label={tr('build.categories')}
              style={current ? { display: 'none' } : undefined}
            >
              {CATS.map((c) => (
                <button
                  key={c.id}
                  className={`build-cat ${cat === c.id ? 'on' : ''}`}
                  aria-pressed={cat === c.id}
                  onClick={() => setCat(c.id)}
                  data-testid={`build-cat-${c.id}`}
                >
                  <span className="build-cat-icon">{c.icon}</span>
                  <span className="build-cat-text">
                    <b>{tr(`build.cat.${c.id}` as MessageKey)}</b>
                    <span>{tr(`build.cat.${c.id}.desc` as MessageKey)}</span>
                  </span>
                </button>
              ))}
            </nav>
            </LibraryHome>
            </div>
          )}
          {current && (
            <Catalogue
              key={current.id}
              cat={current}
              vis={vis}
              onBack={() => setCat(null)}
            />
          )}
        </div>
      </div>
    </aside>
  );
}

const DISTRIB_MODES: EquipDistributionMode[] = ['standard', 'inverted', 'balanced'];

/** Hangs the hung fixtures (or the selection) evenly on the trusses; one undoable step. */
function EquipButton({ vis }: { vis: Vis }) {
  const tr = useT();
  const { fixtures } = useResolved();
  const selection = useStore((s) => s.selection);
  const sceneSel = useStore((s) => s.sceneSel);
  const selectedTruss = sceneSel?.kind === 'truss' ? vis.trusses.find((t) => t.id === sceneSel.id) : null;
  const [mode, setMode] = useState<EquipDistributionMode>('standard');
  const [autoRotate, setAutoRotate] = useState(true);
  const [margin, setMargin] = useState(0);
  // Build the visual model once; VisualFixture has trussId while ResolvedFixture does not.
  const visualFixtures = useMemo(() => buildVisualModel(fixtures, {}), [fixtures]);
  if (!vis.trusses.length || !fixtures.length) return null;

  const targetTrussId = selectedTruss?.id;
  const hungCount = visualFixtures.filter((f) => f.trussId && (targetTrussId ? f.trussId === targetTrussId : true)).length;
  // Show distribution toggle only when ≥2 non-totem trusses (otherwise the mode has no visible effect)
  const nonTotems = vis.trusses.filter((t) => t.shape !== 'totem');
  const showModeToggle = nonTotems.length >= 2;

  let equipLabel = 'Équiper les structures';
  if (selectedTruss) {
    equipLabel = selection.length
      ? `Équiper « ${selectedTruss.name} » (${selection.length})`
      : `Équiper « ${selectedTruss.name} »`;
  } else if (selection.length) {
    equipLabel = `Équiper avec la sélection (${selection.length})`;
  }

  return (
    <div className="build-equip-bar">
      <div className="build-equip-row">
        <button
          type="button"
          className="btn sm primary build-equip-btn"
          onClick={() => equipRig(visualFixtures, targetTrussId, { mode, autoRotate, margin })}
          data-testid="equip"
          title={
            selectedTruss
              ? `Répartir les projecteurs sur « ${selectedTruss.name} » — mode ${mode} (Ctrl+Z pour annuler)`
              : `Répartir les projecteurs sur les structures — mode ${mode} (Ctrl+Z pour annuler)`
          }
        >
          <Wand2 size={13} />
          <span>{equipLabel}</span>
        </button>
        {hungCount > 0 && (
          <button
            type="button"
            className="btn sm ghost icon build-unhang-btn"
            onClick={() => unhangRig(targetTrussId)}
            data-testid="unhang"
            title={
              selectedTruss
                ? `Décrocher les ${hungCount} projecteur(s) de « ${selectedTruss.name} » (Ctrl+Z pour annuler)`
                : `Décrocher tous les projecteurs des structures (${hungCount}) (Ctrl+Z pour annuler)`
            }
          >
            <Unplug size={14} />
          </button>
        )}
      </div>
      {showModeToggle && (
        <div className="build-equip-modes" role="group" aria-label={tr('equip.distrib')}>
          {DISTRIB_MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={`build-equip-mode-btn ${mode === m ? 'on' : ''}`}
              onClick={() => setMode(m)}
              title={tr(`equip.distrib.${m}.title`)}
              aria-pressed={mode === m}
              data-testid={`equip-mode-${m}`}
            >
              {tr(`equip.distrib.${m}`)}
            </button>
          ))}
        </div>
      )}
      <label className="build-equip-autorotate" title={tr('equip.autoRotateTitle')}>
        <input
          type="checkbox"
          checked={autoRotate}
          onChange={(e) => setAutoRotate(e.target.checked)}
          data-testid="equip-autorotate"
        />
        <span>{tr('equip.autoRotate')}</span>
      </label>
      <div className="build-equip-margin-row" title={tr('equip.marginTitle')}>
        <span className="build-equip-margin-label">{tr('equip.margin')}</span>
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.1}
          value={margin}
          onChange={(e) => setMargin(parseFloat(e.target.value))}
          className="build-equip-margin-slider"
          aria-label={tr('equip.marginAria')}
          data-testid="equip-margin"
        />
        <span className="build-equip-margin-val">{margin === 0 ? 'Aucune' : `${margin.toFixed(1)} m`}</span>
      </div>
    </div>
  );
}

/** Champs de réglage de la forme et de la taille du plateau. */
function StageSettingsFields({ vis }: { vis: Vis }) {
  const tr = useT();
  const update = (v: Partial<Vis>) => void act({ type: 'project.update', visualizer: v });
  return (
    <>
      <div className="chips" role="group" aria-label={tr('build.stage')}>
        {SHAPES.map((sh) => (
          <button
            key={sh.id}
            className={`chip ${vis.shape === sh.id ? 'on' : ''}`}
            data-testid={`shape-${sh.id}`}
            onClick={() => update({ shape: sh.id })}
          >
            {sh.label}
          </button>
        ))}
      </div>
      <div className="scene-card-grid">
        <Num label={tr('build.stageWidth')} title={tr('build.stageWidthTitle')} value={vis.stageWidth} min={2} max={200} step={1} onChange={(v) => update({ stageWidth: v })} />
        <Num label={tr('build.stageDepth')} title={tr('build.stageDepthTitle')} value={vis.stageDepth} min={2} max={200} step={1} onChange={(v) => update({ stageDepth: v })} />
        {vis.shape !== 'arena' && (
          <label className="row small scene-check">
            <input type="checkbox" checked={vis.cyclo} onChange={(e) => update({ cyclo: e.target.checked })} data-testid="cyclo" />
            Cyclorama
          </label>
        )}
        {vis.shape === 'thrust' && (
          <>
            <Num label="Avancée L" title="Largeur de l’avancée (m)" value={vis.thrust.width} min={1} max={50} step={0.5} onChange={(v) => update({ thrust: { ...vis.thrust, width: v } })} />
            <Num label="Avancée P" title="Profondeur de l’avancée (m)" value={vis.thrust.depth} min={1} max={50} step={0.5} onChange={(v) => update({ thrust: { ...vis.thrust, depth: v } })} />
          </>
        )}
      </div>
    </>
  );
}

/** Barre d'accès rapide et d'affichage des dimensions du plateau. */
function StageDimensionsBar({ vis, open, onToggle }: { vis: Vis; open: boolean; onToggle: () => void }) {
  const shapeLabel = { rect: 'Rectangle', thrust: 'Avancée', arena: 'Arène' }[vis.shape] ?? 'Rectangle';
  return (
    <div className={`build-stage-bar ${open ? 'on' : ''}`}>
      <button
        type="button"
        className="build-stage-btn"
        onClick={onToggle}
        title={open ? "Replier les réglages du plateau" : "Ouvrir les dimensions et réglages du plateau juste en dessous"}
        data-testid="stage-dimensions-btn"
        aria-expanded={open}
      >
        <span className="build-stage-icon"><Theater size={16} /></span>
        <span className="build-stage-text">
          <b>Plateau & Scène</b>
          <span className="build-stage-dims">{vis.stageWidth} × {vis.stageDepth} m · {shapeLabel}</span>
        </span>
        <span className="build-stage-tag">{open ? 'Fermer' : 'Régler taille'}</span>
        <ChevronUp size={15} className={`build-stage-chevron ${open ? '' : 'flip'}`} />
      </button>
    </div>
  );
}

/** Catalogue of the active category: search, (type filter), tiles, then what of that kind is already on stage. */
function Catalogue({ cat, vis, onBack }: { cat: (typeof CATS)[number]; vis: Vis; onBack: () => void }) {
  const tr = useT();
  const [query, setQuery] = useState('');
  const title = tr(`build.cat.${cat.id}` as MessageKey);
  return (
    <section className="build-catalogue" data-testid={`catalogue-${cat.id}`} aria-label={tr('build.active')}>
      <button className="stage-back-btn" type="button" onClick={onBack} data-testid="build-back" title={tr('build.back')}>
        <ArrowLeft size={16} />
        <span>{tr('build.back')}</span>
      </button>
      <div className="build-active-head">
        <span className="build-active-icon">{cat.icon}</span>
        <span className="build-cat-text"><b>{title}</b><span>{tr('build.activeSub', { cat: title.toLowerCase() })}</span></span>
      </div>
      <input className="input" type="search" placeholder={tr('build.search', { cat: title })} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={tr('build.search', { cat: title })} data-testid="lib-search" />
      {cat.id === 'point' && <FixtureCatalogue query={query} />}
      <LibraryTiles items={LIBRARY.filter(cat.items)} query={query} group={cat.group} title={cat.id === 'point' ? tr('equip.effects') : undefined} />
      {cat.id !== 'point' && <InScene cat={cat.id} vis={vis} />}
    </section>
  );
}

/** Fixture profiles of the library (the same ones the patch and the DMX engine use), filtered by type. */
function FixtureCatalogue({ query }: { query: string }) {
  const tr = useT();
  const { lib } = useResolved();
  const patch = useStore((s) => s.project!.project.patch);
  const placing = useStore((s) => s.placing);
  const [type, setType] = useState<FixtureType | null>(null);
  const profiles = lib.all();
  const inPatch = useMemo(() => {
    const n = new Map<string, number>();
    for (const f of patch) n.set(f.profileId, (n.get(f.profileId) ?? 0) + 1);
    return n;
  }, [patch]);
  const types = FIXTURE_TYPES.filter((ty) => profiles.some((p) => p.type === ty));
  const q = fold(query.trim());
  const shown = profiles.filter((p) => (!type || p.type === type) && (!q || fold(`${p.name} ${p.manufacturer} ${tr(`build.type.${p.type}` as MessageKey)}`).includes(q)));
  if (!profiles.length) return <p className="scene-hint">{tr('build.noProfiles')}</p>;
  return (
    <>
      {types.length > 1 && (
        <div className="chips" role="group" aria-label={tr('build.filterAria')}>
          <button className={`chip ${!type ? 'on' : ''}`} aria-pressed={!type} onClick={() => setType(null)} data-testid="fixture-type-all">{tr('build.filterAll')}</button>
          {types.map((ty) => <button key={ty} className={`chip ${type === ty ? 'on' : ''}`} aria-pressed={type === ty} onClick={() => setType(type === ty ? null : ty)} data-testid={`fixture-type-${ty}`}>{tr(`build.type.${ty}` as MessageKey)}</button>)}
        </div>
      )}
      {!shown.length && <p className="scene-hint">{tr('build.none', { q: query.trim() })}</p>}
      <div className="fixture-catalogue">
        {shown.map((p) => {
          const mode = p.modes[0]!.name;
          const on = placing?.kind === 'fixture' && placing.profileId === p.id;
          const n = inPatch.get(p.id) ?? 0;
          const hint = [tr('build.tileHint', { name: p.name }), p.manufacturer, p.modes.length > 1 ? tr('build.modes', { n: p.modes.length }) : ''].filter(Boolean).join('\n');
          return (
            <button key={p.id} className={`fixture-tile ${on ? 'on' : ''}`} draggable aria-pressed={on} data-testid={`fixture-${p.id}`}
              title={hint}
              onClick={() => useStore.getState().setPlacing(on ? null : { kind: 'fixture', label: p.name, profileId: p.id, mode })}
              onDragStart={(e) => { e.dataTransfer.setData(LIBRARY_MIME, `fixture:${p.id}:${mode}`); e.dataTransfer.effectAllowed = 'copy'; }}>
              {n > 0 && <span className="fixture-tile-count" title={tr('build.inPatch', { n })}>×{n}</span>}
              {p.fictional && <span className="fixture-tile-fictional" title={tr('build.fictionalHint')} aria-label={tr('build.fictional')} />}
              <span className="fixture-tile-glyph"><FixtureGlyph type={p.type} size={42} /></span>
              <b>{p.name}</b>
              <span className="fixture-tile-sub">{tr(`build.type.${p.type}` as MessageKey)} · {tr('build.channels', { n: channelCount(p, mode) })}</span>
            </button>
          );
        })}
      </div>
      <p className="scene-hint">{tr('build.pointHint')}</p>
    </>
  );
}

/** What of the category is already on stage, with quick add and editable cards. */
function InScene({ cat, vis }: { cat: Exclude<BuildCat, 'point'>; vis: Vis }) {
  const tr = useT();
  const inCat = (p: Vis['props'][number]) => (EQUIPMENT[p.kind].category === 'light' ? 'point' : EQUIPMENT[p.kind].category === 'video' ? 'decor' : EQUIPMENT[p.kind].category) === cat;
  const props = vis.props.filter(inCat);
  const count = { structure: vis.trusses.length + props.length, sound: props.length, backline: props.length, decor: props.length, accessory: props.length, performer: vis.performers.length + vis.markers.length, screen: vis.screens.length }[cat];
  const heading = [tr('build.inScene'), tr(`build.cat.${cat}` as MessageKey)].join(' · ');
  return (
    <Section icon={<MapPin size={13} />} title={heading} count={count}>
      <div className="scene-quickadd">
        {cat === 'structure' && <AddBtn kind="truss" label="scene.addTruss" icon={<Boxes size={14} />} testId="truss-add" />}
        {cat === 'decor' && <AddBtn kind="prop" label="scene.addProp" icon={<Armchair size={14} />} testId="prop-add" />}
        {cat === 'performer' && <><AddBtn kind="performer" label="scene.addPerformer" icon={<UserRound size={14} />} testId="performer-add" /><AddBtn kind="marker" label="scene.addMarker" icon={<MapPin size={14} />} testId="marker-add" /></>}
        {cat === 'screen' && <AddBtn kind="screen" label="scene.addScreen" icon={<Monitor size={14} />} testId="screen-add" />}
      </div>
      {cat === 'structure' && vis.trusses.map((t) => <TrussCard key={t.id} t={t} vis={vis} />)}
      {cat !== 'performer' && cat !== 'screen' && props.map((p) => <PropCard key={p.id} p={p} vis={vis} />)}
      {cat === 'performer' && vis.performers.map((pf) => <PerformerCard key={pf.id} pf={pf} vis={vis} />)}
      {cat === 'performer' && vis.markers.map((m) => <MarkerCard key={m.id} m={m} vis={vis} />)}
      {cat === 'screen' && vis.screens.map((sc) => <ScreenCard key={sc.id} sc={sc} vis={vis} />)}
    </Section>
  );
}

const SVG = { stroke: 'currentColor', strokeWidth: 1.8, fill: 'currentColor', fillOpacity: 0.14, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

/** Small drawn front view of a fixture type (no bitmap assets ship with the profiles). */
export function FixtureGlyph({ type, size = 34 }: { type: FixtureProfile['type']; size?: number }) {
  let body: ReactNode;
  if (type.startsWith('moving')) {
    body = <><path d="M8 30h20M12 30V14M24 30V14" {...SVG} /><rect x={11} y={6} width={14} height={14} rx={6} {...SVG} /><circle cx={18} cy={13} r={type === 'moving-head-wash' ? 3.5 : 2} fill="currentColor" /></>;
  } else if (type === 'led-bar') {
    body = <><rect x={3} y={13} width={30} height={10} rx={2} {...SVG} />{[8, 14, 20, 26].map((x) => <circle key={x} cx={x + 1} cy={18} r={1.6} fill="currentColor" />)}</>;
  } else if (type === 'strobe') {
    body = <><rect x={5} y={10} width={26} height={16} rx={2} {...SVG} /><path d="M19 12l-4 6h5l-3 6" {...SVG} /></>;
  } else if (type === 'dimmer') {
    body = <><circle cx={18} cy={17} r={10} {...SVG} /><circle cx={18} cy={17} r={5} {...SVG} /><path d="M18 27v5M12 32h12" {...SVG} /></>;
  } else if (type === 'par') {
    body = <><circle cx={18} cy={17} r={11} {...SVG} />{[[18, 11], [13, 17], [23, 17], [18, 23], [18, 17]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.8} fill="currentColor" />)}</>;
  } else body = <><circle cx={18} cy={18} r={11} {...SVG} /><circle cx={18} cy={18} r={3} fill="currentColor" /></>;
  return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden>{body}</svg>;
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
