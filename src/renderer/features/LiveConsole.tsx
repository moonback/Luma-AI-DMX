import { useMemo, useRef, useState } from 'react';
import { Eraser, Save, SlidersHorizontal } from 'lucide-react';
import { useStore, confirmAction, EMPTY_OBJ } from '../store';
import { useT } from '../i18n';
import { act } from '../api';
import { Empty, Modal, Field, PageHead, Panel, pct, useResolved, useThrottled } from '../components/ui';
import { attributeClass, attributeLabel, EMITTER_ATTRIBUTES, type AttributeClass } from '../../core/fixtures/attributes';
import { cellColors, colorCapability, colorCells, displayColor } from '../../core/fixtures/color';
import { channelKey, coarseChannel, type ResolvedFixture } from '../../core/fixtures/profiles';
import { findModule, moduleDimmerKeys, moduleOfCell } from '../../core/fixtures/modules';
import { rgbToHex } from '../../core/util/math';
import type { Channel } from '../../core/model/schemas';

const QUICK_COLORS = ['#FFFFFF', '#FF0000', '#FF7000', '#FFD000', '#00FF40', '#00E5FF', '#0040FF', '#8B00FF', '#FF00C8', '#FFB000'];

/** Fixture ids holding programmer values (the « touched » state shown on tiles and panels). */
const touchedIds = (programmer: Record<string, Record<string, number>>, ids: string[]) => ids.filter((id) => Object.keys(programmer[id] ?? {}).length > 0);

/** Evenly spread `from` → `to` over `n` fixtures (selection order). */
export const fanValues = (n: number, from: number, to: number): number[] => Array.from({ length: n }, (_, i) => (n < 2 ? from : from + ((to - from) * i) / (n - 1)));

export function FixtureTiles({ onPick }: { onPick?: () => void }) {
  const tr = useT();
  const { fixtures } = useResolved();
  const values = useStore((s) => s.values);
  const programmer = useStore((s) => s.runtime?.programmer ?? EMPTY_OBJ) as Record<string, Record<string, number>>;
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const groups = useStore((s) => s.project!.project.groups);
  const all = fixtures.map((f) => f.fixture.id);
  const types = [...new Set(fixtures.map((f) => f.profile.type))];
  const touched = touchedIds(programmer, all);
  const parity = (rest: number) => (selection.length > 1 ? selection : all).filter((_, i) => i % 2 === rest);
  const click = (id: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) setSelection(selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id]);
    else setSelection(selection.length === 1 && selection[0] === id ? [] : [id]);
    onPick?.();
  };
  const same = (ids: string[]) => ids.length > 0 && ids.length === selection.length && ids.every((id) => selection.includes(id));
  return (
    <div className="col">
      <div className="sel-bar">
        <div className="chips" role="group" aria-label={tr('console.select.aria')}>
          <button className="chip" onClick={() => setSelection(all)}>{tr('console.select.all')}</button>
          <button className="chip" onClick={() => setSelection([])}>{tr('console.select.none')}</button>
          <button className="chip" onClick={() => setSelection(all.filter((id) => !selection.includes(id)))}>{tr('console.select.invert')}</button>
          <button className="chip" title={tr('console.select.oddEvenHint')} onClick={() => setSelection(parity(0))}>{tr('console.select.odd')}</button>
          <button className="chip" title={tr('console.select.oddEvenHint')} onClick={() => setSelection(parity(1))}>{tr('console.select.even')}</button>
          {touched.length > 0 && <button className={`chip touched ${same(touched) ? 'on' : ''}`} title={tr('console.select.touchedHint')} onClick={() => setSelection(touched)}>{tr('console.select.touched')} <span className="dim">{touched.length}</span></button>}
        </div>
        <span className="small muted mono">{tr('console.select.count', { n: selection.length, total: all.length })}</span>
      </div>
      {(types.length > 1 || groups.length > 0) && (
        <div className="chips">
          {types.length > 1 && types.map((ty) => {
            const ids = fixtures.filter((f) => f.profile.type === ty).map((f) => f.fixture.id);
            return <button key={ty} className={`chip ${same(ids) ? 'on' : ''}`} onClick={() => setSelection(ids)}>{tr(`console.type.${ty}`)} <span className="dim">{ids.length}</span></button>;
          })}
          {groups.map((g) => (
            <button key={g.id} className={`chip ${same(g.fixtureIds) ? 'on' : ''}`} style={{ borderLeft: `3px solid ${g.color}` }} onClick={() => setSelection(g.fixtureIds)}>
              {g.name} <span className="dim">{g.fixtureIds.length}</span>
            </button>
          ))}
        </div>
      )}
      <div className="fx-grid" data-testid="fixture-tiles">
        {fixtures.map((rf) => {
          const d = displayColor(rf, values[rf.fixture.id] ?? {});
          const c = d.color;
          const isTouched = touched.includes(rf.fixture.id);
          return (
            <div key={rf.fixture.id} className={`fx-tile ${selection.includes(rf.fixture.id) ? 'sel' : ''} ${isTouched ? 'touched' : ''}`} onClick={(e) => click(rf.fixture.id, e)} title={tr('console.tile.hint')}>
              {isTouched && <span className="prog" title={tr('console.tile.touched')}>P</span>}
              <div className="fx-name">{rf.fixture.name}</div>
              <div className="addr">{rf.fixture.universe}.{rf.fixture.address} · {pct(d.intensity)}</div>
              <div className="swatch" style={{ background: `rgb(${c.r * d.intensity * 255},${c.g * d.intensity * 255},${c.b * d.intensity * 255})` }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Slider({ label, value, onChange, source, title, touched }: { label: string; value: number; onChange: (v: number) => void; source?: string; title?: string; touched?: boolean }) {
  return (
    <div className={`ctl-row ${touched ? 'touched' : ''}`} title={title}>
      <span className="lbl">{label}</span>
      <input type="range" min={0} max={255} value={Math.round(value * 255)} aria-label={label} onChange={(e) => onChange(Number(e.target.value) / 255)} />
      <span className="mono small">{Math.round(value * 255)} {source && <span className="tag-src" title="Source qui contrôle la valeur">{source}</span>}</span>
    </div>
  );
}

function RangeChips({ channel, attr, set, current }: { channel: Channel; attr: string; set: (attr: string, v: number, special: boolean) => void; current: number }) {
  const dmx = Math.round(current * 255);
  return (
    <div className="col" style={{ gap: 4, padding: '4px 0' }}>
      <span className="lbl muted small">{channel.name}</span>
      <div className="chips">
        {channel.ranges.map((r, i) => (
          <button
            key={i}
            className={`chip ${dmx >= r.from && dmx <= r.to ? 'on' : ''} ${r.dangerous ? 'danger' : ''}`}
            title={`${r.from}–${r.to}${r.dangerous ? ' · fonction spéciale : confirmation requise' : ''}`}
            onClick={() => set(attr, Math.round((r.from + r.to) / 2) / 255, r.dangerous)}
          >
            {r.color && <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: r.color, marginRight: 5 }} />}
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function XYPad({ pan, tilt, onChange }: { pan: number; tilt: number; onChange: (pan: number, tilt: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    if (e.buttons !== 1) return;
    const r = ref.current!.getBoundingClientRect();
    onChange(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
  };
  return (
    <div ref={ref} className="xy" onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); move(e); }} onPointerMove={move} title="Glisser : pan (horizontal) / tilt (vertical)">
      <div className="dot" style={{ left: `${pan * 100}%`, top: `${tilt * 100}%` }} />
    </div>
  );
}

/** Panel action: release only this attribute family (intensity, colour…) on the selection, when the programmer holds some. */
function ReleaseFamily({ ids, classes }: { ids: string[]; classes: AttributeClass[] }) {
  const tr = useT();
  const programmer = useStore((s) => s.runtime?.programmer ?? EMPTY_OBJ) as Record<string, Record<string, number>>;
  const attributes = [...new Set(ids.flatMap((id) => Object.keys(programmer[id] ?? {})))].filter((a) => classes.includes(attributeClass(a)));
  if (!attributes.length) return null;
  return <button className="btn sm" title={tr('console.releaseFamilyHint')} onClick={() => void act({ type: 'programmer.release', fixtureIds: ids, attributes })}><Eraser size={13} />{tr('console.releaseFamily')}</button>;
}

function RecordSceneDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('Nouvelle scène');
  const save = async () => {
    const r = await act({ type: 'scene.record', name: name.trim() || 'Scène' });
    if (r) {
      useStore.getState().toast({ kind: 'success', title: 'Scène enregistrée', detail: 'Retrouvez-la dans Programmer et Cues & Sequences.' });
      onClose();
    }
  };
  return (
    <Modal title="Enregistrer le programmeur comme scène" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn primary" onClick={() => void save()}>Enregistrer</button></>}>
      <Field label="Nom de la scène" hint="Seules les valeurs présentes dans le programmeur (manuel) sont enregistrées."><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} /></Field>
    </Modal>
  );
}

function Controls({ selected }: { selected: ResolvedFixture[] }) {
  const tr = useT();
  const values = useStore((s) => s.values);
  const sources = useStore((s) => s.sources);
  const programmer = useStore((s) => s.runtime?.programmer ?? EMPTY_OBJ) as Record<string, Record<string, number>>;
  const palettes = useStore((s) => s.project!.project.palettes);
  const ids = selected.map((s) => s.fixture.id);
  const first = selected[0]!;
  const cur = (attr: string) => programmer[first.fixture.id]?.[attr] ?? values[first.fixture.id]?.[attr] ?? 0;
  const src = (attr: string) => sources[first.fixture.id]?.[attr];
  const touched = (attr: string) => programmer[first.fixture.id]?.[attr] !== undefined;
  // Fan: one typed programmer.set per fixture (selection order), so no dedicated IPC command is needed.
  const fan = (vals: (v: number) => Record<string, number>, from: number, to: number) =>
    fanValues(ids.length, from, to).forEach((v, i) => void act({ type: 'programmer.set', fixtureIds: [ids[i]!], values: vals(v), confirmSpecial: false }));
  const sendThrottled = useThrottled((vals: Record<string, number>) => void act({ type: 'programmer.set', fixtureIds: ids, values: vals, confirmSpecial: false }), 25);
  const set = async (attr: string, v: number, special = false) => {
    if (special) {
      const ok = await confirmAction({ title: 'Fonction spéciale', message: `« ${attributeLabel(attr)} » : cette valeur déclenche une fonction spéciale du projecteur (reset, extinction lampe…).\nElle sera envoyée immédiatement aux ${ids.length} projecteur(s) sélectionné(s).`, confirmLabel: 'Envoyer' });
      if (!ok) return;
      await act({ type: 'programmer.set', fixtureIds: ids, values: { [attr]: v }, confirmSpecial: true });
      return;
    }
    sendThrottled({ [attr]: v });
  };
  const attrs = useMemo(() => {
    const s = new Set<string>(['dimmer']);
    for (const rf of selected) rf.attributes.forEach((a) => s.add(a));
    return [...s];
  }, [selected]);
  const has = (a: string) => attrs.includes(a);
  const channelFor = (a: string) => selected.map((rf) => coarseChannel(rf.mode, a)).find((c) => c);
  const colorCaps = new Set(selected.map(colorCapability));
  const emitters = EMITTER_ATTRIBUTES.filter(has);
  // Multi-head fixtures: « Toutes » or one head (module) of the first selected fixture's profile.
  const modules = first.profile.modules;
  const [scope, setScope] = useState('');
  const scopeModule = scope ? findModule(first.profile, scope) : undefined;
  const dimmerKeys = modules.length ? moduleDimmerKeys(first, scopeModule) : ['dimmer'];
  const dimmerValues = (v: number) => Object.fromEntries(dimmerKeys.map((k) => [k, v]));
  const setDimmer = (v: number) => sendThrottled(dimmerValues(v));
  const top = cur(dimmerKeys[0] ?? 'dimmer') || 1;
  const panFan = (spread: number) => fan((v) => ({ pan: v }), Math.max(0, cur('pan') - spread), Math.min(1, cur('pan') + spread));
  const colorScope = scopeModule ? { module: scopeModule.name } : {};
  const beam = attrs.filter((a) => attributeClass(a) === 'beam' || attributeClass(a) === 'special');
  const sendColor = useThrottled((hex: string) => void act({ type: 'programmer.setColor', fixtureIds: ids, color: hex, ...colorScope }), 40);
  const d = displayColor(first, values[first.fixture.id] ?? {});

  return (
    <div className="col gap-lg">
      {modules.length > 1 && (
        <div className="chips" role="group" aria-label="Tête">
          {[{ name: '', label: 'Toutes' }, ...modules.map((m) => ({ name: m.name, label: m.name }))].map((m) => (
            <button key={m.name} className={`chip ${scope === m.name ? 'on' : ''}`} aria-pressed={scope === m.name} onClick={() => setScope(m.name)}>{m.label}</button>
          ))}
        </div>
      )}
      <Panel title={tr('console.family.intensity')} className="fam fam-intensity" actions={<ReleaseFamily ids={ids} classes={['intensity']} />}>
        <div className="row" style={{ alignItems: 'flex-end', gap: 18 }}>
          <div className="fader">
            <span className="val">{pct(cur(dimmerKeys[0] ?? 'dimmer'))}</span>
            <input type="range" min={0} max={255} value={Math.round(cur(dimmerKeys[0] ?? 'dimmer') * 255)} aria-label="Intensité" data-testid="dimmer-fader" onChange={(e) => setDimmer(Number(e.target.value) / 255)} />
            <span className="lbl">Dimmer{!first.attributes.includes('dimmer') && <><br /><span className="dim">virtuel</span></>}</span>
            {src('dimmer') && <span className="tag-src">{src('dimmer')}</span>}
          </div>
          <div className="col">
            <div className="row">
              {[0, 0.25, 0.5, 0.75, 1].map((v) => <button key={v} className="btn sm" onClick={() => setDimmer(v)}>{v * 100}%</button>)}
            </div>
            <div className="row" title={tr('console.fanHint')}>
              <span className="small muted">{tr('console.fan')}</span>
              <button className="btn sm" disabled={ids.length < 2} onClick={() => fan(dimmerValues, 0, top)}>{tr('console.fanUp')}</button>
              <button className="btn sm" disabled={ids.length < 2} onClick={() => fan(dimmerValues, top, 0)}>{tr('console.fanDown')}</button>
            </div>
            <div className="small muted">Le manuel est toujours prioritaire. « Relâcher » rend la main aux cues, effets et IA.</div>
          </div>
        </div>
      </Panel>

      {colorCaps.size > 0 && !(colorCaps.size === 1 && colorCaps.has('none')) && (
        <Panel title={tr('console.family.color')} className="fam fam-color" actions={<ReleaseFamily ids={ids} classes={['color']} />}>
          <div className="col">
            <div className="row">
              <input type="color" value={rgbToHex(d.color)} onChange={(e) => sendColor(e.target.value)} title="Couleur convertie selon les capacités de chaque projecteur (RGB, RGBW, roue)" />
              <div className="swatches">
                {QUICK_COLORS.map((c) => <button key={c} className="swatch-btn" style={{ background: c }} title={c} onClick={() => void act({ type: 'programmer.setColor', fixtureIds: ids, color: c, ...colorScope })} />)}
              </div>
            </div>
            {emitters.map((a) => <Slider key={a} label={attributeLabel(a)} value={cur(a)} source={src(a)} touched={touched(a)} onChange={(v) => set(a, v)} />)}
            {has('colorWheel') && channelFor('colorWheel') && <RangeChips channel={channelFor('colorWheel')!} attr="colorWheel" current={cur('colorWheel')} set={set} />}
            {['cyan', 'magenta', 'yellow', 'cto'].filter(has).map((a) => <Slider key={a} label={attributeLabel(a)} value={cur(a)} source={src(a)} touched={touched(a)} onChange={(v) => set(a, v)} />)}
          </div>
        </Panel>
      )}

      {colorCells(first).length > 0 && (
        <Panel title={`Cellules — ${first.fixture.name}`}>
          <div className="col">
            <div className="row wrap">
              {cellColors(first, values[first.fixture.id] ?? {}).map(({ cell, color }) => (
                <label key={cell} className="col" style={{ alignItems: 'center', gap: 2 }} title={`Couleur de la cellule ${cell} (toutes les barres sélectionnées ayant cette cellule)`}>
                  <input type="color" aria-label={`Cellule ${cell}`} value={rgbToHex(color.r + color.g + color.b > 0 ? color : { r: 0, g: 0, b: 0 })} onChange={(e) => void act({ type: 'programmer.setColor', fixtureIds: ids, color: e.target.value, cell })} />
                  <span className="small dim">{moduleOfCell(first.profile, cell)?.name ?? cell}</span>
                </label>
              ))}
            </div>
            <span className="small dim">Le sélecteur « Couleur » ci-dessus applique la couleur à toutes les cellules. Les effets Rainbow et Color cycle se répartissent cellule par cellule.</span>
          </div>
        </Panel>
      )}

      {(has('pan') || has('tilt')) && (
        <Panel title={tr('console.family.position')} className="fam fam-position" actions={<ReleaseFamily ids={ids} classes={['position']} />}>
          <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
            <XYPad pan={cur('pan')} tilt={cur('tilt')} onChange={(p, t) => sendThrottled({ ...(has('pan') ? { pan: p } : {}), ...(has('tilt') ? { tilt: t } : {}) })} />
            <div className="col grow">
              {has('pan') && <Slider label="Pan (16 bits)" value={cur('pan')} source={src('pan')} touched={touched('pan')} onChange={(v) => set('pan', v)} />}
              {has('tilt') && <Slider label="Tilt (16 bits)" value={cur('tilt')} source={src('tilt')} touched={touched('tilt')} onChange={(v) => set('tilt', v)} />}
              {has('panTiltSpeed') && <Slider label="Vitesse P/T" value={cur('panTiltSpeed')} touched={touched('panTiltSpeed')} onChange={(v) => set('panTiltSpeed', v)} />}
              <div className="row">
                <button className="btn sm" onClick={() => sendThrottled({ pan: 0.5, tilt: 0.5 })}>{tr('console.center')}</button>
                {has('pan') && <button className="btn sm" disabled={ids.length < 2} title={tr('console.fanHint')} onClick={() => panFan(0.15)}>{tr('console.fanPan')}</button>}
              </div>
            </div>
          </div>
        </Panel>
      )}

      {beam.length > 0 && (
        <Panel title={tr('console.family.beam')} className="fam fam-beam" actions={<ReleaseFamily ids={ids} classes={['beam', 'special']} />}>
          {beam.map((a) => {
            const ch = channelFor(a);
            if (!ch) return null;
            return ch.ranges.length ? <RangeChips key={a} channel={ch} attr={a} current={cur(a)} set={set} /> : <Slider key={a} label={ch.name} value={cur(a)} source={src(a)} touched={touched(a)} onChange={(v) => set(a, v)} />;
          })}
        </Panel>
      )}

      {palettes.length > 0 && (
        <Panel title="Palettes">
          <div className="chips">
            {palettes.map((p) => (
              <button key={p.id} className="chip" onClick={() => void act({ type: 'palette.apply', id: p.id, fixtureIds: ids })} title={`Palette ${p.kind}`}>
                {p.color && <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: p.color, marginRight: 5 }} />}{p.name}
              </button>
            ))}
          </div>
        </Panel>
      )}

      <Panel title={`Valeurs DMX — ${first.fixture.name}`}>
        <table className="table small">
          <thead><tr><th>Adr</th><th>Canal</th><th>Valeur</th><th>Source</th></tr></thead>
          <tbody>
            {first.mode.channels.map((c, i) => {
              const key = channelKey(c);
              const v = values[first.fixture.id]?.[key];
              const raw = v === undefined ? c.default : first.mode.channels.some((x) => x.fine && channelKey(x) === key) ? (c.fine ? Math.round(v * 65535) & 255 : Math.round(v * 65535) >> 8) : Math.round(v * 255);
              return <tr key={i}><td className="mono">{first.fixture.universe}.{first.fixture.address + i}</td><td>{c.name}</td><td className="mono">{raw}</td><td>{c.fine ? '' : <span className="tag-src">{sources[first.fixture.id]?.[key] ?? 'défaut'}</span>}</td></tr>;
            })}
          </tbody>
        </table>
        <p className="small dim" style={{ marginBottom: 0 }}>Valeurs calculées par le moteur (avant transmission). L’état réellement transmis est visible dans DMX Output.</p>
      </Panel>
    </div>
  );
}

export function LiveConsole() {
  const { fixtures, byId } = useResolved();
  const selection = useStore((s) => s.selection);
  const rt = useStore((s) => s.runtime);
  const [recording, setRecording] = useState(false);
  const selected = selection.map((id) => byId.get(id)).filter((x): x is ResolvedFixture => !!x);
  const master = useThrottled((v: number) => void act({ type: 'engine.master', value: v }), 30);
  return (
    <div className="page">
      <PageHead title="Live Console" subtitle="Contrôle manuel prioritaire — les contrôles sont générés à partir des profils">
        <div className="row" title="Grand master (intensités)">
          <span className="small muted">Master</span>
          <input type="range" min={0} max={100} style={{ width: 140 }} value={Math.round((rt?.engine.master ?? 1) * 100)} onChange={(e) => master(Number(e.target.value) / 100)} />
          <span className="mono small">{Math.round((rt?.engine.master ?? 1) * 100)}%</span>
        </div>
        <button className="btn" disabled={!selection.length} onClick={() => void act({ type: 'programmer.release', fixtureIds: selection })} title="Relâcher la sélection"><Eraser size={15} />Relâcher sélection</button>
        <button className="btn" onClick={() => void act({ type: 'programmer.release' })} title="Relâcher tout le programmeur (Échap)">Tout relâcher</button>
        <button className="btn primary" disabled={!rt?.engine.programmerCount} onClick={() => setRecording(true)}><Save size={15} />Enregistrer scène</button>
      </PageHead>
      {fixtures.length === 0 ? (
        <Empty icon={<SlidersHorizontal size={32} />} title="Aucun projecteur" action={<button className="btn primary" onClick={() => useStore.getState().setPage('fixtures')}>Ouvrir le patch</button>}>Patchez des projecteurs pour les piloter.</Empty>
      ) : (
        <div className="split console-split">
          <Panel title="Projecteurs"><FixtureTiles /></Panel>
          {selected.length ? <Controls selected={selected} /> : <Panel title="Contrôles"><p className="muted" style={{ margin: 0 }}>Sélectionnez un ou plusieurs projecteurs (ou un groupe) pour afficher leurs contrôles.</p></Panel>}
        </div>
      )}
      {recording && <RecordSceneDialog onClose={() => setRecording(false)} />}
    </div>
  );
}
