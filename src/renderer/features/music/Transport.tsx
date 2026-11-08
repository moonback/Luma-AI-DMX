import { Pause, Play, Square } from 'lucide-react';
import type { MusicTrack } from '../../../core/model/schemas';
import { musicPlayer } from '../../musicPlayer';
import { useT } from '../../i18n';
import { fmt } from './names';

/** Player bar shown above every step: play / pause / resume / stop and the seek bar of the selected track. */
export function Transport({ track, playing, pos, onPlay }: { track: MusicTrack; playing: boolean; pos: number; onPlay: (from?: number) => void }) {
  const t = useT();
  const paused = musicPlayer.paused?.trackId === track.id ? musicPlayer.paused : null;
  const at = playing ? pos : paused?.at ?? 0;
  if (!musicPlayer.hasAudio(track.hash)) return <div className="music-transport small dim">{t('music.noAudio')}</div>;
  return (
    <div className="music-transport" data-testid="music-transport">
      <div className="row" style={{ gap: 6 }}>
        {playing ? (
          <>
            <button className="btn" onClick={() => musicPlayer.pause()} data-testid="music-pause"><Pause size={13} />{t('music.pause')}</button>
            <button className="btn" onClick={() => musicPlayer.stop()} data-testid="music-stop"><Square size={13} />{t('music.stop', { t: fmt(pos) })}</button>
          </>
        ) : paused ? (
          <>
            <button className="btn accent" onClick={() => onPlay(paused.at)} data-testid="music-resume"><Play size={13} />{t('music.resume')}</button>
            <button className="btn" onClick={() => musicPlayer.stop()} data-testid="music-stop"><Square size={13} />{t('music.stop', { t: fmt(paused.at) })}</button>
          </>
        ) : <button className="btn accent" onClick={() => onPlay()} data-testid="music-play"><Play size={13} />{t('music.play')}</button>}
      </div>
      <span className="small mono dim">{fmt(at)}</span>
      <input type="range" className="mini-player-seek grow" min={0} max={track.analysis.duration} step={0.1} value={at} disabled={!playing && !paused} aria-label={t('music.seek')} data-testid="music-seek" onChange={(e) => onPlay(Number(e.target.value))} />
      <span className="small mono dim">{fmt(track.analysis.duration)}</span>
    </div>
  );
}
