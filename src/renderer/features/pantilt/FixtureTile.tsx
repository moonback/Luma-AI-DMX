import { useStore, EMPTY_OBJ } from '../../store';
import { displayColor } from '../../../core/fixtures/color';
import { rgbToHex } from '../../../core/util/math';
import type { ResolvedFixture } from '../../../core/fixtures/profiles';

const TYPE_ICON: Record<string, string> = {
  'moving-head-spot': '🔦',
  'moving-head-wash': '💡',
  par: '💡',
  strobe: '⚡',
  dimmer: '🔆',
  'led-bar': '▬',
  other: '◉',
};

// ─── Tuile d'une machine ──────────────────────────────────────────────────────
export function FixtureTile({
  rf, selected, onToggle, onOpen,
}: {
  rf: ResolvedFixture;
  selected: boolean;
  onToggle: (range: boolean) => void;
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
      onClick={(e) => onToggle(e.shiftKey)}
      onDoubleClick={onOpen}
      aria-pressed={selected}
      title={selected ? 'Double-clic pour ouvrir · Clic pour désélectionner' : 'Clic pour sélectionner · Maj+clic pour une plage · Double-clic pour ouvrir seul'}
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
