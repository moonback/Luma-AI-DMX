import type { ReactNode } from 'react';
import { ArrowLeft, ExternalLink, Play, SkipForward } from 'lucide-react';
import type { MusicTrack } from '../../../core/model/schemas';
import { SECTION_NAMES } from '../../../core/music/analyze';
import { Panel } from '../../components/ui';
import { useT } from '../../i18n';
import { fmt, LABEL_COLOR } from './names';

/** Section playing at `pos` and the one after it (indexes, -1 when none). */
export function nowAndNext(track: Pick<MusicTrack, 'analysis'>, pos: number | null): { now: number; next: number } {
  const secs = track.analysis.sections;
  if (pos === null) return { now: -1, next: secs.length ? 0 : -1 };
  const now = secs.findIndex((s) => pos >= s.start && pos < s.end);
  const next = secs.findIndex((s) => s.start > pos);
  return { now, next };
}

/** Step 4 « Jouer »: what plays now, what comes next, and jumps; the transport bar above drives the playback. */
export function PlayStep({ track, pos, studio, onPlay, onOpenTimeline, onBack }: {
  track: MusicTrack; pos: number | null; studio: ReactNode; onPlay: (from: number) => void; onOpenTimeline: () => void; onBack: () => void;
}) {
  const t = useT();
  const secs = track.analysis.sections;
  const { now, next } = nowAndNext(track, pos);
  const card = (i: number, kind: 'now' | 'next') => {
    const s = secs[i];
    return (
      <div className={`music-live-card ${kind}`} data-testid={`music-live-${kind}`} style={s ? { borderColor: LABEL_COLOR[s.label] } : undefined}>
        <span className="small dim">{kind === 'now' ? t('music.play.now') : s && pos !== null ? t('music.play.nextIn', { t: fmt(Math.max(0, s.start - pos)) }) : t('music.play.next')}</span>
        <b>{s ? SECTION_NAMES[s.label] : '—'}</b>
        {s && <span className="small dim mono">{fmt(s.start)} – {fmt(s.end)}</span>}
      </div>
    );
  };
  return (
    <Panel title={t('music.steps.play')}>
      <div className="col gap-lg">
        <div className="music-live-grid">{card(now, 'now')}{card(next, 'next')}</div>
        <div className="row wrap" style={{ gap: 8 }}>
          {pos === null && <button className="btn accent" onClick={() => onPlay(0)} data-testid="music-play-start"><Play size={13} />{t('music.play.fromStart')}</button>}
          <button className="btn" disabled={next < 0} onClick={() => onPlay(secs[next]!.start)} data-testid="music-next-section"><SkipForward size={13} />{t('music.play.nextSection')}</button>
          {track.created.timelineId && <button className="btn ghost" onClick={onOpenTimeline}><ExternalLink size={14} />{t('music.openTimeline')}</button>}
        </div>
        {studio}
        <div className="music-step-foot">
          <button className="btn ghost" onClick={onBack}><ArrowLeft size={14} />{t('music.steps.show')}</button>
        </div>
      </div>
    </Panel>
  );
}
