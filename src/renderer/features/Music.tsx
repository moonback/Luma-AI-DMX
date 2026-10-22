import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowLeftRight, Clock, Layers, Lock, LockOpen, Music2, Pause, Pencil, Play, RefreshCw, Shuffle, Sparkles, Square, Undo2, Upload, Wand2 } from 'lucide-react';
import { useStore } from '../store';
import { useT, type MessageKey } from '../i18n';
import { act } from '../api';
import { Empty, PageHead, Panel } from '../components/ui';
import { musicPlayer } from '../musicPlayer';
import { KEY_NAMES, SECTION_NAMES } from '../../core/music/analyze';
import { suggestIntents } from '../../core/music/suggest';
import { SECTION_LABELS, type Mood, type MusicTrack, type SectionLabel } from '../../core/model/schemas';
import { BEAM_NAMES, EFFECT_NAMES, EXTRA_NAMES, fmt, LABEL_COLOR, MOVE_NAMES } from './music/names';
import { SectionEditor } from './music/SectionEditor';
import { SongStudioTimeline } from './music/SongStudioTimeline';
import { ArtisticQualityBadge } from './music/ArtisticQualityBadge';
import { VariantCompareModal } from './music/VariantCompareModal';
import type { Progress } from '../../shared/commands';
import { usePlayback } from './music/MiniPlayer';

// Kept in French whatever the UI language: the local rules (parseIntent) only read French.
const NO_MOOD: Mood = { energy: 0, colors: 0, movement: 0, strobe: 0 };
const MOOD_KEYS = ['energy', 'colors', 'movement', 'strobe'] as const;

const HISTORY_KEY = 'luma.intentHistory';
function loadHistory(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}
/** Most recent first, no duplicates, 8 kept (per machine, all projects). */
function remember(intent: string): string[] {
  const list = [intent, ...loadHistory().filter((x) => x !== intent)].slice(0, 8);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch { /* storage unavailable: the list stays in memory */ }
  return list;
}

const INTENT_PRESETS = [
  ['dark', 'ambiance calme, couleurs froides'],
  ['edm', 'explosion sur les drops, strobe, lumières sur les basses, couleurs qui suivent la musique'],
  ['rock', 'couplets sobres, refrains explosifs, couleurs chaudes'],
  ['wedding', 'ambiance douce et chaleureuse, pas de strobe, sans fumée'],
  ['minimal', 'sobre, sans mouvement, pas de strobe'],
] as const;


/** Real steps reported by the main process (`progress` events) and where each one sits on the bar. */
const GEN_STEPS: Record<Progress['step'], { key: MessageKey; p: number }> = {
  plan: { key: 'music.genStep.plan', p: 0.15 },
  request: { key: 'music.genStep.request', p: 0.45 },
  cache: { key: 'music.genStep.cache', p: 0.7 },
  compile: { key: 'music.genStep.compile', p: 0.9 },
};

/** Modal while the show is generated; the OpenRouter request can be cancelled (nothing is applied then). */
function GeneratingModal() {
  const t = useT();
  const step = useStore((s) => s.progress?.step ?? 'plan');
  const { key, p } = GEN_STEPS[step];
  const pct = Math.round(p * 100);
  return (
    <div className="overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label={t('music.generating')} data-testid="music-generating">
        <div className="modal-head">{t('music.generating')}</div>
        <div className="modal-body col">
          <div className="gen-rig" aria-hidden="true">
            <div className="gen-haze" />
            <div className="gen-truss" />
            {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className="gen-head" style={{ '--i': i } as React.CSSProperties} />)}
            <div className="gen-stage" />
            <div className="gen-crowd back" />
            <div className="gen-crowd" />
            <div className="gen-strobe" />
          </div>
          <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><div style={{ width: `${pct}%` }} /></div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="small dim gen-step" aria-live="polite">{t(key)}</span>
            <span className="small dim mono">{pct} %</span>
          </div>
          {step === 'request' && <button className="btn sm" data-testid="music-cancel" onClick={() => void act({ type: 'ai.cancel' })}>{t('music.genCancel')}</button>}
        </div>
      </div>
    </div>
  );
}

export function MusicPage() {
  const project = useStore((s) => s.project!.project);
  const tracks = project.music.tracks;
  const { groups, visualizer: { markers } } = project;
  const [trackId, setTrackId] = useState<string | null>(tracks[0]?.id ?? null);
  const [progress, setProgress] = useState<{ p: number; step: string } | null>(null);
  const [intent, setIntent] = useState('');
  const [history, setHistory] = useState(loadHistory);
  const [mood, setMood] = useState(NO_MOOD);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notices, setNotices] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState(-1); // index of the section open in the editor
  const [comparingAB, setComparingAB] = useState(false);
  const t = useT();
  const [instr, setInstr] = useState<Record<number, string>>({});
  const file = useRef<HTMLInputElement>(null);
  const { playing, pos } = usePlayback();
  const track = tracks.find((t) => t.id === trackId) ?? tracks[0] ?? null;
  const nowIdx = track && playing?.trackId === track.id ? track.analysis.sections.findIndex((s) => pos >= s.start && pos < s.end) : -1;
  const [aiSuggestions, setAiSuggestions] = useState<{ trackId: string; items: string[]; provider: 'local' | 'openrouter' } | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  // With OpenRouter enabled, only the AI suggestions are shown; the local ones appear only without it.
  const aiOn = useStore((s) => s.runtime?.ai.provider === 'openrouter');
  const localSuggestions = track && !aiOn ? suggestIntents(track.analysis).filter((s) => !intent.includes(s)) : [];
  const aiList = aiSuggestions && aiSuggestions.trackId === track?.id ? aiSuggestions.items.filter((s) => !intent.includes(s)) : [];
  const suggestions = aiOn ? aiList : localSuggestions;
  const planIntent = track?.plan?.intent ?? '';
  useEffect(() => { if (planIntent) setIntent(planIntent); }, [track?.id, planIntent]);
  const planMood = track?.plan?.mood;
  useEffect(() => { setMood(planMood ?? NO_MOOD); }, [track?.id, planMood]);
  const hash = track?.hash;
  useEffect(() => { if (hash) musicPlayer.restore(hash).catch(() => undefined); }, [hash]);

  const importFile = async (f: File) => {
    try {
      const r = await musicPlayer.load(f, { bpmRange: project.audio.bpmRange, known: (h) => tracks.some((t) => t.hash === h), onProgress: (p, step) => setProgress({ p, step }) });
      if (r.analysis) {
        const added = await act({ type: 'music.addTrack', name: r.name, hash: r.hash, analysis: r.analysis });
        if (added) setTrackId(added.id);
      } else {
        const known = tracks.find((t) => t.hash === r.hash);
        if (known) setTrackId(known.id);
        useStore.getState().toast({ kind: 'info', title: t('music.known'), detail: t('music.knownDetail') });
      }
    } catch (err) {
      useStore.getState().toast({ kind: 'error', title: t('music.importError'), detail: err instanceof Error ? err.message : String(err) });
    } finally {
      setProgress(null);
    }
  };
  const generate = async (nextVariant: boolean) => {
    if (!track) return;
    setBusy(true);
    useStore.setState({ progress: null });
    setGenerating(true);
    const r = await act({ type: 'music.generate', trackId: track.id, intent, nextVariant, mood });
    setGenerating(false);
    setBusy(false);
    if (r && intent.trim()) setHistory(remember(intent.trim()));
    if (r) setNotices(r.notices);
  };
  const requestSuggestions = async (trackId: string, text: string) => {
    setSuggesting(true);
    const r = await act({ type: 'music.suggestIntents', trackId, intent: text });
    setSuggesting(false);
    if (r) {
      setAiSuggestions({ trackId, items: r.provider === 'openrouter' ? r.suggestions : [], provider: r.provider });
      setNotices(r.notices);
    }
  };
  // Automatic suggestions when the setting is on: as soon as a track is analysed or opened on this page.
  useEffect(() => {
    if (!track) return;
    let cancelled = false;
    void act({ type: 'settings.get' }).then((s) => {
      if (!cancelled && s?.ai.autoSuggestIntents && s.ai.provider === 'openrouter') void requestSuggestions(track.id, track.plan?.intent ?? '');
    });
    return () => { cancelled = true; };
  }, [track?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- runs once per track, not on every render
  const restore = async () => {
    if (!track) return;
    setBusy(true);
    const r = await act({ type: 'music.restorePrevious', trackId: track.id });
    setBusy(false);
    if (r) setNotices(r.notices);
  };
  const regenerate = async (index: number) => {
    if (!track) return;
    setBusy(true);
    const r = await act({ type: 'music.regenerateSection', trackId: track.id, index, instruction: instr[index] ?? '' });
    setBusy(false);
    if (r) setNotices(r.notices);
  };
  const play = (tk: MusicTrack, from = tk.analysis.sections[selected]?.start ?? 0) => {
    try {
      musicPlayer.play(tk, from);
    } catch (err) {
      useStore.getState().toast({ kind: 'error', title: t('music.playError'), detail: (err as Error).message });
    }
  };

  return (
    <div className="page">
      <PageHead title={t('music.page.title')} subtitle={t('music.page.subtitle')}>
        <input ref={file} type="file" accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a" style={{ display: 'none' }} data-testid="music-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
        <button className="btn primary" disabled={!!progress} onClick={() => file.current?.click()} data-testid="music-import"><Upload size={14} />{t('music.import')}</button>
      </PageHead>
      {generating && <GeneratingModal />}
      {progress && (
        <Panel title={`${progress.step}…`}>
          <div className="meter" data-testid="music-progress"><div style={{ width: `${Math.round(progress.p * 100)}%` }} /></div>
        </Panel>
      )}
      {!track ? (
        <Empty icon={<Music2 size={32} />} title={t('music.empty')}>{t('music.emptyHint')}</Empty>
      ) : (
        <div className="col gap-lg">
          {tracks.length > 1 && (
            <div className="chips" style={{ marginBottom: -4 }}>{tracks.map((tk) => <button key={tk.id} className={`chip ${tk.id === track.id ? 'on' : ''}`} onClick={() => { setTrackId(tk.id); setSelected(0); setNotices([]); }}>{tk.name}</button>)}</div>
          )}

          {/* 2. Lecteur et timeline */}
          <Panel title={track.name} actions={<span className="badge">{track.analysis.sections.length} {t('music.sections').toLowerCase()}</span>}>
            {/* Informations sous forme de petits indicateurs */}
            <div className="music-indicators" data-testid="music-summary">
              <div className="music-indicator-pill">
                <Activity size={13} style={{ color: '#22d3ee' }} />
                <span className="small muted">{t('music.tempo')} </span>
                <b className="mono">{track.analysis.bpm.toFixed(1)}</b>
                <span>BPM</span>
                {!track.analysis.tempoStable && <span className="badge warn sm">{t('music.variable')}</span>}
              </div>
              <div className="music-indicator-pill">
                <Music2 size={13} style={{ color: '#a78bfa' }} />
                <span className="small muted">{t('music.key')} </span>
                <b>{KEY_NAMES[track.analysis.key.tonic]} {t(track.analysis.key.mode === 'major' ? 'music.major' : 'music.minor')}</b>
                <span className="small dim">({Math.round(track.analysis.key.confidence * 100)} %)</span>
              </div>
              <div className="music-indicator-pill">
                <Clock size={13} style={{ color: '#38bdf8' }} />
                <span className="small muted">{t('music.duration')} </span>
                <b className="mono">
                  {playing?.trackId === track.id
                    ? `${fmt(pos)} / ${fmt(track.analysis.duration)}`
                    : musicPlayer.paused?.trackId === track.id
                    ? `${fmt(musicPlayer.paused.at)} / ${fmt(track.analysis.duration)}`
                    : fmt(track.analysis.duration)}
                </b>
              </div>
              <div className="music-indicator-pill">
                <Layers size={13} style={{ color: '#f472b6' }} />
                <span className="small muted">{t('music.sections')} </span>
                <b>{track.analysis.sections.length}</b>
              </div>
              <div className="music-indicator-pill dim small" style={{ marginLeft: 'auto' }}>
                <Sparkles size={12} style={{ color: '#fde047' }} />
                <span>{t('music.eventsSummary', { impacts: track.analysis.events.filter((e) => e.kind === 'impact').length, risers: track.analysis.events.filter((e) => e.kind === 'riser').length, vocal: Math.round(track.analysis.events.filter((e) => e.kind === 'vocal').reduce((d, e) => d + e.duration, 0)) })}</span>
              </div>
            </div>

            {/* Commandes de lecture regroupées */}
            <div className="music-player-bar">
              <div className="music-player-controls">
                {musicPlayer.hasAudio(track.hash) ? (
                  playing?.trackId === track.id ? (
                    <>
                      <button className="btn" onClick={() => musicPlayer.pause()} data-testid="music-pause"><Pause size={13} />{t('music.pause')}</button>
                      <button className="btn" onClick={() => musicPlayer.stop()} data-testid="music-stop"><Square size={13} />{t('music.stop', { t: fmt(pos) })}</button>
                    </>
                  ) : musicPlayer.paused?.trackId === track.id ? (
                    <>
                      <button className="btn accent" onClick={() => play(track, musicPlayer.paused!.at)} data-testid="music-resume"><Play size={13} />{t('music.resume')}</button>
                      <button className="btn" onClick={() => musicPlayer.stop()} data-testid="music-stop"><Square size={13} />{t('music.stop', { t: fmt(musicPlayer.paused.at) })}</button>
                    </>
                  ) : <button className="btn accent" onClick={() => play(track)} data-testid="music-play"><Play size={13} />{t('music.play')}</button>
                ) : <span className="small dim">{t('music.noAudio')}</span>}
              </div>
              <button className="btn ghost sm" onClick={() => { if ((musicPlayer.playing?.trackId ?? musicPlayer.paused?.trackId) === track.id) musicPlayer.stop(); void act({ type: 'music.removeTrack', id: track.id }); }}>{t('music.remove')}</button>
            </div>

            {/* Studio Song-to-Show multi-piste */}
            <SongStudioTimeline
              track={track}
              selected={selected}
              onSelect={(i) => { setSelected(i); setEditing(i); }}
              onOpenEditor={setEditing}
              pos={playing?.trackId === track.id ? pos : null}
              playing={playing?.trackId === track.id}
            />

            {(playing?.trackId ?? musicPlayer.paused?.trackId) === track.id && (
              <div className="music-seek-row">
                <span className="small mono dim" style={{ minWidth: 32 }}>{fmt(playing ? pos : musicPlayer.paused!.at)}</span>
                <input type="range" className="mini-player-seek" min={0} max={track.analysis.duration} step={0.1} value={playing ? pos : musicPlayer.paused!.at} aria-label={t('music.seek')} data-testid="music-seek" onChange={(e) => play(track, Number(e.target.value))} />
                <span className="small mono dim" style={{ minWidth: 32, textAlign: 'right' }}>{fmt(track.analysis.duration)}</span>
              </div>
            )}
          </Panel>

          {/* 3. Configuration IA */}
          <Panel title={t('music.intent')} actions={track.plan ? <span className={`badge ${track.plan.provider === 'openrouter' ? 'violet' : ''}`}>{track.plan.provider === 'openrouter' ? `OpenRouter · ${track.plan.model}` : t('music.localRules')} · {t('music.variantN', { n: track.plan.variant })}</span> : null}>
            <div className="col gap-lg">
              {/* Zone de description plus confortable */}
              <textarea className="input music-intent-area" rows={3} value={intent} onChange={(e) => setIntent(e.target.value)} placeholder={t('music.intentPlaceholder')} data-testid="music-intent" />

              {/* Préréglages regroupés et mieux espacés */}
              <div className="music-presets-block">
                {(aiOn || suggestions.length > 0) && (
                  <div className="music-preset-row" data-testid="music-intent-suggestions">
                    <span className="music-preset-label">{t('music.suggestions')}</span>
                    <div className="chips">
                      {suggestions.map((text) => <button key={text} className="chip" title={t('music.suggestions.hint')} onClick={() => setIntent((v) => (v.trim() ? `${v.trim()}, ${text}` : text).slice(0, 500))}>{text}</button>)}
                      {aiOn && (
                        <button className="chip" data-testid="music-intent-suggest-ai" disabled={suggesting || busy} title={t('music.suggestions.aiHint')} onClick={() => requestSuggestions(track.id, intent)}>
                          {suggesting ? t('music.suggestions.aiBusy') : t('music.suggestions.ai')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <div className="music-preset-row" data-testid="music-intent-presets">
                  <span className="music-preset-label">Styles</span>
                  <div className="chips" style={{ flex: 1 }}>
                    {INTENT_PRESETS.map(([key, text]) => <button key={key} className="chip" title={text} onClick={() => setIntent((v) => (v.trim() ? `${v.trim()}, ${text}` : text).slice(0, 500))}>{t(`music.preset.${key}`)}</button>)}
                  </div>
                  {history.length > 0 && (
                    <select className="select" value="" onChange={(e) => e.target.value && setIntent(e.target.value)} aria-label={t('music.recentIntents')} data-testid="music-intent-history" style={{ maxWidth: 220 }}>
                      <option value="">{t('music.recentIntents')}</option>
                      {history.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  )}
                </div>
              </div>

              {/* Réglages d'ambiance présentés en grille */}
              <div className="mood-grid" data-testid="music-mood">
                {MOOD_KEYS.map((k) => (
                  <div key={k} className="mood-card">
                    <div className="mood-card-head">
                      <span className="mood-card-title">{t(`music.mood.${k}`)}</span>
                      <b className={`badge ${mood[k] ? 'violet' : ''}`}>{mood[k] ? t(`music.mood.${k}.${mood[k] < 0 ? 'low' : 'high'}`) : t('music.mood.auto')}</b>
                    </div>
                    <div className="mood-slider-row">
                      <span className="dim">{t(`music.mood.${k}.low`)}</span>
                      <input type="range" min={-1} max={1} step={1} value={mood[k]} onChange={(e) => setMood({ ...mood, [k]: Number(e.target.value) })} data-testid={`mood-${k}`} />
                      <span className="dim">{t(`music.mood.${k}.high`)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions principales regroupées en bas du panneau */}
              <div className="music-ai-footer">
                <div className="row wrap" style={{ gap: 8 }}>
                  <button className="btn primary" disabled={busy} onClick={() => void generate(false)} data-testid="music-generate"><Wand2 size={14} />{t(track.plan ? 'music.regenerateShow' : 'music.generateShow')}</button>
                  <button className="btn" disabled={busy || !track.plan} onClick={() => void generate(true)} title={t('music.variantHint')}><Shuffle size={14} />{t('music.variant')}</button>
                  <button className="btn" disabled={busy || !track.previousPlan} onClick={() => void restore()} title={t('music.restoreHint')} data-testid="music-restore"><Undo2 size={14} />{t('music.restore')}</button>
                  {track.plan && track.previousPlan && (
                    <button className="btn" onClick={() => setComparingAB(true)} title={t('music.studio.compareAB')} data-testid="music-compare-ab">
                      <ArrowLeftRight size={14} />{t('music.studio.compareAB')}
                    </button>
                  )}
                  {track.created.timelineId && <button className="btn ghost" onClick={() => useStore.getState().setPage('timeline')}>{t('music.openTimeline')}</button>}
                </div>
                {track.plan && <div className="row small" style={{ gap: 6 }} data-testid="music-plan-summary"><Sparkles size={13} style={{ color: '#22d3ee' }} /><span>{track.plan.summary}</span></div>}
                {track.plan && <ArtisticQualityBadge plan={track.plan} analysis={track.analysis} />}
              </div>
              {notices.map((n, i) => <div key={i} className="small" style={{ color: '#fcd34d' }}>{n}</div>)}
            </div>
          </Panel>

          {/* 4. Tableau des sections musicales */}
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
                    <th className="col-instr">{t('music.col.instruction')}</th>
                    <th className="col-actions" />
                  </tr>
                </thead>
                <tbody>
                  {track.analysis.sections.map((s, i) => {
                    const p = track.plan?.sections[i];
                    return (
                      <tr key={i} className={`clickable ${i === selected ? 'sel' : ''} ${i === nowIdx ? 'active' : ''}`} onClick={() => setSelected(i)}>
                        <td className="mono col-idx">{i + 1}</td>
                        <td className="col-sec">
                          <div className="sec-label-cell">
                            <span className="sec-color-bar" style={{ background: LABEL_COLOR[s.label] }} />
                            <select className="select" value={s.label} onChange={(e) => void act({ type: 'music.setSection', trackId: track.id, index: i, label: e.target.value as SectionLabel })}>
                              {SECTION_LABELS.map((l) => <option key={l} value={l}>{SECTION_NAMES[l]}</option>)}
                            </select>
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
                        <td className="col-instr">
                          <input className="input" disabled={!p} placeholder={t('music.instrPlaceholder')} value={instr[i] ?? ''} onChange={(e) => setInstr({ ...instr, [i]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && void regenerate(i)} />
                        </td>
                        <td className="col-actions">
                          <div className="music-actions-cell">
                            <button className="btn ghost sm icon" title={t('music.edit.open')} onClick={(e) => { e.stopPropagation(); setEditing(i); }} data-testid="section-edit"><Pencil size={13} /></button>
                            <button className="btn ghost sm icon" disabled={!p || busy} title={t('music.regenSection')} onClick={(e) => { e.stopPropagation(); void regenerate(i); }}><RefreshCw size={13} /></button>
                            <button className={`btn ghost sm icon ${p?.locked ? 'on' : ''}`} disabled={!p} title={t(p?.locked ? 'music.unlock' : 'music.lock')} onClick={(e) => { e.stopPropagation(); void act({ type: 'music.setSection', trackId: track.id, index: i, locked: !p?.locked }); }}>{p?.locked ? <Lock size={13} /> : <LockOpen size={13} />}</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
      {track && track.analysis.sections[editing] && (
        <SectionEditor key={`${track.id}:${editing}`} track={track} index={editing} onClose={() => setEditing(-1)} onNotices={setNotices} />
      )}
      {comparingAB && track && (
        <VariantCompareModal
          track={track}
          onClose={() => setComparingAB(false)}
          onRestore={async () => {
            await restore();
            setComparingAB(false);
          }}
        />
      )}
    </div>
  );
}
