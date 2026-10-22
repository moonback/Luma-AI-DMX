import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Copy, EllipsisVertical, Focus, MapPin, PanelRightClose, Trash2 } from 'lucide-react';
import { confirmAction, useStore } from '../../store';
import { act } from '../../api';
import { useT, type MessageKey } from '../../i18n';
import { NumberInput, useResolved, useThrottled } from '../../components/ui';
import { buildVisualModel } from '../../../core/visualizer/model';
import { channelCount, type ResolvedFixture } from '../../../core/fixtures/profiles';
import { PROP_KIND_LABEL, TRUSS_SHAPE_LABEL } from '../../../core/visualizer/library';
import { findElement, type SceneKind, type SceneRef } from '../../../core/visualizer/sceneEdit';
import { duplicateSceneElement, removeSceneElement } from '../../sceneActions';
import { type Vis, ElementCard, FixtureCard } from './sceneCards';
import { FixtureGlyph, LibraryGlyph } from './ScenePanel';

/* Right panel of the Stage page: every element of the scene model (hierarchy), then the inspector of the selection. */

type Target = SceneRef | { kind: 'fixture'; id: string };
interface Row { target: Target; name: string; sub: string; icon: ReactNode; at: { x: number; y: number; height: number } }

/** At most this many fixture cards in the inspector (a whole rig selected stays readable). */
const MAX_FIXTURE_CARDS = 12;

export function SelectionPanel({ vis, mode }: { vis: Vis; mode: '2d' | '3d' | 'split' }) {
  const tr = useT();
  return (
    <aside className="scene-panel select-panel" aria-label={tr('select.title')}>
      <div className="scene-panel-head">
        <h2 className="panel-title grow">{tr('select.title')}</h2>
        <button className="btn ghost sm icon" onClick={() => useStore.getState().setStagePanels({ inspect: false })} title={tr('select.collapse')} aria-label={tr('select.collapse')} data-testid="inspect-collapse"><PanelRightClose size={14} /></button>
      </div>
      <div className="scene-panel-body">
        <section className="inspector" aria-label={tr('select.properties')} data-testid="stage-selection">
          <h3 className="inspector-title">{tr('select.properties')}</h3>
          <Inspector vis={vis} mode={mode} />
        </section>
        <section className="tree-section" aria-label={tr('select.hierarchy')}>
          <h3 className="inspector-title tree-title">{tr('select.hierarchy')}</h3>
          <Hierarchy vis={vis} />
        </section>
      </div>
    </aside>
  );
}

/** Rows of the scene model, grouped by category; a click selects (Ctrl / Maj adds fixtures), ⋮ opens the actions. */
function Hierarchy({ vis }: { vis: Vis }) {
  const tr = useT();
  const { fixtures } = useResolved();
  const selection = useStore((s) => s.selection);
  const sceneSel = useStore((s) => s.sceneSel);
  const [menu, setMenu] = useState<string | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => { if (!(e.target as HTMLElement).closest?.('.tree-menu, .tree-more')) setMenu(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', onKey); };
  }, [menu]);
  const groups = useMemo(() => {
    const el = (kind: SceneKind, e: { id: string; name: string; x: number; y: number }, sub: string, preset: Record<string, unknown>, height = 0): Row =>
      ({ target: { kind, id: e.id }, name: e.name, sub, icon: <LibraryGlyph item={{ kind, preset }} size={20} />, at: { x: e.x, y: e.y, height } });
    const g: { key: MessageKey; rows: Row[] }[] = [
      { key: 'select.group.fixtures', rows: fixtures.map((f) => fixtureRow(f, tr)) },
      { key: 'select.group.trusses', rows: vis.trusses.map((t) => el('truss', t, TRUSS_SHAPE_LABEL[t.shape], { shape: t.shape, length: t.length, support: t.support }, t.height)) },
      { key: 'select.group.props', rows: vis.props.map((p) => el('prop', p, PROP_KIND_LABEL[p.kind], { kind: p.kind }, p.height)) },
      { key: 'select.group.performers', rows: vis.performers.map((pf) => el('performer', pf, pf.kind, {}, 1.7)) },
      { key: 'select.group.markers', rows: vis.markers.map((m) => el('marker', m, tr('select.group.markers'), {})) },
      { key: 'select.group.screens', rows: vis.screens.map((sc) => el('screen', sc, `${sc.width} × ${sc.height} m`, {}, sc.elevation + sc.height / 2)) },
    ];
    return g.filter((x) => x.rows.length);
  }, [fixtures, vis, tr]);
  const isSel = (t: Target) => (t.kind === 'fixture' ? selection.includes(t.id) : sceneSel?.kind === t.kind && sceneSel.id === t.id);
  const select = (t: Target, add: boolean) => {
    const st = useStore.getState();
    if (t.kind !== 'fixture') st.setSceneSel(t);
    else if (add) st.setSelection(selection.includes(t.id) ? selection.filter((x) => x !== t.id) : [...selection, t.id]);
    else st.setSelection([t.id]);
  };
  if (!groups.length) return <p className="scene-hint tree-empty" data-testid="hierarchy-empty">{tr('select.emptyScene')}</p>;
  return (
    <nav className="tree" aria-label={tr('select.hierarchy')} data-testid="hierarchy">
      {groups.map((g) => (
        <details key={g.key} className="tree-group" open>
          <summary><span className="grow">{tr(g.key)}</span><span className="badge">{g.rows.length}</span></summary>
          {g.rows.map((r) => {
            const key = `${r.target.kind}:${r.target.id}`;
            return (
              <div key={key} className={`tree-row ${isSel(r.target) ? 'on' : ''}`} data-testid="tree-row">
                <button className="tree-main" aria-pressed={isSel(r.target)} onClick={(e) => select(r.target, e.ctrlKey || e.metaKey || e.shiftKey)} onDoubleClick={() => useStore.getState().frameOn(r.at)}>
                  <span className="tree-icon">{r.icon}</span>
                  <span className="tree-text"><b title={r.name}>{r.name}</b><span title={r.sub}>{r.sub}</span></span>
                </button>
                <button className="tree-more btn ghost sm icon" aria-haspopup="menu" aria-expanded={menu === key} aria-label={tr('select.actions', { name: r.name })} title={tr('select.actions', { name: r.name })}
                  onClick={() => setMenu(menu === key ? null : key)} data-testid="tree-more"><EllipsisVertical size={14} /></button>
                {menu === key && <RowMenu row={r} onClose={() => setMenu(null)} />}
              </div>
            );
          })}
        </details>
      ))}
    </nav>
  );
}

function fixtureRow(f: ResolvedFixture, tr: ReturnType<typeof useT>): Row {
  const x = f.fixture;
  return {
    target: { kind: 'fixture', id: x.id }, name: x.name, sub: `${tr(`build.type.${f.profile.type}` as MessageKey)} · ${x.universe}.${String(x.address).padStart(3, '0')}`,
    icon: <FixtureGlyph type={f.profile.type} size={20} />, at: { x: x.position.x, y: x.position.y, height: x.height },
  };
}

/** Secondary actions of a hierarchy row; delete stands apart (fixtures are removed from the patch after confirmation). */
function RowMenu({ row, onClose }: { row: Row; onClose: () => void }) {
  const tr = useT();
  const t = row.target;
  const run = (fn: () => void) => () => { onClose(); fn(); };
  const duplicate = () => (t.kind === 'fixture'
    ? void act({ type: 'fixture.duplicate', ids: [t.id] }).then((r) => r && useStore.getState().setSelection(r.ids))
    : duplicateSceneElement(t));
  const remove = async () => {
    if (t.kind !== 'fixture') { removeSceneElement(t); return; }
    if (await confirmAction({ title: tr('select.removeFixtureTitle'), message: tr('select.removeFixtureMessage', { name: row.name }), confirmLabel: tr('select.removeFixtureConfirm') })) void act({ type: 'fixture.remove', ids: [t.id] });
  };
  return (
    <div className="tree-menu" role="menu" data-testid="tree-menu">
      <button role="menuitem" onClick={run(() => useStore.getState().frameOn(row.at))}><Focus size={13} />{tr('select.frame')}</button>
      <button role="menuitem" onClick={run(duplicate)} data-testid="tree-duplicate"><Copy size={13} />{tr('select.duplicate')}</button>
      <hr />
      <button role="menuitem" className="danger" onClick={run(() => void remove())} data-testid="tree-delete"><Trash2 size={13} />{tr('select.delete')}</button>
    </div>
  );
}

/** Properties of the selection, specific to its type (element card, or fixture placement + DMX + programmer). */
function Inspector({ vis, mode }: { vis: Vis; mode: '2d' | '3d' | 'split' }) {
  const tr = useT();
  const selection = useStore((s) => s.selection);
  const sceneSel = useStore((s) => s.sceneSel);
  const values = useStore((s) => s.preview?.values ?? s.values);
  const patch = useStore((s) => s.project!.project.patch);
  const { fixtures, byId } = useResolved();
  const model = useMemo(() => buildVisualModel(fixtures.filter((f) => selection.includes(f.fixture.id)), values), [fixtures, selection, values]);
  if (sceneSel && findElement(vis, sceneSel)) {
    return (
      <div className="col" style={{ gap: 8 }} data-testid="selection-element">
        <ElementCard sel={sceneSel} vis={vis} />
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => duplicateSceneElement(sceneSel)} title={tr('select.duplicate')}><Copy size={12} />{tr('select.duplicate')}</button>
          <span className="grow" />
          <button className="btn sm danger" onClick={() => removeSceneElement(sceneSel)} title={tr('select.delete')} data-testid="inspector-delete"><Trash2 size={12} />{tr('select.delete')}</button>
        </div>
        <p className="scene-hint">{tr('select.frameHint')}</p>
      </div>
    );
  }
  if (!model.length) return <p className="scene-hint" data-testid="selection-empty"><MapPin size={12} /> {tr('select.empty')}</p>;
  const one = model.length === 1 ? byId.get(model[0]!.id) : undefined;
  const extra = model.length - MAX_FIXTURE_CARDS;
  return (
    <div className="col" style={{ gap: 8 }}>
      {model.slice(0, MAX_FIXTURE_CARDS).map((f) => <FixtureCard key={f.id} f={f} fixture={patch.find((x) => x.id === f.id)} trusses={vis.trusses} beamView={mode !== '2d'} />)}
      {extra > 0 && <p className="scene-hint">{tr('select.more', { n: extra })}</p>}
      {one && <FixtureDmx f={one} />}
      <LiveControls ids={model.map((f) => f.id)} color={model[0]!.color} intensity={values[model[0]!.id]?.dimmer ?? model[0]!.intensity} resolved={model.map((f) => byId.get(f.id)).filter((x): x is ResolvedFixture => !!x)} />
      <p className="scene-hint">{tr('select.frameHint')}</p>
    </div>
  );
}

/** Patch fields of one fixture: name, universe, address and mode (overlaps are refused by the main process). */
function FixtureDmx({ f }: { f: ResolvedFixture }) {
  const tr = useT();
  const universes = useStore((s) => s.project!.project.show.universes);
  const x = f.fixture;
  const update = (patch: Record<string, unknown>) => void act({ type: 'fixture.update', id: x.id, patch });
  const chans = channelCount(f.profile, x.mode);
  return (
    <div className="scene-card" data-testid="fixture-dmx">
      <div className="row between"><b>{tr('select.dmx')}</b><span className="small muted mono">{tr('select.channelsRange', { from: x.address, to: x.address + chans - 1 })}</span></div>
      <div className="scene-card-grid">
        <label className="scene-num span3"><span>{tr('select.name')}</span>
          <input key={x.name} className="input" defaultValue={x.name} maxLength={80} aria-label={tr('select.name')} data-testid="fixture-name"
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== x.name) update({ name: v }); else e.target.value = x.name; }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        </label>
        <label className="scene-num"><span>{tr('select.universe')}</span><NumberInput value={x.universe} min={1} max={universes} onChange={(v) => update({ universe: Math.round(v) })} /></label>
        <label className="scene-num" data-testid="fixture-address"><span>{tr('select.address')}</span><NumberInput value={x.address} min={1} max={512 - chans + 1} onChange={(v) => update({ address: Math.round(v) })} /></label>
        <label className="scene-num"><span>{tr('select.mode')}</span>
          <select className="select" value={x.mode} onChange={(e) => update({ mode: e.target.value })} data-testid="fixture-mode">
            {f.profile.modes.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

const COLOR_ATTR = /^(red|green|blue|white|amber|uv|cyan|magenta|yellow|color)/u;

/** Intensity and colour of the selected fixtures, through the programmer (the same path as the Live Console). */
function LiveControls({ ids, color, intensity, resolved }: { ids: string[]; color: string; intensity: number; resolved: ResolvedFixture[] }) {
  const tr = useT();
  const hasDimmer = resolved.some((f) => f.attributes.includes('dimmer'));
  const hasColor = resolved.some((f) => f.attributes.some((a) => COLOR_ATTR.test(a)));
  const [level, setLevel] = useState(intensity);
  useEffect(() => setLevel(intensity), [intensity]);
  const sendDimmer = useThrottled((v: number) => void act({ type: 'programmer.set', fixtureIds: ids, values: { dimmer: v }, confirmSpecial: false }), 50);
  const sendColor = useThrottled((c: string) => void act({ type: 'programmer.setColor', fixtureIds: ids, color: c }), 80);
  if (!hasDimmer && !hasColor) return null;
  return (
    <div className="scene-card" data-testid="fixture-live">
      <b>{tr('select.live')}</b>
      {hasDimmer && (
        <label className="scene-num"><span>{tr('select.intensity', { n: Math.round(level * 100) })}</span>
          <input type="range" min={0} max={100} value={Math.round(level * 100)} data-testid="fixture-intensity"
            onChange={(e) => { const v = Number(e.target.value) / 100; setLevel(v); sendDimmer(v); }} />
        </label>
      )}
      {hasColor && (
        <label className="scene-num"><span>{tr('select.color')}</span>
          <input type="color" className="scene-color" value={/^#[0-9a-f]{6}$/iu.test(color) ? color : '#ffffff'} onChange={(e) => sendColor(e.target.value)} data-testid="fixture-color" />
        </label>
      )}
      <span className="small dim">{tr('select.liveHint')}</span>
    </div>
  );
}
