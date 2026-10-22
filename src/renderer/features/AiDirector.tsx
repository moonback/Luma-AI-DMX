import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Send, Square, Undo2, Wand2, X } from 'lucide-react';
import { t, useT } from '../i18n';
import { useStore } from '../store';
import { act, call } from '../api';
import { PageHead } from '../components/ui';
import { VoiceButton } from '../components/VoiceButton';
import type { CommandResults } from '../../shared/commands';
import { StageCanvas } from './visualizer/StageCanvas';
import { useConversation } from './ai/conversation';
import { ExchangeView, type OutputMode } from './ai/ExchangeView';

/* Prompts understood by the local interpreter (also a quick tour of what the assistant does). */
const EXAMPLES = [
  'Mets tout en violet.',
  'Tout en violet sauf les lyres.',
  'Mets les pars en rouge et les lyres en bleu.',
  'Baisse l’intensité de 20 % sans changer les couleurs.',
  'Fais monter progressivement l’intensité pendant huit secondes.',
  'Crée un chase sur les quatre lyres.',
  'Synchronise les mouvements avec le BPM actuel.',
  'Crée une ambiance lounge violette et bleue.',
  'Prépare un drop énergique pour le refrain.',
  'Mets le gobo 2 et le prisme sur les lyres.',
  'Ralentis le chase.',
];

function StatusBar() {
  const tr = useT();
  const rt = useStore((s) => s.runtime);
  if (!rt) return null;
  const remote = rt.ai.provider === 'openrouter' && rt.ai.hasKey;
  const real = rt.outputs.filter((o) => o.real && o.enabled && o.armed).length;
  const aiFx = rt.engine.effects.filter((e) => e.owner === 'ai').length;
  const layerOn = rt.engine.aiActive || aiFx > 0;
  return (
    <div className="ai-status" role="status">
      <span className="ai-stat" title={remote ? tr('ai.provider.remoteHint') : tr('ai.provider.localHint')}>
        <span className={`led ${rt.ai.lastError ? 'warn' : 'ok'}`} />
        <span className="k">{tr('ai.status.provider')}</span>
        {remote ? tr('ai.provider.remote', { model: rt.ai.model }) : rt.ai.provider === 'openrouter' ? tr('ai.provider.noKey') : tr('ai.provider.local')}
      </span>
      {rt.ai.lastError && <span className="ai-stat warn small" title={rt.ai.lastError}>{tr('ai.provider.error', { error: rt.ai.lastError.slice(0, 80) })}</span>}
      <span className="ai-stat">
        <span className={`led ${!rt.engine.running ? 'err' : rt.engine.blackout ? 'warn' : 'ok'}`} />
        <span className="k">{tr('ai.status.engine')}</span>
        {!rt.engine.running ? tr('ai.engine.stopped') : rt.engine.blackout ? tr('ai.engine.blackout') : tr('ai.engine.running')}
        {rt.engine.master < 1 && ` · ${tr('ai.engine.master', { pct: Math.round(rt.engine.master * 100) })}`}
      </span>
      <span className="ai-stat" title={!rt.transmitting ? undefined : real ? tr('ai.output.realHint') : tr('ai.output.simulationHint')}>
        <span className={`led ${!rt.transmitting ? 'warn' : real ? 'ok' : ''}`} />
        <span className="k">{tr('ai.status.output')}</span>
        {!rt.transmitting ? tr('ai.output.stopped') : real ? tr('ai.output.real', { n: real }) : tr('ai.output.simulation')}
      </span>
      <span className="ai-stat">
        <span className={`led ${layerOn ? 'ok' : ''}`} />
        <span className="k">{tr('ai.status.layer')}</span>
        {layerOn ? tr('ai.layer.active', { n: aiFx }) : tr('ai.layer.idle')}
      </span>
    </div>
  );
}

export function AiDirector() {
  const tr = useT();
  const rt = useStore((s) => s.runtime);
  const preview = useStore((s) => s.preview);
  const { exchanges, add, patch, clear } = useConversation();
  const [prompt, setPrompt] = useState('');
  const [autoApply, setAutoApply] = useState(false);
  const [usage, setUsage] = useState<CommandResults['ai.usage'] | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const busy = rt?.ai.busy ?? false;
  const real = rt?.outputs.filter((o) => o.real && o.enabled && o.armed).length ?? 0;
  const stopped = !!rt && !rt.transmitting;
  // Stable props: the runtime arrives at 10 Hz and must not re-render every exchange of the conversation.
  const output = useMemo<OutputMode>(() => (stopped ? { kind: 'stopped' } : real ? { kind: 'real', count: real } : { kind: 'simulation' }), [stopped, real]);
  const previewing = preview && exchanges.some((x) => x.proposal?.id === preview.label) ? preview : null;
  const last = exchanges.at(-1);

  useEffect(() => { void act({ type: 'settings.get' }).then((s) => setAutoApply(!!s?.assistant.autoApply)); }, []);
  useEffect(() => { void act({ type: 'ai.usage' }).then((u) => setUsage(u ?? null)); }, [exchanges.length]);
  // Newest exchange in view (instant scroll: no motion to opt out of).
  useEffect(() => { log.current?.scrollTo?.({ top: log.current.scrollHeight }); }, [exchanges.length, last?.proposal, last?.report]);

  const send = async (text = prompt) => {
    const q = text.trim();
    if (!q || busy) return;
    setPrompt('');
    // While the conversation shown is not cleared, the assistant sees the previous exchanges.
    const continueThread = exchanges.length > 0;
    const id = add(q);
    try {
      const proposal = await call({ type: 'ai.propose', prompt: q, continueThread });
      patch(id, { proposal, report: proposal.autoApplied });
      if (proposal.autoApplied) useStore.getState().toast({ kind: proposal.autoApplied.skipped.length ? 'warn' : 'success', title: t('ai.autoApplied', { n: proposal.autoApplied.executed.length }) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      patch(id, /annulée|cancel/i.test(msg) ? { cancelled: true, error: msg } : { error: msg });
    }
  };
  const sendRef = useRef(send);
  sendRef.current = send;
  const retry = useCallback((q: string) => void sendRef.current(q), []);
  const reformulate = useCallback((q: string) => { setPrompt(q); input.current?.focus(); }, []);
  const reset = () => { clear(); useStore.getState().setPreview(null); void act({ type: 'ai.resetThread' }); };

  return (
    <div className="page ai-page">
      <PageHead title={tr('ai.title')} subtitle={tr('ai.subtitle')}>
        <VoiceButton />
        {usage && usage.month.calls > 0 && <span className="small dim" data-testid="ai-usage">{tr('ai.usageLine', { calls: usage.month.calls, tokens: usage.month.promptTokens + usage.month.completionTokens, cost: usage.month.cost.toFixed(2), budget: usage.budget === null ? '—' : `${usage.budget} $` })}</span>}
        <button className="btn" onClick={() => void act({ type: 'ai.release' })} disabled={!rt?.engine.aiActive && !rt?.engine.effects.some((e) => e.owner === 'ai')} title={tr('ai.releaseHint')}><RotateCcw size={14} />{tr('ai.release')}</button>
        <button className="btn" data-testid="ai-undo" onClick={() => void act({ type: 'ai.undoApply' })} title={tr('ai.undoHint')}><Undo2 size={14} />{tr('ai.undo')}</button>
      </PageHead>
      <StatusBar />
      <div className="ai-layout">
        <section className="ai-chat panel" aria-label={tr('ai.conversation')}>
          <div className="ai-log" ref={log} role="log" aria-live="polite">
            {exchanges.length === 0 && (
              <div className="ai-empty">
                <h3>{tr('ai.examples')}</h3>
                <div className="chips">{EXAMPLES.map((e) => <button key={e} className="chip" onClick={() => void send(e)} disabled={busy}><Wand2 size={11} /> {e}</button>)}</div>
                <p className="small muted">{tr('ai.examplesHint')}</p>
              </div>
            )}
            {exchanges.map((ex) => <ExchangeView key={ex.id} ex={ex} output={output} onRetry={retry} onReformulate={reformulate} />)}
          </div>
          <form className="ai-composer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <div className="row">
              <input ref={input} className="input" data-testid="ai-prompt" placeholder={tr('ai.placeholder')} aria-label={tr('ai.placeholder')} value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={busy} maxLength={2000} />
              <button type="submit" className="btn primary lg" data-testid="ai-send" disabled={busy || !prompt.trim()}><Send size={15} />{busy ? tr('ai.analysing') : tr('ai.send')}</button>
              {busy && <button type="button" className="btn lg" data-testid="ai-cancel" onClick={() => void act({ type: 'ai.cancel' })}><Square size={14} />{tr('ai.cancel')}</button>}
              {exchanges.length > 0 && <button type="button" className="btn ghost lg icon" title={tr('ai.clear')} aria-label={tr('ai.clear')} onClick={reset} disabled={busy}><X size={15} /></button>}
            </div>
            <div className="small dim">{autoApply ? tr('ai.composerHintAuto') : tr('ai.composerHint')}{exchanges.length > 0 && ` · ${tr('ai.contextHint')}`}</div>
          </form>
        </section>
        <aside className="ai-stage panel">
          <div className="row ai-stage-head">
            <b>{previewing ? tr('ai.stagePreview') : tr('ai.stage')}</b>
            <span className={`badge ${previewing ? 'violet' : 'cyan'}`}>{previewing ? tr('ai.stagePreviewBadge') : tr('ai.stageLiveBadge')}</span>
          </div>
          <div className="ai-stage-canvas"><StageCanvas compact {...(previewing ? { values: previewing.values } : {})} /></div>
          <p className="small dim">{previewing ? tr('ai.stagePreviewHint') : tr('ai.stageLiveHint')}</p>
        </aside>
      </div>
    </div>
  );
}
