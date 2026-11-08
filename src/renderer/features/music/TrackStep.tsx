import type { ReactNode } from 'react';
import { Activity, ArrowRight, Clock, FileAudio, Layers, Music2, Sparkles, Trash2 } from 'lucide-react';
import type { MusicTrack } from '../../../core/model/schemas';
import { KEY_NAMES } from '../../../core/music/analyze';
import { Panel } from '../../components/ui';
import { useT } from '../../i18n';
import { fmt } from './names';

/** Step 1 « Morceau »: what the analysis found, the sections, and the file actions. */
export function TrackStep({ track, studio, replacing, onReplace, onRemove, onNext }: {
  track: MusicTrack; studio: ReactNode; replacing: boolean; onReplace: () => void; onRemove: () => void; onNext: () => void;
}) {
  const t = useT();
  const a = track.analysis;
  const count = (kind: string) => a.events.filter((e) => e.kind === kind);
  return (
    <Panel title={track.name} actions={<span className="badge">{a.sections.length} {t('music.sections').toLowerCase()}</span>}>
      <div className="music-indicators" data-testid="music-summary">
        <div className="music-indicator-pill">
          <Activity size={13} style={{ color: '#22d3ee' }} />
          <span className="small muted">{t('music.tempo')} </span>
          <b className="mono">{a.bpm.toFixed(1)}</b>
          <span>BPM</span>
          {!a.tempoStable && <span className="badge warn sm">{t('music.variable')}</span>}
        </div>
        <div className="music-indicator-pill">
          <Music2 size={13} style={{ color: '#a78bfa' }} />
          <span className="small muted">{t('music.key')} </span>
          <b>{KEY_NAMES[a.key.tonic]} {t(a.key.mode === 'major' ? 'music.major' : 'music.minor')}</b>
          <span className="small dim">({Math.round(a.key.confidence * 100)} %)</span>
        </div>
        <div className="music-indicator-pill">
          <Clock size={13} style={{ color: '#38bdf8' }} />
          <span className="small muted">{t('music.duration')} </span>
          <b className="mono">{fmt(a.duration)}</b>
        </div>
        <div className="music-indicator-pill">
          <Layers size={13} style={{ color: '#f472b6' }} />
          <span className="small muted">{t('music.sections')} </span>
          <b>{a.sections.length}</b>
        </div>
        <div className="music-indicator-pill dim small">
          <Sparkles size={12} style={{ color: '#fde047' }} />
          <span>{t('music.eventsSummary', { impacts: count('impact').length, risers: count('riser').length, vocal: Math.round(count('vocal').reduce((d, e) => d + e.duration, 0)) })}</span>
        </div>
      </div>
      {studio}
      <div className="music-step-foot">
        <div className="row" style={{ gap: 6 }}>
          <button className="btn ghost sm" disabled={replacing} onClick={onReplace} title={t('music.replaceHint')} data-testid="music-replace"><FileAudio size={13} />{t('music.replace')}</button>
          <button className="btn ghost sm" onClick={onRemove} data-testid="music-remove"><Trash2 size={13} />{t('music.remove')}</button>
        </div>
        <button className="btn primary" onClick={onNext} data-testid="music-next">{t('music.steps.toIntent')}<ArrowRight size={14} /></button>
      </div>
    </Panel>
  );
}
