import { useEffect, useRef, useState } from 'react';
import { Lock, Maximize2, Minus, Pencil, Plus, Volume2 } from 'lucide-react';
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
  onMoveBoundary: (index: number, time: number) => void;
  onAddEvent: (time: number) => void;
  onRemoveEvent: (index: number) => void;
  onUpdateEvent: (index: number, patch: { t?: number; duration?: number; kind?: 'impact' | 'riser' | 'silence' | 'vocal' }) => void;
  onUndo: () => void;
  onRedo: () => void;
  pos: number | null;
  playing: boolean;
}

export function SongStudioTimeline({
  track,
  selected,
  onSelect,
  onOpenEditor,
  onMoveBoundary,
  onAddEvent,
  onRemoveEvent,
  onUpdateEvent,
  onUndo,
  onRedo,
  pos,
  playing,
}: Props) {
  const t = useT();
  const a = track.analysis;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveform, setWaveform] = useState<number[] | null>(null);
  const [zoom, setZoom] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);
  const [dragBoundary, setDragBoundary] = useState<{ index: number; time: number } | null>(null);
  const [dragEvent, setDragEvent] = useState<{ index: number; time: number } | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const lanesRef = useRef<HTMLDivElement>(null);
  const minTimelineWidth = Math.max(1000, a.sections.length * 68) * zoom;
  const playheadPx = pos === null ? 0 : Math.max(0, Math.min(minTimelineWidth, (pos / a.duration) * minTimelineWidth));

  // Keep the playhead in view during playback without constantly recentering the operator's viewport.
  useEffect(() => {
    const viewport = lanesRef.current;
    if (!playing || pos === null || !viewport) return;
    const rightEdge = viewport.scrollLeft + viewport.clientWidth;
    if (playheadPx > rightEdge - 72) viewport.scrollTo({ left: Math.max(0, playheadPx - viewport.clientWidth * 0.72), behavior: 'auto' });
    else if (playheadPx < viewport.scrollLeft + 24) viewport.scrollTo({ left: Math.max(0, playheadPx - 24), behavior: 'auto' });
  }, [playing, pos, playheadPx]);

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
  const snapTime = (time: number) => {
    if (!snapEnabled) return time;
    const candidates = [...a.downbeats, ...a.beats];
    let nearest = time, distance = Infinity;
    for (const beat of candidates) { const d = Math.abs(beat - time); if (d < distance) { distance = d; nearest = beat; } }
    return distance <= Math.min(0.18, 30 / a.bpm) ? nearest : time;
  };
  const selectedMusicEvent = selectedEvent === null ? null : a.events[selectedEvent] ?? null;
  const timeAtClientX = (clientX: number) => {
    const viewport = lanesRef.current;
    if (!viewport) return 0;
    const rect = viewport.getBoundingClientRect();
    const x = Math.max(0, Math.min(viewport.scrollWidth, clientX - rect.left + viewport.scrollLeft));
    return Math.max(0, Math.min(a.duration, (x / Math.max(1, viewport.scrollWidth)) * a.duration));
  };

  return (
    <div className="song-studio-timeline col" data-testid="song-studio-timeline">
      <div className="studio-selection-toolbar">
        <span className="studio-selection-label">{a.sections[selected] ? `${t('music.studio.section')} ${selected + 1} · ${SECTION_NAMES[a.sections[selected]!.label]}` : t('music.studio.noSectionSelected')}</span>
        <span className="studio-selection-time mono">{a.sections[selected] ? `${fmt(a.sections[selected]!.start)} – ${fmt(a.sections[selected]!.end)}` : ''}</span>
        <button type="button" className="btn ghost sm" onClick={onUndo} title={t('music.studio.undo')}>{t('music.studio.undo')}</button>
        <button type="button" className="btn ghost sm" onClick={onRedo} title={t('music.studio.redo')}>{t('music.studio.redo')}</button>
        <button type="button" className="btn ghost sm" disabled={!a.sections[selected]} onClick={() => onOpenEditor(selected)} data-testid="studio-edit-selected"><Pencil size={12} />{t('music.studio.editSection')}</button>
      </div>
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
        {dragBoundary && <div className="studio-boundary-preview" style={{ left: (dragBoundary.time / a.duration) * minTimelineWidth }} aria-hidden="true" />}
        {dragEvent && <div className="studio-event-preview" style={{ left: (dragEvent.time / a.duration) * minTimelineWidth }} aria-hidden="true" />}
        {/* Playhead */}
        {pos !== null && (
          <div
            className={`studio-playhead ${playing ? "is-playing" : ""}`}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${playheadPx}px`,
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
                aria-pressed={isSel}
                aria-label={`${SECTION_NAMES[s.label]} · ${fmt(s.start)}–${fmt(s.end)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(i);
                }}
                onKeyDown={(event) => {
                  if (!event.shiftKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') || i >= a.sections.length - 1) return;
                  event.preventDefault();
                  event.stopPropagation();
                  if (track.plan?.sections[i]?.locked || track.plan?.sections[i + 1]?.locked) return;
                  const step = 60 / a.bpm;
                  onMoveBoundary(i, Math.max(s.start + 1, Math.min(a.sections[i + 1]!.end - 1, s.end + (event.key === 'ArrowRight' ? step : -step))));
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
                  overflow: 'visible',
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
                {i < a.sections.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={`studio-section-boundary ${dragBoundary?.index === i ? 'is-dragging' : ''}`}
                    title={t('music.studio.dragBoundary')}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (track.plan?.sections[i]?.locked || track.plan?.sections[i + 1]?.locked) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setDragBoundary({ index: i, time: s.end });
                    }}
                    onPointerMove={(event) => {
                      if (dragBoundary?.index === i) setDragBoundary({ index: i, time: timeAtClientX(event.clientX) });
                    }}
                    onPointerUp={(event) => {
                      event.stopPropagation();
                      if (dragBoundary?.index === i) {
                        const rawTime = timeAtClientX(event.clientX);
                        const time = Math.max(s.start + 1, Math.min(a.sections[i + 1]!.end - 1, rawTime));
                        setDragBoundary(null);
                        onMoveBoundary(i, time);
                      }
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                    }}
                    onPointerCancel={() => setDragBoundary(null)}
                    onClick={(event) => event.stopPropagation()}

                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Track 3: Events & Impacts */}
        <div
          className="studio-lane lane-events"
          style={{ height: 28, background: 'rgba(0,0,0,0.4)', position: 'relative' }}
          tabIndex={0}
          aria-label={t('music.studio.eventsLane')}
          onDoubleClick={(event) => { if ((event.target as HTMLElement).closest('button')) return; const rect = event.currentTarget.getBoundingClientRect(); onAddEvent(Math.max(0, Math.min(a.duration, ((event.clientX - rect.left) / rect.width) * a.duration))); }}
          onKeyDown={(event) => { if ((event.key === 'Delete' || event.key === 'Backspace') && selectedEvent !== null) { event.preventDefault(); onRemoveEvent(selectedEvent); setSelectedEvent(null); } }}
        >
          {a.events.map((e, i) => {
            const left = `${(e.t / a.duration) * 100}%`;
            const width = e.duration > 0 ? `${(e.duration / a.duration) * 100}%` : '4px';

            return (
              <button
                key={i}
                type="button"
                className={`studio-event-marker studio-event-${e.kind} ${selectedEvent === i ? 'is-selected' : ''}`}
                title={`${t(`music.event.${e.kind}`)} · ${fmt(e.t)}`}
                aria-label={`${t(`music.event.${e.kind}`)} · ${fmt(e.t)} · ${t('music.studio.seekToEvent')}`}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  if (event.button !== 0) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setSelectedEvent(i);
                  setDragEvent({ index: i, time: e.t });
                }}
                onPointerMove={(event) => {
                  if (dragEvent?.index !== i) return;
                  event.stopPropagation();
                  setDragEvent({ index: i, time: snapTime(timeAtClientX(event.clientX)) });
                }}
                onPointerUp={(event) => {
                  event.stopPropagation();
                  if (dragEvent?.index === i) {
                    const time = snapTime(timeAtClientX(event.clientX));
                    setDragEvent(null);
                    if (Math.abs(time - e.t) > 0.015) onUpdateEvent(i, { t: time });
                  }
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={() => setDragEvent(null)}
                onClick={(event) => { event.stopPropagation(); setSelectedEvent(i); }}
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
                  cursor: 'grab',
                  touchAction: 'none',
                  opacity: dragEvent?.index === i ? 0.45 : undefined,
                }}
              />
            );
          })}
        </div>
        <div className="studio-event-inspector" onClick={(event) => event.stopPropagation()}>
          <span className="small dim">{selectedMusicEvent ? `${t('music.studio.selectedEvent')} · ${fmt(selectedMusicEvent.t)}` : t('music.studio.noEvent')}</span>
          {selectedMusicEvent && selectedEvent !== null && <>
            <select aria-label={t('music.studio.eventType')} value={selectedMusicEvent.kind} onChange={(event) => onUpdateEvent(selectedEvent, { kind: event.target.value as 'impact' | 'riser' | 'silence' | 'vocal' })}>
              {(['impact', 'riser', 'silence', 'vocal'] as const).map((kind) => <option key={kind} value={kind}>{t(`music.event.${kind}`)}</option>)}
            </select>
            <label className="small">{t('music.studio.duration')} <input aria-label={t('music.studio.duration')} type="number" min="0" max="600" step="0.05" value={selectedMusicEvent.duration} onChange={(event) => onUpdateEvent(selectedEvent, { duration: Math.max(0, Math.min(600, Number(event.target.value) || 0)) })} /></label>
            <label className="small studio-snap"><input type="checkbox" checked={snapEnabled} onChange={(event) => setSnapEnabled(event.target.checked)} />{t('music.studio.snap')}</label>
            <button type="button" className="btn ghost sm" onClick={() => { onRemoveEvent(selectedEvent); setSelectedEvent(null); }}>{t('music.studio.removeEvent')}</button>
          </>}
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
