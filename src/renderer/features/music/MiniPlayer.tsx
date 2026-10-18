import { useEffect, useState, useSyncExternalStore } from 'react';
import { Maximize2, Pause, Play, Square } from 'lucide-react';
import { useStore } from '../../store';
import { useT } from '../../i18n';
import { musicPlayer } from '../../musicPlayer';
import { SECTION_NAMES } from '../../../core/music/analyze';
import { fmt, LABEL_COLOR } from './names';

export function usePlayback() {
  useSyncExternalStore((l) => musicPlayer.subscribe(l), () => musicPlayer.revision);
  const [pos, setPos] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPos(musicPlayer.position()), 100);
    return () => clearInterval(id);
  }, []);
  return { playing: musicPlayer.playing, pos };
}

/** Floating player (bottom right, every page) while a song plays or is paused. */
export function MiniPlayer() {
  const t = useT();
  const { playing, pos } = usePlayback();
  const paused = musicPlayer.paused;
  const trackId = playing?.trackId ?? paused?.trackId;
  const track = useStore((s) => s.project?.project.music.tracks.find((x) => x.id === trackId));
  // Track removed (or undone, or project closed) while playing or paused: cut the audio and the timecode right away.
  const gone = !!trackId && !track;
  useEffect(() => { if (gone) musicPlayer.stop(); }, [gone]);
  if (!track) return null;
  const a = track.analysis;
  const at = playing ? pos : paused!.at;
  const section = a.sections.find((s) => at >= s.start && at < s.end);
  const play = (from: number) => {
    try {
      musicPlayer.play(track, from);
    } catch (err) {
      useStore.getState().toast({ kind: 'error', title: t('music.playError'), detail: (err as Error).message });
    }
  };
  return (
    <div className="mini-player" role="region" aria-label={t('music.player')} data-testid="mini-player">
      <div className="row" style={{ gap: 8 }}>
        <button className="btn sm icon accent" onClick={() => (playing ? musicPlayer.pause() : play(at))} title={t(playing ? 'music.pause' : 'music.resume')} data-testid="mini-player-toggle">
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="mini-player-name" title={track.name}>{track.name}</div>
          <div className="small muted">
            {section && <span className="sec-swatch" style={{ background: LABEL_COLOR[section.label] }} aria-hidden />} {section ? SECTION_NAMES[section.label] : ''} · <span className="mono">{fmt(at)} / {fmt(a.duration)}</span>
          </div>
        </div>
        <button className="btn ghost sm icon" onClick={() => useStore.getState().setPage('music')} title={t('music.openPage')}><Maximize2 size={13} /></button>
        <button className="btn ghost sm icon" onClick={() => musicPlayer.stop()} title={t('music.stopPlayer')} data-testid="mini-player-stop"><Square size={13} /></button>
      </div>
      <input type="range" className="mini-player-seek" min={0} max={a.duration} step={0.1} value={at} aria-label={t('music.seek')} onChange={(e) => play(Number(e.target.value))} />
    </div>
  );
}
