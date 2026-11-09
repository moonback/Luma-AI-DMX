import { useEffect, useRef, useState } from 'react';
import { Lock, Maximize2, Minus, Plus, Volume2 } from 'lucide-react';
import { useT } from '../../i18n';
import type { MusicTrack } from '../../../core/model/schemas';
import { SECTION_NAMES } from '../../../core/music/analyze';
import { EVENT_STYLE, fmt, LABEL_COLOR, MOVE_NAMES } from './names';
import { musicPlayer } from '../../musicPlayer';

interface Props {
  track: MusicTrack;
  selected: number;
  onSelect: (index: number) => void;
  onOpenEditor: (index: number) => void;
  pos: number | null;
  playing: boolean;
}

export function SongStudioTimeline({
  track,
  selected,
  onSelect,
  onOpenEditor,
  pos,
  playing,
}: Props) {
  const t = useT();
  const a = track.analysis;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveform, setWaveform] = useState<number[] | null>(null);
  const [zoom, setZoom] = useState(1);
  const lanesRef = useRef<HTMLDivElement>(null);
  const minTimelineWidth = Math.max(1000, a.sections.length * 68) * zoom;

  // Load waveform from musicPlayer if audio buffer is available
  useEffect(() => {
    const wf = musicPlayer.getWaveform(track.hash, 300);
    setWaveform(wf);
  }, [track.hash, track.id]);

  // Draw waveform & energy curve on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // 1. Grid downbeats
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;
    for (const d of a.downbeats) {
      const x = (d / a.duration) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // 2. Waveform bars or synthesized energy envelope
    if (waveform && waveform.length > 0) {
      const barW = w / waveform.length;
      for (let i = 0; i < waveform.length; i++) {
        const amp = waveform[i]!;
        const barH = amp * (h * 0.7);
        const x = i * barW;
        const y = (h - barH) / 2;
        ctx.fillStyle = 'rgba(34, 211, 238, 0.35)'; // Cyan translucent
        ctx.fillRect(x, y, Math.max(1, barW - 1), barH);
      }
    } else {
      // Fallback: draw section energy blocks into background
      for (const s of a.sections) {
        const x1 = (s.start / a.duration) * w;
        const x2 = (s.end / a.duration) * w;
        const barH = s.energy * (h * 0.7);
        const y = (h - barH) / 2;
        ctx.fillStyle = 'rgba(139, 92, 246, 0.2)'; // Violet translucent
        ctx.fillRect(x1, y, x2 - x1, barH);
      }
    }

    // 3. Continuous energy spline line
    if (a.sections.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = '#f59e0b'; // Amber curve
      ctx.lineWidth = 2;
      for (let i = 0; i < a.sections.length; i++) {
        const s = a.sections[i]!;
        const midT = (s.start + s.end) / 2;
        const x = (midT / a.duration) * w;
        const y = h - s.energy * (h * 0.75) - 8;
        if (i === 0) {
          ctx.moveTo(0, y);
          ctx.lineTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        if (i === a.sections.length - 1) {
          ctx.lineTo(w, y);
        }
      }
      ctx.stroke();
    }
  }, [a, waveform]);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left + e.currentTarget.scrollLeft) / e.currentTarget.scrollWidth));
    const seekTime = ratio * a.duration;
    if (musicPlayer.hasAudio(track.hash)) {
      musicPlayer.play(track, seekTime);
    }
  };



  const nowSec = pos === null ? -1 : a.sections.findIndex((s) => pos >= s.start && pos < s.end);

  return (
    <div className="song-studio-timeline col" data-testid="song-studio-timeline">
      {/* Shared transport lives above the analysis; this header only explains the visual layer. */}
      <div className="studio-timeline-heading">
        <span className="studio-timeline-title">{t('music.studio.waveform')}</span>
        <span className="studio-timeline-legend"><i />{t('music.studio.energy')}</span>
        <span className="badge">{a.bpm.toFixed(1)} BPM</span>
        <span className="badge dim">{a.meter}/4</span>
        <div className="studio-zoom-controls" role="group" aria-label={t('music.studio.zoom')}>
          <button type="button" className="btn ghost sm icon" onClick={() => setZoom((v) => Math.max(1, Number((v - 0.5).toFixed(1))))} disabled={zoom <= 1} title={t('music.studio.zoomOut')} aria-label={t('music.studio.zoomOut')}><Minus size={13} /></button>
          <span className="studio-zoom-value mono" aria-live="polite">{zoom.toFixed(1)}×</span>
          <button type="button" className="btn ghost sm icon" onClick={() => setZoom((v) => Math.min(4, Number((v + 0.5).toFixed(1))))} disabled={zoom >= 4} title={t('music.studio.zoomIn')} aria-label={t('music.studio.zoomIn')}><Plus size={13} /></button>
          <button type="button" className="btn ghost sm icon" onClick={() => { setZoom(1); if (lanesRef.current) lanesRef.current.scrollTo({ left: 0, behavior: 'smooth' }); }} disabled={zoom === 1 && !(lanesRef.current?.scrollLeft)} title={t('music.studio.zoomReset')} aria-label={t('music.studio.zoomReset')}><Maximize2 size={13} /></button>
        </div>
      </div>

      {/* Multi-Track DAW Container */}
      <div
        ref={lanesRef}
        className="studio-lanes-container"
        style={{ position: 'relative', overflowX: 'auto', '--timeline-min-width': `${minTimelineWidth}px` } as React.CSSProperties}
        onClick={handleTimelineClick}
        data-testid="studio-timeline-scroll"
      >
        {/* Playhead */}
        {pos !== null && (
          <div
            className={`studio-playhead ${playing ? "is-playing" : ""}`}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${Math.min(minTimelineWidth, (pos / a.duration) * minTimelineWidth)}px`,
              width: 2,
              background: '#22d3ee',
              zIndex: 10,
              pointerEvents: 'none',
              boxShadow: '0 0 8px #22d3ee',
            }}
          />
        )}

        {/* Track 1: Waveform & Energy Canvas */}
        <div className="studio-lane lane-waveform" style={{ height: 60, position: 'relative' }}>
          <canvas
            ref={canvasRef}
            width={1000}
            height={60}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </div>

        {/* Track 2: Musical Sections */}
        <div
          className="studio-lane lane-sections row"
          data-testid="section-strip"
          style={{ height: 42, background: 'rgba(0,0,0,0.2)', position: 'relative' }}
        >
          {a.sections.map((s, i) => {
            const isSel = i === selected;
            const isNow = i === nowSec;
            const p = track.plan?.sections[i];

            return (
              <button
                key={i}
                type="button"
                className={`studio-sec-block sec-btn ${isSel ? 'sel' : ''} ${isNow ? 'now' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(i);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onOpenEditor(i);
                }}
                style={{
                  flex: `${s.end - s.start} 0 0`,
                  background: LABEL_COLOR[s.label],
                  border: 'none',
                  borderRight: '1px solid rgba(0,0,0,0.4)',
                  padding: '4px 6px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  position: 'relative',
                  textAlign: 'left',
                }}
              >
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span className="sec-name small bold truncate">{SECTION_NAMES[s.label]}</span>
                  {p?.locked && <Lock size={10} />}
                </div>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span className="sec-time mono" style={{ fontSize: 9, opacity: 0.8 }}>
                    {fmt(s.start)}
                  </span>
                  {s.hasVocals && (
                    <span title={t('music.event.vocal')}>
                      <Volume2 size={10} style={{ color: '#a855f7' }} />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Track 3: Events & Impacts */}
        <div
          className="studio-lane lane-events"
          style={{ height: 20, background: 'rgba(0,0,0,0.4)', position: 'relative' }}
        >
          {a.events.map((e, i) => {
            if (e.kind === 'silence') return null;
            const left = `${(e.t / a.duration) * 100}%`;
            const width = e.duration > 0 ? `${(e.duration / a.duration) * 100}%` : '4px';

            return (
              <button
                key={i}
                type="button"
                className={`studio-event-marker studio-event-${e.kind}`}
                title={`${t(`music.event.${e.kind}`)} · ${fmt(e.t)}`}
                aria-label={`${t(`music.event.${e.kind}`)} · ${fmt(e.t)} · ${t('music.studio.seekToEvent')}`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (musicPlayer.hasAudio(track.hash)) musicPlayer.play(track, e.t);
                }}
                style={{
                  position: 'absolute',
                  left,
                  width,
                  top: 3,
                  bottom: 3,
                  background: EVENT_STYLE[e.kind][1],
                  borderRadius: 2,
                  border: 0,
                  padding: 0,
                  cursor: 'pointer',
                }}
              />
            );
          })}
        </div>

        {/* Track 4: Lighting Layers & Movements */}
        {track.plan && (
          <div
            className="studio-lane lane-layers row"
            style={{ height: 26, background: 'rgba(0,0,0,0.25)', position: 'relative' }}
          >
            {track.plan.sections.map((p, i) => {
              const s = a.sections[i];
              if (!s) return null;

              return (
                <div
                  key={i}
                  className="studio-layer-cell row"
                  style={{
                    flex: `${s.end - s.start} 0 0`,
                    padding: '2px 4px',
                    alignItems: 'center',
                    gap: 4,
                    overflow: 'hidden',
                    borderRight: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <span className="music-tag mono" style={{ fontSize: 9 }}>
                    C{i + 1}
                  </span>
                  {p.movement !== 'none' && (
                    <span className="music-tag dim truncate" style={{ fontSize: 9 }}>
                      {MOVE_NAMES[p.movement]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
