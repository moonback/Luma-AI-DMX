import { useState, type CSSProperties } from 'react';
import { DimmerKnob, GenericFixture, LedBar, MovingHeadSpot, MovingHeadWash, ParCan, StrobeBox, type FixtureIcon } from './FixtureIcons';
import { useStore, EMPTY_OBJ } from '../../store';
import { displayColor } from '../../../core/fixtures/color';
import { rgbToHex } from '../../../core/util/math';
import type { ResolvedFixture } from '../../../core/fixtures/profiles';

const DRAG_TYPE = 'application/x-luma-fixture';

const TYPE_ICON: Record<string, FixtureIcon> = {
  'moving-head-spot': MovingHeadSpot,
  'moving-head-wash': MovingHeadWash,
  par: ParCan,
  strobe: StrobeBox,
  dimmer: DimmerKnob,
  'led-bar': LedBar,
  other: GenericFixture,
};

const TYPE_LABEL: Record<string, string> = {
  'moving-head-spot': 'Lyre spot',
  'moving-head-wash': 'Lyre wash',
  par: 'PAR',
  strobe: 'Strobe',
  dimmer: 'Gradateur',
  'led-bar': 'Barre LED',
  other: 'Autre',
};

// ─── Tuile d'une machine ──────────────────────────────────────────────────────
export function FixtureTile({
  rf, selected, onToggle, onOpen, onDropFrom, onNudge,
}: {
  rf: ResolvedFixture;
  selected: boolean;
  onToggle: (range: boolean) => void;
  onOpen: () => void;
  /** Une autre tuile (son id) est déposée sur celle-ci. */
  onDropFrom: (fromId: string) => void;
  /** Alt+flèche : décale la tuile d'un cran. */
  onNudge: (dir: -1 | 1) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState(false);
  const values = useStore((s) => s.values);
  const programmer = useStore((s) => s.runtime?.programmer ?? EMPTY_OBJ) as Record<string, Record<string, number>>;

  const id = rf.fixture.id;
  const cur = (attr: string) => programmer[id]?.[attr] ?? values[id]?.[attr] ?? 0;
  const anyTouched = Object.keys(programmer[id] ?? {}).length > 0;

  const d = displayColor(rf, values[id] ?? {});
  const swatchColor = rgbToHex(d.color);
  const intensity = Math.round(cur('dimmer') * 100);
  const Icon = TYPE_ICON[rf.profile.type] ?? GenericFixture;
  const level = cur('dimmer');
  const isMover = rf.attributes.includes('pan') || rf.attributes.includes('tilt');

  return (
    <button
      className={`sc-tile ${anyTouched ? 'sc-tile--active' : ''} ${selected ? 'sc-tile--selected' : ''} ${dragging ? 'sc-tile--dragging' : ''} ${over ? 'sc-tile--over' : ''}`}
      onClick={(e) => onToggle(e.shiftKey)}
      onDoubleClick={onOpen}
      aria-pressed={selected}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, id); e.dataTransfer.effectAllowed = 'move'; setDragging(true); }}
      onDragEnd={() => setDragging(false)}
      onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const from = e.dataTransfer.getData(DRAG_TYPE); if (from) onDropFrom(from); }}
      onKeyDown={(e) => {
        if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
        e.preventDefault();
        onNudge(e.key === 'ArrowLeft' ? -1 : 1);
      }}
      title={selected ? 'Double-clic pour ouvrir · Clic pour désélectionner · Glisser pour déplacer' : 'Clic pour sélectionner · Maj+clic pour une plage · Double-clic pour ouvrir seul · Glisser (ou Alt+←/→) pour déplacer'}
    >
      {/* Indicateur programmé */}
      {anyTouched && <span className="sc-tile-dot" />}
      {/* Coche de sélection */}
      {selected && <span className="sc-tile-check">✓</span>}

      {/* Lampe : la teinte et l'éclat suivent la couleur et l'intensité réellement émises */}
      <span
        className="sc-tile-lamp"
        style={{ '--sc-glow': swatchColor === '#000000' ? 'var(--text-3)' : swatchColor, '--sc-level': level } as CSSProperties}
      >
        <Icon size={22} strokeWidth={1.75} />
      </span>
      <span className="sc-tile-name">{rf.fixture.name}</span>
      <span className="sc-tile-addr">{TYPE_LABEL[rf.profile.type] ?? rf.profile.type} · {rf.fixture.universe}.{rf.fixture.address}</span>
      {/* Position pan/tilt des lyres */}
      {isMover && (
        <span className="sc-tile-pt" title={`Pan ${Math.round(cur('pan') * 100)} % · Tilt ${Math.round(cur('tilt') * 100)} %`}>
          <i style={{ left: `${cur('pan') * 100}%`, top: `${cur('tilt') * 100}%` }} />
        </span>
      )}
      <span className="sc-tile-bar" role="meter" aria-label="Intensité" aria-valuemin={0} aria-valuemax={100} aria-valuenow={intensity}>
        <i style={{ transform: `scaleX(${level})`, background: swatchColor === '#000000' ? 'var(--text-3)' : swatchColor }} />
      </span>
      <span className="sc-tile-intensity">{intensity}%</span>
    </button>
  );
}
