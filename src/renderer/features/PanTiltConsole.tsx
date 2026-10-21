/**
 * Console Simplifiée — vue débutant.
 * - Tuiles cliquables : clic = sélectionner/désélectionner, double-clic = ouvrir le modal
 * - Sélection multiple : toutes les actions du modal s'appliquent à TOUTES les machines sélectionnées
 * - Gestion des groupes : créer, sélectionner, supprimer directement depuis cette vue
 */
import { useRef, useState } from 'react';
import { Crosshair, Eraser, Plus, SlidersHorizontal, Trash2, Users, X } from 'lucide-react';
import { useStore, EMPTY_OBJ } from '../store';
import { useT } from '../i18n';
import { act, newId } from '../api';
import { Empty, PageHead, useResolved, useThrottled } from '../components/ui';
import { attributeLabel } from '../../core/fixtures/attributes';
import { colorCapability, displayColor } from '../../core/fixtures/color';
import { coarseChannel } from '../../core/fixtures/profiles';
import { rgbToHex } from '../../core/util/math';
import type { ResolvedFixture } from '../../core/fixtures/profiles';
import type { Channel } from '../../core/model/schemas';

// ─── Constantes ──────────────────────────────────────────────────────────────
const QUICK_COLORS = [
  '#FFFFFF', '#FF0000', '#FF7000', '#FFD000',
  '#00FF40', '#00E5FF', '#0040FF', '#FF00C8',
];

const GROUP_COLORS = ['#8B5CF6', '#22D3EE', '#F59E0B', '#34D399', '#F472B6', '#60A5FA'];

const HIDDEN_BEAM = new Set([
  'speed', 'macro', 'control', 'macroSpeed', 'fog', 'fan', 'dimmerCurve',
  'panTiltSpeed', 'panTiltMode', 'zoomMode',
]);

const SIMPLE_BEAM = ['focus', 'zoom', 'iris', 'frost'];

const TYPE_ICON: Record<string, string> = {
  'moving-head-spot': '🔦',
  'moving-head-wash': '💡',
  par: '💡',
  strobe: '⚡',
  dimmer: '🔆',
  'led-bar': '▬',
  other: '◉',
};

// ─── Slider ──────────────────────────────────────────────────────────────────
function AttrSlider({
  label, value, touched, onChange, showPct = false,
}: {
  label: string; value: number; touched: boolean;
  onChange: (v: number) => void; showPct?: boolean;
}) {
  return (
    <div className={`sc-row ${touched ? 'touched' : ''}`}>
      <span className="lbl">{label}</span>
      <input
        type="range" min={0} max={255}
        value={Math.round(value * 255)}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value) / 255)}
      />
      <span className="mono small">
        {showPct ? `${Math.round(value * 100)}%` : Math.round(value * 255)}
      </span>
    </div>
  );
}

// ─── Chips plages nommées ─────────────────────────────────────────────────────
function ChipRow({ channel, current, onSet }: {
  channel: Channel; current: number; onSet: (v: number) => void;
}) {
  const safeRanges = channel.ranges.filter((r) => !r.dangerous);
  if (safeRanges.length === 0) return null;
  const dmx = Math.round(current * 255);
  return (
    <div className="sc-chips-row">
      <span className="lbl muted small">{channel.name}</span>
      <div className="chips">
        {safeRanges.map((r, i) => (
          <button
            key={i}
            className={`chip ${dmx >= r.from && dmx <= r.to ? 'on' : ''}`}
            onClick={() => onSet(Math.round((r.from + r.to) / 2) / 255)}
          >
            {r.color && (
              <span style={{
                display: 'inline-block', width: 9, height: 9,
                borderRadius: 2, background: r.color, marginRight: 5, flexShrink: 0,
              }} />
            )}
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── XY pad pan / tilt ───────────────────────────────────────────────────────
function XYPad({ pan, tilt, onChange }: {
  pan: number; tilt: number; onChange: (pan: number, tilt: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    if (e.buttons !== 1) return;
    const r = ref.current!.getBoundingClientRect();
    onChange(
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    );
  };
  return (
    <div
      ref={ref} className="xy sc-xy"
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); move(e); }}
      onPointerMove={move}
      title="Pan / Tilt — cliquer-glisser"
    >
      <div className="dot" style={{ left: `${pan * 100}%`, top: `${tilt * 100}%` }} />
    </div>
  );
}

// ─── Séparateur de section ────────────────────────────────────────────────────
function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <div className="sc-section-label" style={{ '--sc-fam': color } as React.CSSProperties}>
      {label}
    </div>
  );
}

// ─── Modal — paramètres de la sélection ──────────────────────────────────────
function SelectionModal({
  selected,
  onClose,
}: {
  selected: ResolvedFixture[];
  onClose: () => void;
}) {
  const tr = useT();
  const values = useStore((s) => s.values);
  const programmer = useStore((s) => s.runtime?.programmer ?? EMPTY_OBJ) as Record<string, Record<string, number>>;

  // IDs de toutes les machines sélectionnées
  const ids = selected.map((rf) => rf.fixture.id);

  // Référence = première machine de la sélection (pour lire les valeurs affichées)
  const ref = selected[0]!;
  const refId = ref.fixture.id;

  const has = (a: string) => selected.some((rf) => rf.attributes.includes(a));
  const cur = (attr: string) => programmer[refId]?.[attr] ?? values[refId]?.[attr] ?? 0;
  const touched = (attr: string) => programmer[refId]?.[attr] !== undefined;
  const anyTouched = ids.some((id) => Object.keys(programmer[id] ?? {}).length > 0);
  const channelFor = (a: string) => coarseChannel(ref.mode, a);

  // Envoie à TOUTES les machines sélectionnées
  const send = useThrottled(
    (vals: Record<string, number>) =>
      void act({ type: 'programmer.set', fixtureIds: ids, values: vals, confirmSpecial: false }),
    25,
  );

  // Couleur — référence = première machine
  const hasColor = selected.some((rf) => colorCapability(rf) !== 'none');
  const d = displayColor(ref, values[refId] ?? {});

  const hasPos = has('pan') || has('tilt');

  // Beam chips : union de tous les attributs de la sélection
  const allAttrs = [...new Set(selected.flatMap((rf) => rf.attributes))];
  const beamChipAttrs = allAttrs.filter((a) => {
    if (HIDDEN_BEAM.has(a)) return false;
    const ch = channelFor(a);
    return !!ch && ch.ranges.length > 0;
  });
  const simpleBeamAttrs = SIMPLE_BEAM.filter((a) => has(a) && !!channelFor(a));
  const hasBeam = beamChipAttrs.length > 0 || simpleBeamAttrs.length > 0;

  return (
    <div className="sc-modal-backdrop">
      <div className="sc-modal" role="dialog" aria-modal="true">

        {/* En-tête */}
        <div className="sc-modal-head">
          <div className="sc-modal-title">
            {selected.length === 1 ? (
              <>
                <span className="sc-name">{ref.fixture.name}</span>
                <span className="muted small mono">
                  Univ {ref.fixture.universe} · Addr {ref.fixture.address}
                </span>
              </>
            ) : (
              <>
                <span className="sc-name">{selected.length} machines sélectionnées</span>
                <div className="sc-modal-badges">
                  {selected.map((rf) => (
                    <span key={rf.fixture.id} className="badge violet">{rf.fixture.name}</span>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="row" style={{ gap: 6 }}>
            {anyTouched && (
              <button
                className="btn ghost sm"
                onClick={() => void act({ type: 'programmer.release', fixtureIds: ids })}
              >
                <Eraser size={13} /> Relâcher
              </button>
            )}
            <button className="btn ghost sm icon" onClick={onClose} aria-label="Fermer">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Corps 4 colonnes */}
        <div className="sc-modal-body sc-modal-cols">

          {/* ── Col 1 : Intensité ── */}
          <div className="sc-col">
            <SectionLabel label={tr('console.family.intensity')} color="#f5c542" />
            <div className="sc-fader-wrap">
              <span className="sc-fader-val">{Math.round(cur('dimmer') * 100)}%</span>
              <input
                type="range" className="sc-fader" min={0} max={255}
                value={Math.round(cur('dimmer') * 255)}
                aria-label="Intensité"
                onChange={(e) => send({ dimmer: Number(e.target.value) / 255 })}
              />
              <span className="sc-fader-lbl">Intensité</span>
            </div>
            <div className="sc-pct-btns">
              {[0, 25, 50, 75, 100].map((p) => (
                <button key={p} className="btn sm" onClick={() => send({ dimmer: p / 100 })}>
                  {p}%
                </button>
              ))}
            </div>
          </div>

          {/* ── Col 2 : Couleur ── */}
          <div className="sc-col">
            {hasColor ? (
              <>
                <SectionLabel label={tr('console.family.color')} color="var(--violet)" />
                <input
                  type="color" className="sc-color-big"
                  value={rgbToHex(d.color)}
                  title="Choisir une couleur"
                  onChange={(e) =>
                    void act({ type: 'programmer.setColor', fixtureIds: ids, color: e.target.value })
                  }
                />
                <div className="sc-swatches-grid">
                  {QUICK_COLORS.map((c) => (
                    <button
                      key={c} className="sc-swatch" style={{ background: c }} title={c}
                      onClick={() =>
                        void act({ type: 'programmer.setColor', fixtureIds: ids, color: c })
                      }
                    />
                  ))}
                </div>
                {has('colorWheel') && channelFor('colorWheel') &&
                  channelFor('colorWheel')!.ranges.length > 0 && (
                    <ChipRow
                      channel={channelFor('colorWheel')!}
                      current={cur('colorWheel')}
                      onSet={(v) => send({ colorWheel: v })}
                    />
                  )}
              </>
            ) : (
              <div className="sc-col-empty muted small">Pas de couleur</div>
            )}
          </div>

          {/* ── Col 3 : Position ── */}
          <div className="sc-col">
            {hasPos ? (
              <>
                <SectionLabel label={tr('console.family.position')} color="var(--cyan)" />
                <XYPad
                  pan={cur('pan')} tilt={cur('tilt')}
                  onChange={(p, t) =>
                    send({
                      ...(has('pan') ? { pan: p } : {}),
                      ...(has('tilt') ? { tilt: t } : {}),
                    })
                  }
                />
                <div className="sc-pos-sliders" style={{ marginTop: 8 }}>
                  {has('pan') && (
                    <AttrSlider label={attributeLabel('pan')} value={cur('pan')}
                      touched={touched('pan')} onChange={(v) => send({ pan: v })} showPct />
                  )}
                  {has('tilt') && (
                    <AttrSlider label={attributeLabel('tilt')} value={cur('tilt')}
                      touched={touched('tilt')} onChange={(v) => send({ tilt: v })} showPct />
                  )}
                  <button className="btn sm" style={{ marginTop: 6 }}
                    onClick={() => send({ pan: 0.5, tilt: 0.5 })}>
                    <Crosshair size={12} /> {tr('console.center')}
                  </button>
                </div>
              </>
            ) : (
              <div className="sc-col-empty muted small">Pas de pan/tilt</div>
            )}
          </div>

          {/* ── Col 4 : Gobos & Beam ── */}
          <div className="sc-col">
            {hasBeam ? (
              <>
                <SectionLabel label={tr('console.family.beam')} color="#f472b6" />
                {beamChipAttrs.map((a) => (
                  <ChipRow key={a} channel={channelFor(a)!} current={cur(a)}
                    onSet={(v) => send({ [a]: v })} />
                ))}
                {simpleBeamAttrs.map((a) => (
                  <AttrSlider key={a} label={attributeLabel(a)} value={cur(a)}
                    touched={touched(a)} onChange={(v) => send({ [a]: v })} showPct />
                ))}
              </>
            ) : (
              <div className="sc-col-empty muted small">Pas de beam / gobos</div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Tuile d'une machine ──────────────────────────────────────────────────────
function FixtureTile({
  rf, selected, onToggle, onOpen,
}: {
  rf: ResolvedFixture;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const values = useStore((s) => s.values);
  const programmer = useStore((s) => s.runtime?.programmer ?? EMPTY_OBJ) as Record<string, Record<string, number>>;

  const id = rf.fixture.id;
  const cur = (attr: string) => programmer[id]?.[attr] ?? values[id]?.[attr] ?? 0;
  const anyTouched = Object.keys(programmer[id] ?? {}).length > 0;

  const d = displayColor(rf, values[id] ?? {});
  const swatchColor = rgbToHex(d.color);
  const intensity = Math.round(cur('dimmer') * 100);
  const icon = TYPE_ICON[rf.profile.type] ?? '◉';

  return (
    <button
      className={`sc-tile ${anyTouched ? 'sc-tile--active' : ''} ${selected ? 'sc-tile--selected' : ''}`}
      onClick={onToggle}
      onDoubleClick={onOpen}
      title={selected ? 'Double-clic pour ouvrir · Clic pour désélectionner' : 'Clic pour sélectionner · Double-clic pour ouvrir seul'}
    >
      {/* Indicateur programmé */}
      {anyTouched && <span className="sc-tile-dot" />}
      {/* Coche de sélection */}
      {selected && <span className="sc-tile-check">✓</span>}

      <span className="sc-tile-icon">{icon}</span>
      <span className="sc-tile-name">{rf.fixture.name}</span>
      <span className="sc-tile-addr">{rf.fixture.universe}.{rf.fixture.address}</span>
      <span
        className="sc-tile-swatch"
        style={{
          background: swatchColor === '#000000' ? 'var(--border)' : swatchColor,
          opacity: cur('dimmer') > 0 ? 1 : 0.3,
        }}
      />
      <span className="sc-tile-intensity">{intensity}%</span>
    </button>
  );
}

// ─── Panneau de gestion des groupes ──────────────────────────────────────────
function GroupsPanel({
  selIds,
  onSelectGroup,
}: {
  selIds: string[];
  onSelectGroup: (ids: string[]) => void;
}) {
  const groups = useStore((s) => s.project!.project.groups);
  const [creating, setCreating] = useState(false);
  const [groupName, setGroupName] = useState('');

  // Un groupe est "actif" si toutes ses machines sont dans la sélection
  const isGroupActive = (fixtureIds: string[]) =>
    fixtureIds.length > 0 && fixtureIds.every((id) => selIds.includes(id));

  const toggleGroup = (fixtureIds: string[]) => {
    if (isGroupActive(fixtureIds)) {
      // Désactiver : retirer les machines du groupe de la sélection
      onSelectGroup(selIds.filter((id) => !fixtureIds.includes(id)));
    } else {
      // Activer : ajouter les machines du groupe à la sélection
      const merged = [...new Set([...selIds, ...fixtureIds])];
      onSelectGroup(merged);
    }
  };

  const createGroup = async () => {
    if (selIds.length === 0) return;
    const name = groupName.trim() || `Groupe ${groups.length + 1}`;
    const color = GROUP_COLORS[groups.length % GROUP_COLORS.length]!;
    const r = await act({ type: 'group.upsert', group: { id: newId(), name, color, fixtureIds: selIds } });
    if (r) {
      useStore.getState().toast({ kind: 'success', title: `Groupe « ${name} » créé` });
      setCreating(false);
      setGroupName('');
    }
  };

  const removeGroup = async (id: string, name: string) => {
    await act({ type: 'group.remove', id });
    useStore.getState().toast({ kind: 'info', title: `Groupe « ${name} » supprimé` });
  };

  return (
    <div className="sc-groups-panel">
      <div className="sc-groups-header">
        <span className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={13} /> Groupes
        </span>
        <button
          className="btn ghost sm"
          disabled={selIds.length === 0}
          title={selIds.length === 0 ? 'Sélectionnez des machines d\'abord' : 'Créer un groupe avec la sélection'}
          onClick={() => { setGroupName(`Groupe ${groups.length + 1}`); setCreating(true); }}
        >
          <Plus size={12} /> Nouveau groupe
        </button>
      </div>

      {/* Formulaire de création */}
      {creating && (
        <div className="sc-group-create">
          <input
            className="input"
            autoFocus
            value={groupName}
            placeholder="Nom du groupe"
            onChange={(e) => setGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createGroup();
              if (e.key === 'Escape') setCreating(false);
            }}
          />
          <button className="btn primary sm" onClick={() => void createGroup()}>Créer</button>
          <button className="btn ghost sm" onClick={() => setCreating(false)}>Annuler</button>
        </div>
      )}

      {/* Liste des groupes existants */}
      {groups.length === 0 && !creating ? (
        <span className="small muted" style={{ padding: '4px 0' }}>Aucun groupe — sélectionnez des machines et cliquez « Nouveau groupe »</span>
      ) : (
        <div className="sc-groups-list">
          {groups.map((g) => (
            <div key={g.id} className="sc-group-row">
              <button
                className={`sc-group-btn ${isGroupActive(g.fixtureIds) ? 'sc-group-btn--on' : ''}`}
                style={{ borderLeft: `3px solid ${g.color}` }}
                onClick={() => toggleGroup(g.fixtureIds)}
                title={isGroupActive(g.fixtureIds) ? 'Cliquer pour désélectionner' : `Sélectionner le groupe (${g.fixtureIds.length} machines)`}
              >
                <span className="sc-group-name">{g.name}</span>
                <span className="sc-group-count muted small">{g.fixtureIds.length} machines</span>
              </button>
              <button
                className="btn ghost sm icon"
                title="Supprimer ce groupe"
                onClick={() => void removeGroup(g.id, g.name)}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function PanTiltConsole() {
  const tr = useT();
  const { fixtures, byId } = useResolved();
  const [selIds, setSelIds] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const allIds = fixtures.map((rf) => rf.fixture.id);
  const moverIds = fixtures
    .filter((rf) => rf.attributes.includes('pan') || rf.attributes.includes('tilt'))
    .map((rf) => rf.fixture.id);

  const toggle = (id: string) =>
    setSelIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const openSingle = (id: string) => { setSelIds([id]); setModalOpen(true); };
  const openModal = () => { if (selIds.length > 0) setModalOpen(true); };
  const closeModal = () => setModalOpen(false);

  const selectedFixtures = selIds
    .map((id) => byId.get(id))
    .filter((rf): rf is ResolvedFixture => !!rf);

  return (
    <div className="page">
      <PageHead title={tr('pantilt.title')} subtitle={tr('pantilt.subtitle')}>
        <button className="btn ghost sm" onClick={() => setSelIds(allIds)}>Tout sélectionner</button>
        <button className="btn ghost sm" onClick={() => setSelIds([])} disabled={selIds.length === 0}>Désélectionner</button>
        <button className="btn primary" disabled={selIds.length === 0} onClick={openModal}>
          <SlidersHorizontal size={14} />
          Régler {selIds.length > 0 ? `(${selIds.length})` : ''}
        </button>
        {moverIds.length > 0 && (
          <button className="btn" onClick={() =>
            void act({ type: 'programmer.set', fixtureIds: moverIds, values: { pan: 0.5, tilt: 0.5 }, confirmSpecial: false })
          }>
            <Crosshair size={14} /> {tr('pantilt.centerAll')}
          </button>
        )}
        <button className="btn" disabled={allIds.length === 0}
          onClick={() => void act({ type: 'programmer.release', fixtureIds: allIds })}>
          <Eraser size={14} /> {tr('pantilt.releaseAll')}
        </button>
      </PageHead>

      {fixtures.length === 0 ? (
        <Empty
          icon={<SlidersHorizontal size={32} />}
          title={tr('pantilt.noMovers')}
          action={
            <button className="btn primary" onClick={() => useStore.getState().setPage('fixtures')}>
              {tr('console.openPatch')}
            </button>
          }
        >
          {tr('pantilt.noMoversHint')}
        </Empty>
      ) : (
        <div className="sc-layout">

          {/* ── Panneau gauche : groupes ── */}
          <GroupsPanel
            selIds={selIds}
            onSelectGroup={(ids) => setSelIds(ids)}
          />

          {/* ── Zone principale : tuiles ── */}
          <div className="sc-main">
            {selIds.length > 0 && (
              <div className="sc-sel-bar">
                <span className="small">
                  <strong>{selIds.length}</strong> machine{selIds.length > 1 ? 's' : ''} sélectionnée{selIds.length > 1 ? 's' : ''}
                </span>
                <button className="btn primary sm" onClick={openModal}>
                  <SlidersHorizontal size={13} /> Ouvrir les réglages
                </button>
              </div>
            )}
            <div className="sc-tile-grid">
              {fixtures.map((rf) => (
                <FixtureTile
                  key={rf.fixture.id}
                  rf={rf}
                  selected={selIds.includes(rf.fixture.id)}
                  onToggle={() => toggle(rf.fixture.id)}
                  onOpen={() => openSingle(rf.fixture.id)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {modalOpen && selectedFixtures.length > 0 && (
        <SelectionModal selected={selectedFixtures} onClose={closeModal} />
      )}
    </div>
  );
}
