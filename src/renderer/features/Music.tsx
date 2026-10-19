import { useEffect, useRef, useState } from 'react';
import { Lock, LockOpen, Music2, Pause, Pencil, Play, RefreshCw, Shuffle, Sparkles, Square, Undo2, Upload, Wand2 } from 'lucide-react';
import { useStore } from '../store';
import { useT, type MessageKey } from '../i18n';
import { act } from '../api';
import { Empty, PageHead, Panel } from '../components/ui';
import { musicPlayer } from '../musicPlayer';
import { KEY_NAMES, SECTION_NAMES } from '../../core/music/analyze';
import { suggestIntents } from '../../core/music/suggest';
import { SECTION_LABELS, type Mood, type MusicTrack, type SectionLabel } from '../../core/model/schemas';
import { BEAM_NAMES, EFFECT_NAMES, EVENT_STYLE, EXTRA_NAMES, fmt, LABEL_COLOR, MOVE_NAMES } from './music/names';
import { SectionEditor } from './music/SectionEditor';
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

function SectionStrip({ track, selected, onSelect, pos }: { track: MusicTrack; selected: number; onSelect: (i: number) => void; pos: number | null }) {
  const t = useT();
  const a = track.analysis;
  const now = pos === null ? -1 : a.sections.findIndex((s) => pos >= s.start && pos < s.end);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * a.duration);
  return (
    <div className="sec-timeline">
      <div className="sec-track">
        <div className="sec-strip" data-testid="section-strip">
          {a.sections.map((s, i) => (
            <button key={i} className={`sec-btn ${i === selected ? 'sel' : ''} ${i === now ? 'now' : ''}`} aria-pressed={i === selected} onClick={() => onSelect(i)}
              title={t('music.strip.title', { label: SECTION_NAMES[s.label], from: fmt(s.start), to: fmt(s.end), energy: Math.round(s.energy * 100) })}
              style={{ flex: `${s.end - s.start} 0 0`, background: LABEL_COLOR[s.label] }}>
              <span className="sec-name">{SECTION_NAMES[s.label]}</span>
              <span className="sec-time" aria-hidden>{fmt(s.start)}{track.plan?.sections[i]?.locked && <Lock size={9} aria-label={t('music.strip.locked')} />}</span>
              <span className="sec-energy" style={{ width: `${s.energy * 100}%` }} aria-hidden />
            </button>
          ))}
        </div>
        {a.events.map((e, i) => e.kind !== 'silence' && (
          <span key={i} className={`sec-event ${e.kind}`} title={t(`music.event.${e.kind}`)} style={{ left: `${(e.t / a.duration) * 100}%`, width: e.duration > 0 ? `${(e.duration / a.duration) * 100}%` : 2, background: EVENT_STYLE[e.kind][1] }} />
        ))}
        {pos !== null && <span className="sec-playhead" style={{ left: `${Math.min(100, (pos / a.duration) * 100)}%` }} />}
      </div>
      <div className="sec-ruler" aria-hidden>{ticks.map((x) => <span key={x} style={{ left: `${(x / a.duration) * 100}%` }}>{fmt(x)}</span>)}</div>
      <div className="sec-legend small dim">
        <span>{t('music.event.legend')}</span>
        {(Object.keys(EVENT_STYLE) as (keyof typeof EVENT_STYLE)[]).map((k) => <span key={k} className="row" style={{ gap: 4 }}><i style={{ background: EVENT_STYLE[k][1] }} />{t(`music.event.${k}`)}</span>)}
        {now >= 0 && <span className="badge cyan">{t('music.strip.now')} : {SECTION_NAMES[a.sections[now]!.label]}</span>}
      </div>
    </div>
  );
}

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
            <div className="chips">{tracks.map((tk) => <button key={tk.id} className={`chip ${tk.id === track.id ? 'on' : ''}`} onClick={() => { setTrackId(tk.id); setSelected(0); setNotices([]); }}>{tk.name}</button>)}</div>
          )}
          <Panel title={track.name} actions={
            <div className="row">
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
              <button className="btn ghost sm" onClick={() => { if ((musicPlayer.playing?.trackId ?? musicPlayer.paused?.trackId) === track.id) musicPlayer.stop(); void act({ type: 'music.removeTrack', id: track.id }); }}>{t('music.remove')}</button>
            </div>
          }>
            <div className="row wrap" style={{ gap: 18, marginBottom: 12 }} data-testid="music-summary">
              <span><span className="small muted">{t('music.tempo')} </span><b className="mono">{track.analysis.bpm.toFixed(1)}</b> BPM {track.analysis.tempoStable ? '' : <span className="badge warn">{t('music.variable')}</span>}</span>
              <span><span className="small muted">{t('music.key')} </span><b>{KEY_NAMES[track.analysis.key.tonic]} {t(track.analysis.key.mode === 'major' ? 'music.major' : 'music.minor')}</b> <span className="small dim">({Math.round(track.analysis.key.confidence * 100)} %)</span></span>
              <span><span className="small muted">{t('music.duration')} </span><b className="mono">{fmt(track.analysis.duration)}</b></span>
              <span><span className="small muted">{t('music.sections')} </span><b>{track.analysis.sections.length}</b></span>
              <span className="small dim">{t('music.eventsSummary', { impacts: track.analysis.events.filter((e) => e.kind === 'impact').length, risers: track.analysis.events.filter((e) => e.kind === 'riser').length, vocal: Math.round(track.analysis.events.filter((e) => e.kind === 'vocal').reduce((d, e) => d + e.duration, 0)) })}</span>
            </div>
            <SectionStrip track={track} selected={selected} onSelect={(i) => { setSelected(i); setEditing(i); }} pos={playing?.trackId === track.id ? pos : null} />
            {(playing?.trackId ?? musicPlayer.paused?.trackId) === track.id && (
              <input type="range" className="mini-player-seek" min={0} max={track.analysis.duration} step={0.1} value={playing ? pos : musicPlayer.paused!.at} aria-label={t('music.seek')} data-testid="music-seek" onChange={(e) => play(track, Number(e.target.value))} />
            )}
            <p className="small dim" style={{ marginBottom: 0 }}>{t('music.strip.hint')}</p>
          </Panel>

          <Panel title={t('music.intent')} actions={track.plan ? <span className={`badge ${track.plan.provider === 'openrouter' ? 'violet' : ''}`}>{track.plan.provider === 'openrouter' ? `OpenRouter · ${track.plan.model}` : t('music.localRules')} · {t('music.variantN', { n: track.plan.variant })}</span> : null}>
            <div className="col">
              <textarea className="input" rows={2} value={intent} onChange={(e) => setIntent(e.target.value)} placeholder={t('music.intentPlaceholder')} data-testid="music-intent" />
              {(aiOn || suggestions.length > 0) && (
              <div className="chips" data-testid="music-intent-suggestions">
                <span className="muted small">{t('music.suggestions')}</span>
                {suggestions.map((text) => <button key={text} className="chip" title={t('music.suggestions.hint')} onClick={() => setIntent((v) => (v.trim() ? `${v.trim()}, ${text}` : text).slice(0, 500))}>{text}</button>)}
                {aiOn && (
                  <button className="chip" data-testid="music-intent-suggest-ai" disabled={suggesting || busy} title={t('music.suggestions.aiHint')} onClick={() => requestSuggestions(track.id, intent)}>
                    {suggesting ? t('music.suggestions.aiBusy') : t('music.suggestions.ai')}
                  </button>
                )}
              </div>
              )}
              <div className="chips" data-testid="music-intent-presets">
                {INTENT_PRESETS.map(([key, text]) => <button key={key} className="chip" title={text} onClick={() => setIntent((v) => (v.trim() ? `${v.trim()}, ${text}` : text).slice(0, 500))}>{t(`music.preset.${key}`)}</button>)}
                {history.length > 0 && (
                  <select className="select" value="" onChange={(e) => e.target.value && setIntent(e.target.value)} aria-label={t('music.recentIntents')} data-testid="music-intent-history" style={{ maxWidth: 260 }}>
                    <option value="">{t('music.recentIntents')}</option>
                    {history.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                )}
              </div>
              <div className="mood-grid" data-testid="music-mood">
                {MOOD_KEYS.map((k) => (
                  <label key={k} className="mood-slider small">
                    <span className="muted">{t(`music.mood.${k}`)}</span>
                    <span className="dim">{t(`music.mood.${k}.low`)}</span>
                    <input type="range" min={-1} max={1} step={1} value={mood[k]} onChange={(e) => setMood({ ...mood, [k]: Number(e.target.value) })} data-testid={`mood-${k}`} />
                    <span className="dim">{t(`music.mood.${k}.high`)}</span>
                    <b className={mood[k] ? '' : 'dim'}>{mood[k] ? t(`music.mood.${k}.${mood[k] < 0 ? 'low' : 'high'}`) : t('music.mood.auto')}</b>
                  </label>
                ))}
              </div>
              <div className="row">
                <button className="btn primary" disabled={busy} onClick={() => void generate(false)} data-testid="music-generate"><Wand2 size={14} />{t(track.plan ? 'music.regenerateShow' : 'music.generateShow')}</button>
                <button className="btn" disabled={busy || !track.plan} onClick={() => void generate(true)} title={t('music.variantHint')}><Shuffle size={14} />{t('music.variant')}</button>
                <button className="btn" disabled={busy || !track.previousPlan} onClick={() => void restore()} title={t('music.restoreHint')} data-testid="music-restore"><Undo2 size={14} />{t('music.restore')}</button>
                {track.created.timelineId && <button className="btn ghost" onClick={() => useStore.getState().setPage('timeline')}>{t('music.openTimeline')}</button>}
              </div>
              {track.plan && <p className="small" style={{ margin: 0 }} data-testid="music-plan-summary"><Sparkles size={12} /> {track.plan.summary}</p>}
              {notices.map((n, i) => <div key={i} className="small" style={{ color: '#fcd34d' }}>{n}</div>)}
              <p className="small dim" style={{ margin: 0 }}>{t('music.privacy')}</p>
            </div>
          </Panel>

          <Panel title={t('music.sections')} flush>
            <table className="table small" data-testid="music-sections">
              <thead><tr><th>#</th><th>{t('music.col.section')}</th><th>{t('music.col.start')}</th><th>{t('music.col.energy')}</th><th>{t('music.col.plan')}</th><th>{t('music.col.instruction')}</th><th /></tr></thead>
              <tbody>
                {track.analysis.sections.map((s, i) => {
                  const p = track.plan?.sections[i];
                  return (
                    <tr key={i} className={`clickable ${i === selected ? 'sel' : ''} ${i === nowIdx ? 'active' : ''}`} onClick={() => setSelected(i)}>
                      <td className="mono">{i + 1}</td>
                      <td>
                        <select className="select" value={s.label} onChange={(e) => void act({ type: 'music.setSection', trackId: track.id, index: i, label: e.target.value as SectionLabel })}>
                          {SECTION_LABELS.map((l) => <option key={l} value={l}>{SECTION_NAMES[l]}</option>)}
                        </select>
                      </td>
                      <td className="mono">{fmt(s.start)}</td>
                      <td style={{ width: 90 }}><div className="meter"><div style={{ width: `${s.energy * 100}%` }} /></div></td>
                      <td>
                        {p ? (<>
                          <span className="row" style={{ gap: 6 }}>
                            <span className="mono" title={t('music.planEnergy')}>{'●'.repeat(p.energy)}{'○'.repeat(5 - p.energy)}</span>
                            {p.palette.map((c) => <span key={c} style={{ width: 12, height: 12, borderRadius: 3, background: c, display: 'inline-block' }} />)}
                            <span>{EFFECT_NAMES[p.effect]}{p.effect !== 'none' ? ` ${p.effectBeats} t` : ''}</span>
                            <span className="dim">· {MOVE_NAMES[p.movement]}{BEAM_NAMES[p.beam] ? ` · ${BEAM_NAMES[p.beam]}` : ''}{p.focus ? (p.focus === 'audience' ? t('music.towardAudience') : t('music.towardMarker', { name: markers.find((m) => m.id === p.focus)?.name ?? t('music.aMarker') })) : ''}</span>
                            {p.groups.length > 0 && <span className="dim">· {p.groups.map((g) => groups.find((x) => x.id === g)?.name).filter(Boolean).join(', ')}</span>}
                            {p.extras.length > 0 && <span className="dim">· {p.extras.map((x) => EXTRA_NAMES[x]).join(', ')}</span>}
                            {p.note && <span className="badge">{p.note}</span>}
                          </span>
                          {p.why && <div className="small dim" style={{ marginTop: 2 }} data-testid="music-section-why">{t('music.edit.why', { why: p.why })}</div>}
                        </>) : <span className="dim">—</span>}
                      </td>
                      <td style={{ width: 200 }}>
                        <input className="input" disabled={!p} placeholder={t('music.instrPlaceholder')} value={instr[i] ?? ''} onChange={(e) => setInstr({ ...instr, [i]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && void regenerate(i)} />
                      </td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <button className="btn ghost sm icon" title={t('music.edit.open')} onClick={(e) => { e.stopPropagation(); setEditing(i); }} data-testid="section-edit"><Pencil size={12} /></button>
                        <button className="btn ghost sm icon" disabled={!p || busy} title={t('music.regenSection')} onClick={() => void regenerate(i)}><RefreshCw size={12} /></button>
                        <button className={`btn ghost sm icon ${p?.locked ? 'on' : ''}`} disabled={!p} title={t(p?.locked ? 'music.unlock' : 'music.lock')} onClick={() => void act({ type: 'music.setSection', trackId: track.id, index: i, locked: !p?.locked })}>{p?.locked ? <Lock size={12} /> : <LockOpen size={12} />}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </div>
      )}
      {track && track.analysis.sections[editing] && (
        <SectionEditor key={`${track.id}:${editing}`} track={track} index={editing} onClose={() => setEditing(-1)} onNotices={setNotices} />
      )}
    </div>
  );
}
