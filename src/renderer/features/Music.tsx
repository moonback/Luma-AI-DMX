import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Music2, Upload } from 'lucide-react';
import { confirmAction, useStore } from '../store';
import { useT, type MessageKey } from '../i18n';
import { act } from '../api';
import { Empty, PageHead, Panel } from '../components/ui';
import { musicPlayer } from '../musicPlayer';
import { suggestIntents } from '../../core/music/suggest';
import type { MusicTrack } from '../../core/model/schemas';
import { SectionEditor } from './music/SectionEditor';
import { SongStudioTimeline } from './music/SongStudioTimeline';
import { VariantCompareModal } from './music/VariantCompareModal';
import type { Progress } from '../../shared/commands';
import { usePlayback } from './music/MiniPlayer';
import { confirmOverwrite } from './music/overwriteGuard';
import { currentShowStep, ShowStepper, type ShowStep } from './music/ShowStepper';
import { TrackLibrary } from './music/TrackLibrary';
import { Transport } from './music/Transport';
import { TrackStep } from './music/TrackStep';
import { IntentStep, loadHistory, NO_MOOD, remember } from './music/IntentStep';
import { ShowStep as ShowScreen } from './music/ShowStep';
import { PlayStep } from './music/PlayStep';
import { fmt } from './music/names';

const AUDIO_ACCEPT = 'audio/*,.wav,.mp3,.flac,.ogg,.m4a';

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

/** Song to Show: the track library beside a four-step flow (Morceau → Intention → Show → Jouer), one screen at a time. */
export function MusicPage() {
  const project = useStore((s) => s.project!.project);
  const tracks = project.music.tracks;
  const { groups, visualizer: { markers } } = project;
  const t = useT();
  const { playing, pos } = usePlayback();
  const playingId = playing?.trackId ?? null;
  const [trackId, setTrackId] = useState<string | null>(tracks[0]?.id ?? null);
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const track = tracks.find((tk) => tk.id === trackId) ?? tracks[0] ?? null;
  const progressStep = currentShowStep(track, playingId);
  // Screen shown: set from the track's progress when a track is opened, then the user moves freely between the steps.
  const [view, setView] = useState<ShowStep>(progressStep);
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
  const file = useRef<HTMLInputElement>(null);
  const replaceFile = useRef<HTMLInputElement>(null);
  const isPlaying = !!track && playingId === track.id;
  const nowIdx = isPlaying ? track.analysis.sections.findIndex((s) => pos >= s.start && pos < s.end) : -1;
  const [aiSuggestions, setAiSuggestions] = useState<{ trackId: string; items: string[] } | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const aiOn = useStore((s) => s.runtime?.ai.provider === 'openrouter');
  // The local suggestions (instant, from the measured sound) show until the AI ones for this track arrive.
  const fromAi = aiSuggestions && aiSuggestions.trackId === track?.id ? aiSuggestions.items : null;
  const suggestions = track ? (fromAi ?? suggestIntents(track.analysis)).filter((s) => !intent.includes(s)) : [];
  const planIntent = track?.plan?.intent ?? '';
  useEffect(() => { if (planIntent) setIntent(planIntent); }, [track?.id, planIntent]);
  const planMood = track?.plan?.mood;
  useEffect(() => { setMood(planMood ?? NO_MOOD); }, [track?.id, planMood]);
  const hash = track?.hash;
  useEffect(() => { if (hash) musicPlayer.restore(hash).catch(() => undefined); }, [hash]);

  const select = (id: string) => {
    setTrackId(id);
    setSelected(0);
    setNotices([]);
    setView(currentShowStep(tracks.find((x) => x.id === id) ?? null, playingId));
  };
  /** Imports `f`; with `replaceId`, the new track takes the place of that one (removed once the new one is added). */
  const importFile = async (f: File, replaceId?: string) => {
    try {
      const r = await musicPlayer.load(f, { bpmRange: project.audio.bpmRange, known: (h) => tracks.some((tk) => tk.hash === h), onProgress: (p, step) => setProgress({ p, step }) });
      if (r.analysis) {
        const added = await act({ type: 'music.addTrack', name: r.name, hash: r.hash, analysis: r.analysis });
        if (added) {
          if (replaceId && added.id !== replaceId) {
            if ((musicPlayer.playing?.trackId ?? musicPlayer.paused?.trackId) === replaceId) musicPlayer.stop();
            await act({ type: 'music.removeTrack', id: replaceId });
          }
          setTrackId(added.id);
          setSelected(0);
          setView('track');
        }
      } else {
        const known = tracks.find((tk) => tk.hash === r.hash);
        if (known) select(known.id);
        useStore.getState().toast({ kind: 'info', title: t('music.known'), detail: t('music.knownDetail') });
      }
    } catch (err) {
      useStore.getState().toast({ kind: 'error', title: t('music.importError'), detail: err instanceof Error ? err.message : String(err) });
    } finally {
      setProgress(null);
    }
  };
  const remove = async (id = track?.id) => {
    if (!id) return;
    const target = tracks.find((tk) => tk.id === id);
    const ok = await confirmAction({
      title: t('music.remove.confirmTitle'),
      message: t('music.remove.confirmMessage', { name: target?.name ?? '' }),
      confirmLabel: t('music.remove.confirmLabel'),
      danger: true,
    });
    if (!ok) return;
    if ((musicPlayer.playing?.trackId ?? musicPlayer.paused?.trackId) === id) musicPlayer.stop();
    void act({ type: 'music.removeTrack', id });
  };
  const generate = async (nextVariant: boolean) => {
    if (!track || !(await confirmOverwrite(track.id))) return;
    setBusy(true);
    useStore.setState({ progress: null });
    setGenerating(true);
    const r = await act({ type: 'music.generate', trackId: track.id, intent, nextVariant, mood });
    setGenerating(false);
    setBusy(false);
    if (r && intent.trim()) setHistory(remember(intent.trim()));
    if (r) {
      setNotices(r.notices);
      setView('show');
    }
  };
  const requestSuggestions = async (id: string) => {
    setSuggesting(true);
    const r = await act({ type: 'music.suggestIntents', trackId: id });
    setSuggesting(false);
    if (r) {
      // AI unavailable: keep the local suggestions on screen (the notices say why).
      if (r.provider === 'openrouter') setAiSuggestions({ trackId: id, items: r.suggestions });
      setNotices(r.notices);
    }
  };
  // Automatic suggestions when the setting is on: fetched as soon as a track is imported or opened (Morceau screen),
  // so they are ready on « Intention ».
  useEffect(() => {
    if (!track) return;
    let cancelled = false;
    void act({ type: 'settings.get' }).then((s) => {
      if (!cancelled && s?.ai.autoSuggestIntents && s.ai.provider === 'openrouter') void requestSuggestions(track.id);
    });
    return () => { cancelled = true; };
  }, [track?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- runs once per track, not on every render
  // Cue granularity of the compiled show (a setting, applied at the next generation).
  const [phraseBars, setPhraseBars] = useState(8);
  useEffect(() => { void act({ type: 'settings.get' }).then((s) => { if (s) setPhraseBars(s.ai.phraseBars); }); }, []);
  const savePhraseBars = async (n: number) => {
    const s = await act({ type: 'settings.get' });
    if (!s) return;
    setPhraseBars(n);
    await act({ type: 'settings.update', settings: { ...s, ai: { ...s.ai, phraseBars: n } } });
  };
  const restore = async () => {
    if (!track || !(await confirmOverwrite(track.id))) return;
    setBusy(true);
    const r = await act({ type: 'music.restorePrevious', trackId: track.id });
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
  const addMusicEvent = async (time: number) => {
    if (!track || busy || !(await confirmOverwrite(track.id))) return;
    setBusy(true);
    try { await act({ type: 'music.addEvent', trackId: track.id, event: { t: time, duration: 0, kind: 'impact' } }); }
    catch (err) { useStore.getState().toast({ kind: 'error', title: t('music.edit.timingError'), detail: (err as Error).message }); }
    finally { setBusy(false); }
  };
  const updateMusicEvent = async (index: number, patch: { t?: number; duration?: number; kind?: 'impact' | 'riser' | 'silence' | 'vocal' }) => {
    if (!track || busy || !(await confirmOverwrite(track.id))) return;
    setBusy(true);
    try { await act({ type: 'music.updateEvent', trackId: track.id, index, patch }); }
    catch (err) { useStore.getState().toast({ kind: 'error', title: t('music.edit.timingError'), detail: (err as Error).message }); }
    finally { setBusy(false); }
  };
  const undoMusicEdit = async () => {
    const result = await act({ type: 'project.undo' });
    if (result?.label) useStore.getState().toast({ kind: 'success', title: t('music.studio.undo'), detail: result.label });
  };
  const redoMusicEdit = async () => {
    const result = await act({ type: 'project.redo' });
    if (result?.label) useStore.getState().toast({ kind: 'success', title: t('music.studio.redo'), detail: result.label });
  };
  const removeMusicEvent = async (index: number) => {
    if (!track || busy || !(await confirmOverwrite(track.id))) return;
    setBusy(true);
    try { await act({ type: 'music.removeEvent', trackId: track.id, index }); }
    catch (err) { useStore.getState().toast({ kind: 'error', title: t('music.edit.timingError'), detail: (err as Error).message }); }
    finally { setBusy(false); }
  };
  const moveSectionBoundary = async (index: number, time: number) => {
    if (!track || busy) return;
    if (!(await confirmOverwrite(track.id))) return;
    setBusy(true);
    try {
      const result = await act({ type: 'music.moveSectionBoundary', trackId: track.id, index, time });
      if (result?.notices.length) setNotices(result.notices);
      setSelected(index);
    } catch (err) {
      useStore.getState().toast({ kind: 'error', title: t('music.edit.timingError'), detail: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const openTimeline = () => useStore.getState().setPage('timeline');
  const pick = (s: ShowStep) => (track ? setView(s) : s === 'track' && file.current?.click());
  const shown: ShowStep = track ? view : 'track';
  const studio = track && (
    <SongStudioTimeline track={track} selected={selected} onSelect={setSelected} onOpenEditor={setEditing} onMoveBoundary={(index, time) => void moveSectionBoundary(index, time)} onAddEvent={(time) => void addMusicEvent(time)} onRemoveEvent={(index) => void removeMusicEvent(index)} onUpdateEvent={(index, patch) => void updateMusicEvent(index, patch)} onUndo={() => void undoMusicEdit()} onRedo={() => void redoMusicEdit()} pos={isPlaying ? pos : null} playing={isPlaying} />
  );

  return (
    <div className="page">
      <PageHead title={t('music.page.title')} subtitle={t('music.page.subtitle')} />
      <input ref={file} type="file" accept={AUDIO_ACCEPT} style={{ display: 'none' }} data-testid="music-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
      <input ref={replaceFile} type="file" accept={AUDIO_ACCEPT} style={{ display: 'none' }} data-testid="music-replace-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f && track) void importFile(f, track.id); }} />
      {generating && <GeneratingModal />}
      <div className="music-workspace-toolbar">
        <div className="music-workspace-track">
          <span className="music-workspace-icon"><Music2 size={16} /></span>
          <span className="col" style={{ minWidth: 0, gap: 2 }}>
            <b className="truncate">{track?.name ?? t('music.page.title')}</b>
            <span className="small dim">{track ? t('music.library.meta', { bpm: Math.round(track.analysis.bpm), duration: fmt(track.analysis.duration) }) : t('music.emptyHint')}</span>
          </span>
        </div>
        <button type="button" className="btn ghost sm music-library-toggle" onClick={() => setLibraryCollapsed((v) => !v)} aria-expanded={!libraryCollapsed} aria-controls="music-library-panel" data-testid="music-library-toggle">
          {libraryCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          {t(libraryCollapsed ? 'music.library.show' : 'music.library.hide')}
        </button>
      </div>
      <div className={`music-layout ${libraryCollapsed ? 'library-collapsed' : ''}`}>
        {!libraryCollapsed && <div id="music-library-panel"><TrackLibrary tracks={tracks} selectedId={track?.id ?? null} playingId={playingId} importing={!!progress} onSelect={select} onImport={() => file.current?.click()} onRemove={remove} /></div>}
        <div className="music-main col gap-lg">
          <ShowStepper current={shown} progress={progressStep} onPick={pick} />
          {progress && (
            <Panel title={`${progress.step}…`}>
              <div className="meter" data-testid="music-progress"><div style={{ width: `${Math.round(progress.p * 100)}%` }} /></div>
            </Panel>
          )}
          {!track ? (
            <Empty icon={<Music2 size={32} />} title={t('music.empty')} action={<button className="btn primary" disabled={!!progress} onClick={() => file.current?.click()}><Upload size={14} />{t('music.import')}</button>}>{t('music.emptyHint')}</Empty>
          ) : (
            <>
              <Transport track={track} playing={isPlaying} pos={pos} onPlay={(from) => play(track, from)} />
              {notices.map((n, i) => <div key={i} className="small music-notice">{n}</div>)}
              {shown === 'track' && <TrackStep track={track} studio={studio} replacing={!!progress} onReplace={() => replaceFile.current?.click()} onRemove={remove} onNext={() => setView('intent')} />}
              {shown === 'intent' && (
                <IntentStep track={track} intent={intent} onIntent={setIntent} mood={mood} onMood={setMood} history={history} suggestions={suggestions} fromAi={!!fromAi} aiOn={aiOn}
                  suggesting={suggesting} onSuggestAi={() => void requestSuggestions(track.id)} busy={busy} phraseBars={phraseBars} onPhraseBars={(n) => void savePhraseBars(n)}
                  onGenerate={() => void generate(false)} onBack={() => setView('track')} />
              )}
              {shown === 'show' && (
                <ShowScreen track={track} studio={studio} groups={groups} markers={markers} selected={selected} nowIdx={nowIdx} busy={busy}
                  onSelect={setSelected} onEdit={setEditing} onVariant={() => void generate(true)} onRestore={() => void restore()} onCompare={() => setComparingAB(true)}
                  onOpenTimeline={openTimeline} onBack={() => setView('intent')} onNext={() => { setView('play'); if (!isPlaying) play(track); }} />
              )}
              {shown === 'play' && <PlayStep track={track} pos={isPlaying ? pos : null} studio={studio} onPlay={(from) => play(track, from)} onOpenTimeline={openTimeline} onBack={() => setView('show')} />}
            </>
          )}
        </div>
      </div>
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
