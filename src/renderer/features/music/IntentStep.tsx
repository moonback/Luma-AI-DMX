import { ArrowLeft, Sparkles, Wand2 } from 'lucide-react';
import type { Mood, MusicTrack } from '../../../core/model/schemas';
import { Panel } from '../../components/ui';
import { useT } from '../../i18n';

// Kept in French whatever the UI language: the local rules (parseIntent) only read French.
export const NO_MOOD: Mood = { energy: 0, colors: 0, movement: 0, strobe: 0 };
const MOOD_KEYS = ['energy', 'colors', 'movement', 'strobe'] as const;
const INTENT_PRESETS = [
  ['dark', 'ambiance calme, couleurs froides'],
  ['edm', 'explosion sur les drops, strobe, lumières sur les basses, couleurs qui suivent la musique'],
  ['rock', 'couplets sobres, refrains explosifs, couleurs chaudes'],
  ['wedding', 'ambiance douce et chaleureuse, pas de strobe, sans fumée'],
  ['minimal', 'sobre, sans mouvement, pas de strobe'],
] as const;

const HISTORY_KEY = 'luma.intentHistory';
export function loadHistory(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}
/** Most recent first, no duplicates, 8 kept (per machine, all projects). */
export function remember(intent: string): string[] {
  const list = [intent, ...loadHistory().filter((x) => x !== intent)].slice(0, 8);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch { /* storage unavailable: the list stays in memory */ }
  return list;
}

/** Step 2 « Intention »: describe the show (text, suggestions, styles, history, mood), then generate it. */
export function IntentStep(p: {
  track: MusicTrack; intent: string; onIntent: (v: string | ((v: string) => string)) => void; mood: Mood; onMood: (m: Mood) => void;
  history: string[]; suggestions: string[]; fromAi: boolean; aiOn: boolean; suggesting: boolean; onSuggestAi: () => void;
  busy: boolean; phraseBars: number; onPhraseBars: (n: number) => void; onGenerate: () => void; onBack: () => void;
}) {
  const t = useT();
  const append = (text: string) => p.onIntent((v) => (v.trim() ? `${v.trim()}, ${text}` : text).slice(0, 500));
  return (
    <Panel title={t('music.intent')}>
      <div className="col gap-lg">
        <textarea className="input music-intent-area" rows={4} value={p.intent} onChange={(e) => p.onIntent(e.target.value)} placeholder={t('music.intentPlaceholder')} data-testid="music-intent" />
        <div className="music-presets-block">
          {(p.aiOn || p.suggestions.length > 0) && (
            <div className="music-preset-row" data-testid="music-intent-suggestions">
              <span className={`music-preset-label ${p.fromAi ? 'ai' : ''}`}>{p.fromAi && <Sparkles size={12} />}{t(p.fromAi ? 'music.suggestions.fromAi' : 'music.suggestions')}</span>
              <div className="chips">
                {p.suggestions.map((text) => p.fromAi
                  ? <button key={text} className="chip ai" title={t('music.suggestions.aiChipHint')} onClick={() => append(text)} data-testid="music-ai-suggestion"><Sparkles size={11} />{text}</button>
                  : <button key={text} className="chip" title={t('music.suggestions.hint')} onClick={() => append(text)}>{text}</button>)}
                {p.aiOn && (
                  <button className="chip" data-testid="music-intent-suggest-ai" disabled={p.suggesting || p.busy} title={t('music.suggestions.aiHint')} onClick={p.onSuggestAi}>
                    {p.suggesting ? t('music.suggestions.aiBusy') : t('music.suggestions.ai')}
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="music-preset-row" data-testid="music-intent-presets">
            <span className="music-preset-label">{t('music.styles')}</span>
            <div className="chips" style={{ flex: 1 }}>
              {INTENT_PRESETS.map(([key, text]) => <button key={key} className="chip" title={text} onClick={() => append(text)}>{t(`music.preset.${key}`)}</button>)}
            </div>
            {p.history.length > 0 && (
              <select className="select" value="" onChange={(e) => e.target.value && p.onIntent(e.target.value)} aria-label={t('music.recentIntents')} data-testid="music-intent-history" style={{ maxWidth: 220 }}>
                <option value="">{t('music.recentIntents')}</option>
                {p.history.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            )}
          </div>
        </div>
        <div className="mood-grid" data-testid="music-mood">
          {MOOD_KEYS.map((k) => (
            <div key={k} className="mood-card">
              <div className="mood-card-head">
                <span className="mood-card-title">{t(`music.mood.${k}`)}</span>
                <b className={`badge ${p.mood[k] ? 'violet' : ''}`}>{p.mood[k] ? t(`music.mood.${k}.${p.mood[k] < 0 ? 'low' : 'high'}`) : t('music.mood.auto')}</b>
              </div>
              <div className="mood-slider-row">
                <span className="dim">{t(`music.mood.${k}.low`)}</span>
                <input type="range" min={-1} max={1} step={1} value={p.mood[k]} onChange={(e) => p.onMood({ ...p.mood, [k]: Number(e.target.value) })} data-testid={`mood-${k}`} />
                <span className="dim">{t(`music.mood.${k}.high`)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="music-step-foot">
          <button className="btn ghost" onClick={p.onBack}><ArrowLeft size={14} />{t('music.steps.track')}</button>
          <div className="row" style={{ gap: 10 }}>
            <label className="row small dim" style={{ gap: 6 }} title={t('music.phraseBars.hint')}>
              {t('music.phraseBars')}
              <select className="select" value={p.phraseBars} onChange={(e) => p.onPhraseBars(Number(e.target.value))} data-testid="music-phrase-bars">
                {/* The current value may come from Paramètres (2–32), outside the usual choices. */}
                {[...new Set([4, 8, 16, p.phraseBars])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button className="btn primary" disabled={p.busy} onClick={p.onGenerate} data-testid="music-generate"><Wand2 size={14} />{t(p.track.plan ? 'music.regenerateShow' : 'music.generateShow')}</button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
