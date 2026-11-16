import { useEffect, useState, useSyncExternalStore } from 'react';
import { ChevronDown, ChevronUp, Maximize2, Music2, Pause, Play, Square } from 'lucide-react';
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

/** Bottom fixed player bar with collapsible pill mode. */
export function MiniPlayer() {
  const t = useT();
  const [collapsed, setCollapsed] = useState(false);
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

  if (collapsed) {
    return (
      <button
        type="button"
        className="mini-player-collapsed-pill"
        onClick={() => setCollapsed(false)}
        title={t('music.showPlayer')}
        data-testid="mini-player-expand"
      >
        <Music2 size={13} style={{ color: 'var(--cyan)' }} />
        <span className="mono bold">{fmt(at)}</span>
        <span className="truncate" style={{ maxWidth: 140 }}>{track.name}</span>
        <ChevronUp size={13} />
      </button>
    );
  }

  return (
    <div className="mini-player" role="region" aria-label={t('music.player')} data-testid="mini-player">
      <div className="mini-player-track">
        <button
          type="button"
          className="btn sm icon accent"
          onClick={() => (playing ? musicPlayer.pause() : play(at))}
          title={t(playing ? 'music.pause' : 'music.resume')}
          data-testid="mini-player-toggle"
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <div className="col" style={{ minWidth: 0, gap: 1 }}>
          <span className="mini-player-name" title={track.name}>{track.name}</span>
          <span className="mini-player-meta">
            {section && <span className="sec-swatch" style={{ background: LABEL_COLOR[section.label] }} aria-hidden />}
            <span>{section ? SECTION_NAMES[section.label] : ''}</span>
          </span>
        </div>
      </div>

      <div className="mini-player-center">
        <span className="mono small dim">{fmt(at)}</span>
        <input
          type="range"
          className="mini-player-seek"
          min={0}
          max={a.duration}
          step={0.1}
          value={at}
          aria-label={t('music.seek')}
          onChange={(e) => play(Number(e.target.value))}
        />
        <span className="mono small dim">{fmt(a.duration)}</span>
      </div>

      <div className="mini-player-actions">
        <button
          type="button"
          className="btn ghost sm icon"
          onClick={() => useStore.getState().setPage('music')}
          title={t('music.openPage')}
        >
          <Maximize2 size={13} />
        </button>
        <button
          type="button"
          className="btn ghost sm icon"
          onClick={() => setCollapsed(true)}
          title={t('music.hidePlayer')}
          data-testid="mini-player-collapse"
        >
          <ChevronDown size={14} />
        </button>
        <button
          type="button"
          className="btn ghost sm icon"
          onClick={() => musicPlayer.stop()}
          title={t('music.stopPlayer')}
          data-testid="mini-player-stop"
        >
          <Square size={13} />
        </button>
      </div>
    </div>
  );
}
