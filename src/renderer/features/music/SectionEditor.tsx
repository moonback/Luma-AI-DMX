import { useState } from 'react';
import { Plus, RefreshCw, X } from 'lucide-react';
import { act } from '../../api';
import { Field, Modal } from '../../components/ui';
import { useT } from '../../i18n';
import { SECTION_NAMES } from '../../../core/music/analyze';
import { SECTION_LABELS, SHOW_BEAMS, SHOW_EFFECTS, SHOW_EXTRAS, SHOW_MOVEMENTS, type MusicTrack, type SectionLabel, type ShowSectionPlan } from '../../../core/model/schemas';
import { BEAM_NAMES, EFFECT_NAMES, EXTRA_NAMES, fmt, LABEL_COLOR, MOVE_NAMES } from './names';

type Patch = Partial<Pick<ShowSectionPlan, 'energy' | 'palette' | 'effect' | 'effectBeats' | 'movement' | 'beam' | 'extras' | 'accents' | 'locked'>>;
const BEATS = [0.5, 1, 2, 4, 8, 16];
const EDITABLE = ['energy', 'palette', 'effect', 'effectBeats', 'movement', 'beam', 'extras', 'accents', 'locked'] as const;

/** Modal editing one section: its estimated label, the plan's look, or a regeneration from an instruction. */
export function SectionEditor({ track, index, onClose, onNotices }: { track: MusicTrack; index: number; onClose: () => void; onNotices: (n: string[]) => void }) {
  const t = useT();
  const sec = track.analysis.sections[index]!;
  const plan = track.plan?.sections[index];
  const [label, setLabel] = useState(sec.label);
  const [draft, setDraft] = useState<ShowSectionPlan | undefined>(plan && structuredClone(plan));
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p: Patch) => setDraft((d) => d && { ...d, ...p });

  const run = async (fn: () => Promise<{ notices: string[] } | undefined | void>) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r) onNotices(r.notices);
    onClose();
  };
  const save = () => run(async () => {
    if (label !== sec.label) await act({ type: 'music.setSection', trackId: track.id, index, label });
    if (!draft || !plan) return;
    const patch = Object.fromEntries(EDITABLE.filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(plan[k])).map((k) => [k, draft[k]])) as Patch;
    if (Object.keys(patch).length) return act({ type: 'music.updateSection', trackId: track.id, index, patch });
  });
  const regenerate = () => run(async () => {
    if (label !== sec.label) await act({ type: 'music.setSection', trackId: track.id, index, label });
    return act({ type: 'music.regenerateSection', trackId: track.id, index, instruction });
  });

  return (
    <Modal wide title={t('music.edit.title', { n: index + 1, label: SECTION_NAMES[sec.label] })} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('music.edit.cancel')}</button><button className="btn primary" disabled={busy} onClick={() => void save()} data-testid="section-save">{t('music.edit.save')}</button></>}>
      <div className="col" data-testid="section-editor">
        <div className="row small muted" style={{ gap: 8 }}>
          <span className="sec-swatch" style={{ background: LABEL_COLOR[label] }} aria-hidden />
          {t('music.edit.info', { from: fmt(sec.start), to: fmt(sec.end), energy: Math.round(sec.energy * 100) })}
          {draft?.locked && <span className="badge warn">{t('music.strip.locked')}</span>}
        </div>
        {plan?.why && <div className="small dim">{t('music.edit.why', { why: plan.why })}</div>}
        <Field label={t('music.edit.label')} hint={t('music.edit.labelHint')}>
          <select className="select" value={label} onChange={(e) => setLabel(e.target.value as SectionLabel)} data-testid="section-label">
            {SECTION_LABELS.map((l) => <option key={l} value={l}>{SECTION_NAMES[l]}</option>)}
          </select>
        </Field>
        {!draft ? <p className="small dim">{t('music.edit.noPlan')}</p> : (
          <>
            <div className="grid g2">
              <Field label={t('music.edit.energy', { n: draft.energy })}>
                <input type="range" min={0} max={5} step={1} value={draft.energy} onChange={(e) => set({ energy: Number(e.target.value) })} data-testid="section-energy" />
              </Field>
              <Field label={t('music.edit.palette')}>
                <div className="row" style={{ gap: 6 }}>
                  {draft.palette.map((c, k) => (
                    <span key={k} className="row" style={{ gap: 2 }}>
                      <input type="color" value={c} onChange={(e) => set({ palette: draft.palette.map((x, j) => (j === k ? e.target.value.toUpperCase() : x)) })} />
                      {draft.palette.length > 1 && <button className="btn ghost sm icon" title={t('music.edit.removeColor')} onClick={() => set({ palette: draft.palette.filter((_, j) => j !== k) })}><X size={11} /></button>}
                    </span>
                  ))}
                  {draft.palette.length < 4 && <button className="btn ghost sm icon" title={t('music.edit.addColor')} onClick={() => set({ palette: [...draft.palette, '#FFFFFF'] })}><Plus size={12} /></button>}
                </div>
              </Field>
              <Field label={t('music.edit.effect')}>
                <div className="row">
                  <select className="select" value={draft.effect} onChange={(e) => set({ effect: e.target.value as ShowSectionPlan['effect'] })} data-testid="section-effect">
                    {SHOW_EFFECTS.map((x) => <option key={x} value={x}>{EFFECT_NAMES[x]}</option>)}
                  </select>
                  <select className="select" value={draft.effectBeats} title={t('music.edit.beats')} onChange={(e) => set({ effectBeats: Number(e.target.value) })}>
                    {[...new Set([...BEATS, draft.effectBeats])].sort((a, b) => a - b).map((b) => <option key={b} value={b}>{b} t</option>)}
                  </select>
                </div>
              </Field>
              <Field label={t('music.edit.movement')}>
                <select className="select" value={draft.movement} onChange={(e) => set({ movement: e.target.value as ShowSectionPlan['movement'] })} data-testid="section-movement">
                  {SHOW_MOVEMENTS.map((x) => <option key={x} value={x}>{MOVE_NAMES[x]}</option>)}
                </select>
              </Field>
              <Field label={t('music.edit.beam')}>
                <select className="select" value={draft.beam} onChange={(e) => set({ beam: e.target.value as ShowSectionPlan['beam'] })}>
                  {SHOW_BEAMS.map((x) => <option key={x} value={x}>{BEAM_NAMES[x] || t('music.edit.beamOpen')}</option>)}
                </select>
              </Field>
              <Field label={t('music.edit.extras')}>
                <div className="col" style={{ gap: 2 }}>
                  {SHOW_EXTRAS.map((x) => (
                    <label key={x} className="check"><input type="checkbox" checked={draft.extras.includes(x)} onChange={(e) => set({ extras: e.target.checked ? [...draft.extras, x] : draft.extras.filter((y) => y !== x) })} />{EXTRA_NAMES[x]}</label>
                  ))}
                </div>
              </Field>
            </div>
            <label className="check"><input type="checkbox" checked={draft.accents} onChange={(e) => set({ accents: e.target.checked })} />{t('music.edit.accents')}</label>
            <label className="check"><input type="checkbox" checked={draft.locked} onChange={(e) => set({ locked: e.target.checked })} data-testid="section-locked" />{t('music.edit.locked')}</label>
            <Field label={t('music.edit.instruction')} hint={t('music.edit.instructionHint')}>
              <div className="row">
                <input className="input" value={instruction} onChange={(e) => setInstruction(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void regenerate()} data-testid="section-instruction" />
                <button className="btn" disabled={busy} onClick={() => void regenerate()}><RefreshCw size={12} />{t('music.edit.regenerate')}</button>
              </div>
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}
