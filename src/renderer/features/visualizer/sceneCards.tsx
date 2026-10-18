import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Crosshair, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { act } from '../../api';
import { NumberInput } from '../../components/ui';
import type { VisualFixture } from '../../../core/visualizer/model';
import type { Fixture, FixtureMount, Performer, Project, StageMarker, StageProp, StageScreen, Truss } from '../../../core/model/schemas';
import { floorAt, performerSpot } from '../../../core/visualizer/lighting';
import { setScreenVideo, screenVideo } from '../../screenMedia';
import { PROP_KIND_LABEL, TRUSS_LENGTH_LABEL, TRUSS_SHAPE_LABEL } from '../../../core/visualizer/library';
import { findElement, withPatched, type SceneRef } from '../../../core/visualizer/sceneEdit';
import { hangFixture, removeSceneElement } from '../../sceneActions';

/* Cards of the scene panel: one per stage element or selected fixture, plus their small shared fields. */

export type Vis = Project['visualizer'];

/** Open / closed state the user chose per section, kept while the panel is closed or switches tab. */
const sectionOpen = new Map<string, boolean>();

/** Collapsible panel section (native details element: keyboard accessible); a closed section renders nothing, so long lists cost nothing. */
export function Section({ icon, title, count, open = true, children }: { icon: ReactNode; title: string; count?: number; open?: boolean; children: ReactNode }) {
  const [isOpen, setOpen] = useState(() => sectionOpen.get(title) ?? open);
  return (
    <details className="scene-section" open={isOpen} onToggle={(e) => { const o = e.currentTarget.open; sectionOpen.set(title, o); setOpen(o); }}>
      <summary>{icon}<span className="grow">{title}</span>{count !== undefined && <span className="badge">{count}</span>}</summary>
      {isOpen && <div className="scene-section-body">{children}</div>}
    </details>
  );
}

/** Labeled numeric field of a scene card. */
export function Num({ label, title, value, min, max, step = 0.25, onChange }: { label: string; title: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return <label className="scene-num" title={title}><span>{label}</span><NumberInput value={value} min={min} max={max} step={step} onChange={onChange} /></label>;
}

/** Name field committed on blur; `key` resets it when the saved name changes (undo, template). */
function NameInput({ value, label, onChange }: { value: string; label: string; onChange: (name: string) => void }) {
  return (
    <input key={value} className="input grow" defaultValue={value} maxLength={80} aria-label={label}
      onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== value) onChange(name); else e.target.value = value; }} />
  );
}

/** Stage point a card frames on double-click (3D camera). */
export type At = { x: number; y: number; height: number };

/** Double-click on a card (not on one of its fields) frames the element in the 3D view. */
const frameOnDoubleClick = (at: At) => (e: React.MouseEvent) => { if (!(e.target as HTMLElement).closest('input,select,button,label')) useStore.getState().frameOn(at); };

/** Element card; clicking or focusing it selects the element (Ctrl+D, Suppr, Ctrl+C apply to it), double-click frames it in 3D. */
function Card({ testId, sel, at, head, children }: { testId: string; sel: SceneRef; at: At; head: ReactNode; children?: ReactNode }) {
  const selected = useStore((s) => s.sceneSel?.id === sel.id);
  const el = useRef<HTMLDivElement>(null);
  // Selected from the 2D / 3D view: bring the card into sight.
  useEffect(() => { if (selected && !el.current?.contains(document.activeElement)) el.current?.scrollIntoView({ block: 'nearest' }); }, [selected]);
  const select = () => { if (!selected) useStore.getState().setSceneSel(sel); };
  return (
    <div ref={el} className={`scene-card ${selected ? 'on' : ''}`} data-testid={testId} onPointerDown={select} onFocus={select} onDoubleClick={frameOnDoubleClick(at)}>
      <div className="row" style={{ gap: 6 }}>{head}</div>
      {children && <div className="scene-card-grid">{children}</div>}
    </div>
  );
}

const DeleteBtn = ({ name, title, sel }: { name: string; title?: string; sel: SceneRef }) => (
  <button className="btn ghost sm icon" title={title ?? `Supprimer « ${name} » (Suppr)`} aria-label={`Supprimer ${name}`} onClick={() => removeSceneElement(sel)}><Trash2 size={12} /></button>
);

const PROP_KINDS = Object.entries(PROP_KIND_LABEL) as [StageProp['kind'], string][];

const TRUSS_SHAPES = Object.entries(TRUSS_SHAPE_LABEL) as [Truss['shape'], string][];

const PERFORMER_KINDS: { id: Performer['kind']; label: string }[] = [
  { id: 'standing', label: 'Debout' }, { id: 'seated', label: 'Assis' }, { id: 'drums', label: 'Batterie' }, { id: 'keys', label: 'Clavier' }, { id: 'lectern', label: 'Pupitre' },
];

const SCREEN_SOURCES: { id: StageScreen['source']; label: string }[] = [
  { id: 'color', label: 'Couleur' }, { id: 'image', label: 'Image' }, { id: 'video', label: 'Vidéo' }, { id: 'pixels', label: 'Pixel mapping' },
];

/** Images are downscaled before being stored in the project (keeps project files small). */
const SCREEN_IMAGE_MAX_PX = 512;

export function shrinkImage(file: File, max = SCREEN_IMAGE_MAX_PX): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(img.width * k)), height: Math.max(1, Math.round(img.height * k)) });
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}

/** Changes fields of one stage element (any kind). */
const patchEl = (vis: Vis, ref: SceneRef, patch: Record<string, unknown>) => void act({ type: 'project.update', visualizer: withPatched(vis, ref, patch) });

export function MarkerCard({ m, vis }: { m: StageMarker; vis: Vis }) {
  const sel: SceneRef = { kind: 'marker', id: m.id };
  const set = (patch: Partial<StageMarker>) => patchEl(vis, sel, patch);
  return (
    <Card testId="marker-row" sel={sel} at={{ x: m.x, y: m.y, height: m.height }} head={<><NameInput value={m.name} label="Nom du point" onChange={(name) => set({ name })} /><DeleteBtn name={m.name} sel={sel} /></>}>
      <Num label="X" title="Jardin ↔ cour (m)" value={m.x} min={-100} max={100} step={0.1} onChange={(v) => set({ x: v })} />
      <Num label="Y" title="Profondeur (m)" value={m.y} min={-100} max={100} step={0.1} onChange={(v) => set({ y: v })} />
      <Num label="H visée" title="Hauteur de visée (m)" value={m.height} min={0} max={10} step={0.1} onChange={(v) => set({ height: v })} />
    </Card>
  );
}

export function PropCard({ p, vis }: { p: StageProp; vis: Vis }) {
  const sel: SceneRef = { kind: 'prop', id: p.id };
  const set = (patch: Partial<StageProp>) => patchEl(vis, sel, patch);
  return (
    <Card testId="prop-row" sel={sel} at={{ x: p.x, y: p.y, height: p.elevation + p.height / 2 }} head={<>
      <NameInput value={p.name} label="Nom de l’élément" onChange={(name) => set({ name })} />
      <select className="select" style={{ width: 110 }} value={p.kind} aria-label="Type" onChange={(e) => set({ kind: e.target.value as StageProp['kind'] })}>
        {PROP_KINDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      <DeleteBtn name={p.name} sel={sel} />
    </>}>
      <Num label="X" title="Centre, jardin ↔ cour (m)" value={p.x} min={-100} max={100} onChange={(v) => set({ x: v })} />
      <Num label="Y" title="Centre, profondeur (m)" value={p.y} min={-100} max={100} onChange={(v) => set({ y: v })} />
      <Num label="Rotation" title="Rotation (°)" value={p.rotation} min={-360} max={360} step={15} onChange={(v) => set({ rotation: v })} />
      <Num label="Largeur" title="Largeur (m)" value={p.width} min={0.05} max={40} step={0.1} onChange={(v) => set({ width: v })} />
      <Num label="Profondeur" title="Profondeur (m)" value={p.depth} min={0.05} max={40} step={0.1} onChange={(v) => set({ depth: v })} />
      <Num label="Hauteur" title="Hauteur (m)" value={p.height} min={0.05} max={20} step={0.1} onChange={(v) => set({ height: v })} />
      <Num label="Élévation" title="Posé à cette hauteur (empilement sur un praticable…)" value={p.elevation} min={0} max={20} step={0.1} onChange={(v) => set({ elevation: v })} />
      <label className="scene-num"><span>Couleur</span>
        <input type="color" value={p.color} aria-label="Couleur" onChange={(e) => set({ color: e.target.value })} className="scene-color" />
      </label>
    </Card>
  );
}

export function TrussCard({ t, vis }: { t: Truss; vis: Vis }) {
  const sel: SceneRef = { kind: 'truss', id: t.id };
  const set = (patch: Partial<Truss>) => patchEl(vis, sel, patch);
  return (
    <Card testId="truss-row" sel={sel} at={{ x: t.x, y: t.y, height: t.height }} head={<>
      <NameInput value={t.name} label="Nom de la structure" onChange={(name) => set({ name })} />
      <select className="select" style={{ width: 104 }} value={t.shape} aria-label="Forme" onChange={(e) => set({ shape: e.target.value as Truss['shape'] })}>
        {TRUSS_SHAPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      <DeleteBtn name={t.name} title={`Supprimer « ${t.name} » (les projecteurs restent en place, décrochés)`} sel={sel} />
    </>}>
      {/* Field order L, X, Y, H, ° is relied upon by the end-to-end tests. */}
      {t.shape !== 'totem' && <Num label={TRUSS_LENGTH_LABEL[t.shape]} title="Taille (m)" value={t.length} min={0.5} max={60} step={0.5} onChange={(v) => set({ length: v })} />}
      <Num label="X" title="Centre, jardin ↔ cour (m)" value={t.x} min={-100} max={100} onChange={(v) => set({ x: v })} />
      <Num label="Y" title="Centre, profondeur (m)" value={t.y} min={-100} max={100} onChange={(v) => set({ y: v })} />
      <Num label="Hauteur" title="Hauteur de la structure (m)" value={t.height} min={0.5} max={30} onChange={(v) => set({ height: v })} />
      <Num label="Rotation" title="Rotation (°)" value={t.rotation} min={-360} max={360} step={15} onChange={(v) => set({ rotation: v })} />
      <label className="scene-num"><span>Support</span>
        <select className="select" value={t.support} aria-label="Support" onChange={(e) => set({ support: e.target.value as Truss['support'] })}>
          <option value="towers">Sur pieds</option>
          <option value="hung">Suspendue</option>
          <option value="none">Posée (assemblage)</option>
        </select>
      </label>
    </Card>
  );
}

export function PerformerCard({ pf, vis }: { pf: Performer; vis: Vis }) {
  const sel: SceneRef = { kind: 'performer', id: pf.id };
  const set = (patch: Partial<Performer>) => patchEl(vis, sel, patch);
  const spot = performerSpot(pf, vis.markers);
  return (
    <Card testId="performer-row" sel={sel} at={{ ...spot, height: floorAt(spot.x, spot.y, vis.props) + 1 }} head={<>
      <NameInput value={pf.name} label="Nom de l’interprète" onChange={(name) => set({ name })} />
      {/* The silhouette must stay the first select of the card (end-to-end tests). */}
      <select className="select" style={{ width: 92 }} value={pf.kind} aria-label="Silhouette" onChange={(e) => set({ kind: e.target.value as Performer['kind'] })}>
        {PERFORMER_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
      </select>
      <DeleteBtn name={pf.name} sel={sel} />
    </>}>
      <label className="scene-num span2"><span>Position</span>
        <select className="select" value={pf.markerId ?? ''} aria-label="Point de scène" data-testid="performer-marker" onChange={(e) => {
          const m = vis.markers.find((x) => x.id === e.target.value);
          set(m ? { markerId: m.id, x: m.x, y: m.y } : { markerId: null });
        }}>
          <option value="">Position libre</option>
          {vis.markers.map((m) => <option key={m.id} value={m.id}>Sur « {m.name} »</option>)}
        </select>
      </label>
      <Num label="Orientation" title="Orientation (0° = face au public)" value={pf.rotation} min={-360} max={360} step={15} onChange={(v) => set({ rotation: v })} />
      {!pf.markerId && (
        <>
          <Num label="X" title="Jardin ↔ cour (m)" value={pf.x} min={-100} max={100} onChange={(v) => set({ x: v })} />
          <Num label="Y" title="Profondeur (m)" value={pf.y} min={-100} max={100} onChange={(v) => set({ y: v })} />
        </>
      )}
    </Card>
  );
}

export function ScreenCard({ sc, vis }: { sc: StageScreen; vis: Vis }) {
  const [, rerender] = useState(0);
  const toast = useStore((s) => s.toast);
  const sel: SceneRef = { kind: 'screen', id: sc.id };
  const set = (patch: Partial<StageScreen>) => patchEl(vis, sel, patch);
  return (
    <Card testId="screen-row" sel={sel} at={{ x: sc.x, y: sc.y, height: sc.elevation + sc.height / 2 }} head={<>
      <NameInput value={sc.name} label="Nom de l’écran" onChange={(name) => set({ name })} />
      <DeleteBtn name={sc.name} sel={sel} />
    </>}>
      <label className="scene-num span2"><span>Contenu</span>
        <select className="select" value={sc.source} aria-label="Contenu" data-testid="screen-source" onChange={(e) => set({ source: e.target.value as StageScreen['source'] })}>
          {SCREEN_SOURCES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </label>
      <div className="scene-num">
        <span>&nbsp;</span>
        {sc.source === 'color' && <input type="color" value={sc.color} aria-label="Couleur de l’écran" onChange={(e) => set({ color: e.target.value })} className="scene-color" />}
        {sc.source === 'image' && (
          <label className="btn sm" title="Image (réduite à 512 px et enregistrée dans le projet)">{sc.image ? 'Changer' : 'Image…'}
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) shrinkImage(file).then((image) => set({ image })).catch((err: Error) => toast({ kind: 'error', title: 'Image', detail: err.message }));
            }} />
          </label>
        )}
        {sc.source === 'video' && (
          <label className="btn sm" title="Vidéo lue pendant cette session uniquement : le fichier n’est pas copié dans le projet">{screenVideo(sc.id) ? 'Changer' : 'Vidéo…'}
            <input type="file" accept="video/*" hidden onChange={(e) => { setScreenVideo(sc.id, e.target.files?.[0] ?? null); rerender((n) => n + 1); }} />
          </label>
        )}
      </div>
      <Num label="X" title="Centre, jardin ↔ cour (m)" value={sc.x} min={-100} max={100} onChange={(v) => set({ x: v })} />
      <Num label="Y" title="Profondeur (m)" value={sc.y} min={-100} max={100} onChange={(v) => set({ y: v })} />
      <Num label="Bas à" title="Hauteur du bas de l’écran (m)" value={sc.elevation} min={0} max={30} onChange={(v) => set({ elevation: v })} />
      <Num label="Largeur" title="Largeur (m)" value={sc.width} min={0.2} max={60} onChange={(v) => set({ width: v })} />
      <Num label="Hauteur" title="Hauteur (m)" value={sc.height} min={0.2} max={30} onChange={(v) => set({ height: v })} />
      <Num label="Rotation" title="Rotation (0° = face au public)" value={sc.rotation} min={-360} max={360} step={15} onChange={(v) => set({ rotation: v })} />
      <label className="scene-num span3" title="Lumière diffusée sur le plateau et la brume"><span>Halo {Math.round(sc.glow * 100)} %</span>
        <input type="range" min={0} max={100} value={Math.round(sc.glow * 100)} onChange={(e) => set({ glow: Number(e.target.value) / 100 })} />
      </label>
    </Card>
  );
}

/** Card of any stage element. */
export function ElementCard({ sel, vis }: { sel: SceneRef; vis: Vis }) {
  const el = findElement(vis, sel);
  if (!el) return null;
  switch (sel.kind) {
    case 'marker': return <MarkerCard m={el as StageMarker} vis={vis} />;
    case 'truss': return <TrussCard t={el as Truss} vis={vis} />;
    case 'prop': return <PropCard p={el as StageProp} vis={vis} />;
    case 'performer': return <PerformerCard pf={el as Performer} vis={vis} />;
    default: return <ScreenCard sc={el as StageScreen} vis={vis} />;
  }
}

const MOUNTS: { id: FixtureMount; label: string }[] = [
  { id: 'auto', label: 'Auto (hauteur)' }, { id: 'hanging', label: 'Suspendu' }, { id: 'floor', label: 'Posé au sol' }, { id: 'wall', label: 'Mural' },
];

/** Selected fixture: live state, placement, mounting, truss, and the beam's-eye view in 3D. */
export function FixtureCard({ f, fixture, trusses, beamView }: { f: VisualFixture; fixture: Fixture | undefined; trusses: readonly Truss[]; beamView: boolean }) {
  const following = useStore((s) => s.beamView === f.id);
  const update = (patch: Record<string, unknown>) => void act({ type: 'fixture.update', id: f.id, patch });
  return (
    <div className="scene-card on" data-testid="stage3d-info" onDoubleClick={frameOnDoubleClick({ x: f.x, y: f.y, height: f.height })}>
      <div className="row between"><b>{f.name}</b><span className="badge">{f.type}</span></div>
      <div className="row small"><span className="swatch-btn" style={{ width: 16, height: 16, background: f.color }} />{f.color.toUpperCase()} · {Math.round(f.intensity * 100)} %</div>
      {f.movable && <div className="small muted">Pan {f.panDeg.toFixed(0)}° · Tilt {f.tiltDeg.toFixed(0)}°</div>}
      <div className="small muted">Faisceau {f.beamAngle.toFixed(0)}°{f.strobeHz ? ` · strobe ≈ ${f.strobeHz.toFixed(1)} Hz` : ''}{f.gobo ? ` · gobo ${f.gobo}` : ''}{f.prism ? ' · prisme' : ''}{f.cells.length ? ` · ${f.cells.length} cellules` : ''}</div>
      {fixture && (
        <div className="scene-card-grid">
          <Num label="X" title="Jardin ↔ cour (m)" value={fixture.position.x} min={-100} max={100} step={0.1} onChange={(v) => update({ position: { ...fixture.position, x: v } })} />
          <Num label="Y" title="Profondeur (m)" value={fixture.position.y} min={-100} max={100} step={0.1} onChange={(v) => update({ position: { ...fixture.position, y: v } })} />
          <Num label="Hauteur" title="Hauteur (m)" value={fixture.height} min={0} max={50} step={0.1} onChange={(v) => update({ height: v })} />
          <Num label="Rotation" title="Rotation (°)" value={fixture.rotation} min={-360} max={360} step={15} onChange={(v) => update({ rotation: v })} />
          <label className="scene-num"><span>Accroche</span>
            <select className="select" value={fixture.mount ?? 'auto'} onChange={(e) => update({ mount: e.target.value as FixtureMount })} data-testid="mount">
              {MOUNTS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <Num label="Inclinaison" title="Inclinaison de l’accroche vers la salle (mural : vers le bas), en degrés" value={fixture.mountTilt ?? 0} min={-90} max={90} step={5} onChange={(v) => update({ mountTilt: v })} />
          <label className="scene-num span3"><span>Structure</span>
            <select className="select" value={fixture.trussId ?? ''} data-testid="fixture-truss" onChange={(e) => {
              const t = trusses.find((x) => x.id === e.target.value);
              if (t) hangFixture(fixture, t);
              else update({ trussId: null });
            }}>
              <option value="">{trusses.length ? 'Aucune (position libre)' : 'Aucune structure définie'}</option>
              {trusses.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        </div>
      )}
      <span className="small dim">{f.mount === 'floor' ? 'Posé au sol (faisceau vers le haut)' : f.mount === 'wall' ? 'Mural (faisceau vers l’avant)' : 'Suspendu (faisceau vers le bas)'}{(fixture?.mount ?? 'auto') === 'auto' ? ' — auto : au sol sous 1 m' : ''}</span>
      {beamView && (
        <button className={`btn sm ${following ? 'on' : ''}`} onClick={() => useStore.getState().setBeamView(following ? null : f.id)} data-testid="beam-view" title="Placer la caméra dans l’axe du faisceau pour régler un focus">
          <Crosshair size={12} />{following ? 'Quitter la vue projecteur' : 'Vue projecteur'}
        </button>
      )}
    </div>
  );
}
