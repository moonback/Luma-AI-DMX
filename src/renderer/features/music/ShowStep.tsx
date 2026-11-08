import type { ReactNode } from 'react';
import { ArrowLeft, ArrowLeftRight, ArrowRight, ExternalLink, Lock, Pencil, Shuffle, Sparkles, Undo2, Wand2 } from 'lucide-react';
import type { Group, MusicTrack, StageMarker } from '../../../core/model/schemas';
import { SECTION_NAMES } from '../../../core/music/analyze';
import { Empty, Panel } from '../../components/ui';
import { useT } from '../../i18n';
import { ArtisticQualityBadge } from './ArtisticQualityBadge';
import { BEAM_NAMES, EFFECT_NAMES, EXTRA_NAMES, fmt, LABEL_COLOR, MOVE_NAMES } from './names';

/** Step 3 « Show »: the generated plan, its quality, the studio timeline and the read-only section table (retouch = modal). */
export function ShowStep({ track, studio, groups, markers, selected, nowIdx, busy, onSelect, onEdit, onVariant, onRestore, onCompare, onOpenTimeline, onBack, onNext }: {
  track: MusicTrack; studio: ReactNode; groups: readonly Group[]; markers: readonly StageMarker[]; selected: number; nowIdx: number; busy: boolean;
  onSelect: (i: number) => void; onEdit: (i: number) => void; onVariant: () => void; onRestore: () => void; onCompare: () => void; onOpenTimeline: () => void; onBack: () => void; onNext: () => void;
}) {
  const t = useT();
  const plan = track.plan;
  if (!plan) {
    return (
      <Empty icon={<Wand2 size={32} />} title={t('music.show.none')} action={<button className="btn primary" onClick={onBack} data-testid="music-back"><ArrowLeft size={14} />{t('music.steps.toIntent')}</button>}>
        {t('music.show.noneHint')}
      </Empty>
    );
  }
  const setSelected = onSelect;
  const setEditing = onEdit;
  return (
    <div className="col gap-lg">
      <Panel title={t('music.steps.show')} actions={<span className={`badge ${plan.provider === 'openrouter' ? 'violet' : ''}`}>{plan.provider === 'openrouter' ? `OpenRouter · ${plan.model}` : t('music.localRules')} · {t('music.variantN', { n: plan.variant })}</span>}>
        <div className="col" style={{ gap: 10 }}>
          <div className="row small" style={{ gap: 6 }} data-testid="music-plan-summary"><Sparkles size={13} style={{ color: '#22d3ee' }} /><span>{plan.summary}</span></div>
          <ArtisticQualityBadge plan={plan} analysis={track.analysis} />
          {studio}
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn" disabled={busy} onClick={onVariant} title={t('music.variantHint')} data-testid="music-variant"><Shuffle size={14} />{t('music.variant')}</button>
            <button className="btn" disabled={busy || !track.previousPlan} onClick={onRestore} title={t('music.restoreHint')} data-testid="music-restore"><Undo2 size={14} />{t('music.restore')}</button>
            {track.previousPlan && <button className="btn" onClick={onCompare} title={t('music.studio.compareAB')} data-testid="music-compare-ab"><ArrowLeftRight size={14} />{t('music.studio.compareAB')}</button>}
            {track.created.timelineId && <button className="btn ghost" onClick={onOpenTimeline}><ExternalLink size={14} />{t('music.openTimeline')}</button>}
          </div>
        </div>
      </Panel>
      <Panel title={t('music.sections')} flush>
      <div className="music-table-wrap">
        <table className="table small music-table" data-testid="music-sections">
          <thead>
            <tr>
              <th className="col-idx">#</th>
              <th className="col-sec">{t('music.col.section')}</th>
              <th className="col-start">{t('music.col.start')}</th>
              <th className="col-energy">{t('music.col.energy')}</th>
              <th className="col-plan">{t('music.col.plan')}</th>
              <th className="col-actions" />
            </tr>
          </thead>
          <tbody>
            {track.analysis.sections.map((s, i) => {
              const p = track.plan?.sections[i];
              return (
                <tr key={i} className={`clickable ${i === selected ? 'sel' : ''} ${i === nowIdx ? 'active' : ''}`} onClick={() => setSelected(i)} onDoubleClick={() => setEditing(i)}>
                  <td className="mono col-idx">{i + 1}</td>
                  <td className="col-sec">
                    <div className="sec-label-cell">
                      <span className="sec-color-bar" style={{ background: LABEL_COLOR[s.label] }} />
                      <span>{SECTION_NAMES[s.label]}</span>{p?.locked && <Lock size={11} className="dim" aria-label={t('music.strip.locked')} />}
                    </div>
                  </td>
                  <td className="mono col-start">{fmt(s.start)}</td>
                  <td className="col-energy">
                    <div className="row" style={{ gap: 6 }}>
                      <div className="meter grow"><div style={{ width: `${s.energy * 100}%` }} /></div>
                      <span className="mono small dim" style={{ minWidth: 26, textAlign: 'right' }}>{Math.round(s.energy * 100)}%</span>
                    </div>
                  </td>
                  <td className="col-plan">
                    {p ? (
                      <div className="col" style={{ gap: 4 }}>
                        <div className="music-plan-chips">
                          <span className="music-plan-energy-dots mono" title={t('music.planEnergy')}>{'●'.repeat(p.energy)}{'○'.repeat(5 - p.energy)}</span>
                          <div className="row" style={{ gap: 3 }}>
                            {p.palette.map((c) => <span key={c} className="music-palette-swatch" style={{ background: c }} title={c} />)}
                          </div>
                          <span className="music-tag effect">{EFFECT_NAMES[p.effect]}{p.effect !== 'none' ? ` ${p.effectBeats} t` : ''}</span>
                          <span className="music-tag">{MOVE_NAMES[p.movement]}{BEAM_NAMES[p.beam] ? ` · ${BEAM_NAMES[p.beam]}` : ''}{p.focus ? (p.focus === 'audience' ? t('music.towardAudience') : t('music.towardMarker', { name: markers.find((m) => m.id === p.focus)?.name ?? t('music.aMarker') })) : ''}</span>
                          {p.groups.length > 0 && <span className="music-tag dim">{p.groups.map((g) => groups.find((x) => x.id === g)?.name).filter(Boolean).join(', ')}</span>}
                          {p.extras.length > 0 && <span className="music-tag dim">{p.extras.map((x) => EXTRA_NAMES[x]).join(', ')}</span>}
                          {p.note && <span className="badge">{p.note}</span>}
                        </div>
                        {p.why && <div className="small dim" data-testid="music-section-why">{t('music.edit.why', { why: p.why })}</div>}
                      </div>
                    ) : <span className="dim">—</span>}
                  </td>
                  <td className="col-actions">
                    <div className="music-actions-cell">
                      <button className="btn ghost sm icon" title={t('music.edit.open')} onClick={(e) => { e.stopPropagation(); setEditing(i); }} data-testid="section-edit"><Pencil size={13} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </Panel>
      <div className="music-step-foot">
        <button className="btn ghost" onClick={onBack}><ArrowLeft size={14} />{t('music.steps.intent')}</button>
        <button className="btn primary" onClick={onNext} data-testid="music-to-play">{t('music.steps.toPlay')}<ArrowRight size={14} /></button>
      </div>
    </div>
  );
}
