import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Eraser, Crosshair, X } from 'lucide-react';
import { useStore, EMPTY_OBJ } from '../../store';
import { useT } from '../../i18n';
import { act } from '../../api';
import { useThrottled } from '../../components/ui';
import { attributeLabel } from '../../../core/fixtures/attributes';
import { colorCapability, displayColor } from '../../../core/fixtures/color';
import { coarseChannel } from '../../../core/fixtures/profiles';
import { rgbToHex } from '../../../core/util/math';
import type { ResolvedFixture } from '../../../core/fixtures/profiles';
import type { Channel } from '../../../core/model/schemas';

// ─── Constantes ──────────────────────────────────────────────────────────────
const QUICK_COLORS = [
  '#FFFFFF', '#FF0000', '#FF7000', '#FFD000',
  '#00FF40', '#00E5FF', '#0040FF', '#FF00C8',
];

const HIDDEN_BEAM = new Set([
  'speed', 'macro', 'control', 'macroSpeed', 'fog', 'fan', 'dimmerCurve',
  'panTiltSpeed', 'panTiltMode', 'zoomMode',
]);

const SIMPLE_BEAM = ['focus', 'zoom', 'iris', 'frost'];

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
      onKeyDown={(e) => {
        const step = e.shiftKey ? 0.1 : 0.02;
        const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
        const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
        if (!dx && !dy) return;
        e.preventDefault();
        onChange(Math.min(1, Math.max(0, pan + dx)), Math.min(1, Math.max(0, tilt + dy)));
      }}
      tabIndex={0} role="slider" aria-label="Pan / Tilt" aria-valuenow={Math.round(pan * 100)}
      aria-valuetext={`Pan ${Math.round(pan * 100)} % · Tilt ${Math.round(tilt * 100)} %`}
      style={{ touchAction: 'none' }}
      title="Pan / Tilt — cliquer-glisser ou flèches (Maj = pas large)"
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
export function SelectionModal({
  selected,
  onClose,
  onRemove,
  onStep,
}: {
  selected: ResolvedFixture[];
  onClose: () => void;
  /** Retire une machine de la sélection (puces de l'en-tête). */
  onRemove: (id: string) => void;
  /** Machine précédente / suivante, quand une seule est ouverte. */
  onStep: (dir: -1 | 1) => void;
}) {
  const tr = useT();
  const values = useStore((s) => s.values);
  const programmer = useStore((s) => s.runtime?.programmer ?? EMPTY_OBJ) as Record<string, Record<string, number>>;

  // Échap ferme la fenêtre ; en capture pour ne pas déclencher en plus le raccourci global « relâcher le programmeur ».
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

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
      <div className="sc-modal" role="dialog" aria-modal="true" aria-label={selected.length === 1 ? ref.fixture.name : tr('pantilt.title')}>

        {/* En-tête */}
        <div className="sc-modal-head">
          {selected.length === 1 && (
            <button className="btn ghost sm icon" onClick={() => onStep(-1)} aria-label="Machine précédente" title="Machine précédente">
              <ChevronLeft size={16} />
            </button>
          )}
          {/* Aperçu vivant : couleur et intensité de la machine de référence */}
          <span
            className="sc-modal-preview"
            aria-hidden="true"
            style={{ '--sc-glow': rgbToHex(d.color) === '#000000' ? 'var(--text-3)' : rgbToHex(d.color), '--sc-level': cur('dimmer') } as React.CSSProperties}
          />
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
                <span className="muted small">Valeurs affichées : {ref.fixture.name} · les réglages s'appliquent à toutes</span>
                <div className="sc-modal-badges">
                  {selected.map((rf) => (
                    <span key={rf.fixture.id} className="badge violet">
                      {rf.fixture.name}
                      <button className="sc-badge-x" onClick={() => onRemove(rf.fixture.id)} aria-label={`Retirer ${rf.fixture.name}`} title="Retirer de la sélection">
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
          {selected.length === 1 && (
            <button className="btn ghost sm icon" onClick={() => onStep(1)} aria-label="Machine suivante" title="Machine suivante">
              <ChevronRight size={16} />
            </button>
          )}
          <div className="grow" />
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
