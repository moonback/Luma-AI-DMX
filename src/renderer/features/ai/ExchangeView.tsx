import { memo, useRef } from 'react';
import { Bot, Check, Eye, Loader2, PencilLine, RotateCw, Undo2, X } from 'lucide-react';
import { useT } from '../../i18n';
import { useStore } from '../../store';
import { act, call } from '../../api';
import { useResolved } from '../../components/ui';
import { actionFamilies, keptFamilies, type ParamFamily } from '../../../core/ai/plan';
import type { AiAction } from '../../../core/ai/actions';
import { ActionCard } from './ActionCard';
import { exchangeState, runnableIndexes, useConversation, type Exchange, type ExchangeState } from './conversation';

/** Where the computed state goes: nowhere real, to armed real outputs, or nowhere (transmission stopped). */
export type OutputMode = { kind: 'simulation' } | { kind: 'real'; count: number } | { kind: 'stopped' };

const STATE_BADGE: Record<ExchangeState, string> = {
  analysing: 'cyan', applying: 'cyan', awaiting: 'violet', question: 'cyan', nothing: 'warn', success: 'ok', partial: 'warn', failed: 'err', error: 'err', cancelled: '',
};

function StateChip({ state }: { state: ExchangeState }) {
  const t = useT();
  const busy = state === 'analysing' || state === 'applying';
  return <span className={`badge ${STATE_BADGE[state]}`} data-testid="ai-state" data-state={state}>{busy && <Loader2 size={11} className="ai-spin" aria-hidden />}{t(`ai.state.${state}`)}</span>;
}

/** What the runnable part of the plan changes live and what it leaves untouched. */
function PlanSummary({ actions, fixtureIds }: { actions: AiAction[]; fixtureIds: string[] }) {
  const t = useT();
  const { byId } = useResolved();
  const fam = (f: ParamFamily) => t(`ai.family.${f}`);
  const changed = actions.map(actionFamilies);
  const whole = changed.some((f) => f === null);
  const live = [...new Set(changed.flatMap((f) => f ?? []))];
  const names = fixtureIds.map((id) => byId.get(id)?.fixture.name ?? id);
  return (
    <dl className="ai-summary small">
      <dt>{t('ai.targets')}</dt>
      <dd>{names.length ? `${t('ai.fixturesCount', { n: names.length })} — ${names.slice(0, 8).join(', ')}${names.length > 8 ? '…' : ''}` : '—'}</dd>
      <dt>{t('ai.changes')}</dt>
      <dd>{whole ? t('ai.wholeLook') : live.length ? live.map(fam).join(', ') : t('ai.noLiveChange')}</dd>
      <dt>{t('ai.keeps')}</dt>
      <dd>{whole ? '—' : keptFamilies(actions).map(fam).join(', ') || '—'}</dd>
    </dl>
  );
}

function Report({ ex, output }: { ex: Exchange; output: OutputMode }) {
  const t = useT();
  const r = ex.report!;
  const created = [...r.created.scenes.map((name) => t('ai.createdScene', { name })), ...r.created.cueLists.map((name) => t('ai.createdList', { name }))];
  return (
    <div className="ai-report small" data-testid="ai-report">
      <b>{t('ai.report')}</b>
      <ul className="ai-result">
        {r.executed.map((e) => <li key={e.index} className="ok">✓ {e.summary} — {e.detail}</li>)}
        {r.skipped.map((e) => <li key={e.index} className="err">✗ {e.summary} — {e.reason}</li>)}
      </ul>
      {r.verification.checked > 0 && (
        <div className="muted">
          {t('ai.verified', { matched: r.verification.matched, checked: r.verification.checked })}
          {r.verification.overriddenByManual > 0 && ` · ${t('ai.overridden', { n: r.verification.overriddenByManual })}`}
          {r.verification.mismatches.length > 0 && ` · ${t('ai.mismatches', { list: r.verification.mismatches.slice(0, 3).join(' ; ') })}`}
        </div>
      )}
      {r.verification.checked > 0 && <div className="dim">{output.kind === 'real' ? t('ai.sentReal', { n: output.count }) : output.kind === 'stopped' ? t('ai.sentStopped') : t('ai.sentSim')}</div>}
      {created.length > 0 && <div className="muted">{t('ai.created', { list: created.join(', ') })}</div>}
    </div>
  );
}

/** One request and its answer; memoized: an exchange only changes when its own entry in the conversation does. */
export const ExchangeView = memo(function ExchangeView({ ex, output, onRetry, onReformulate }: { ex: Exchange; output: OutputMode; onRetry: (prompt: string) => void; onReformulate: (prompt: string) => void }) {
  const t = useT();
  const patch = useConversation((s) => s.patch);
  const inFlight = useRef(false);
  const preview = useStore((s) => s.preview);
  const setPreview = useStore((s) => s.setPreview);
  const state = exchangeState(ex);
  const p = ex.proposal;
  const runnable = runnableIndexes(ex);
  const showingPreview = !!p && preview?.label === p.id;
  const closed = !!ex.report || !!ex.applyError || !!ex.cancelled;

  const revise = async (actions: unknown[]) => {
    if (!p) return;
    const np = await act({ type: 'ai.revise', proposalId: p.id, actions });
    if (np) patch(ex.id, { proposal: np, excluded: [] });
  };
  const apply = async () => {
    // One application per proposal: a ref, because a double click lands before the re-render shows `applying`.
    if (!p || inFlight.current) return;
    inFlight.current = true;
    patch(ex.id, { applying: true });
    try {
      const target = ex.excluded.length ? await call({ type: 'ai.revise', proposalId: p.id, actions: p.actions.filter((_, i) => !ex.excluded.includes(i)).map((a) => a.action ?? a.raw) }) : p;
      const report = await call({ type: 'ai.apply', proposalId: target.id });
      if (showingPreview) setPreview(null);
      patch(ex.id, { proposal: target, report, applying: false });
    } catch (err) {
      patch(ex.id, { applying: false, applyError: err instanceof Error ? err.message : String(err) });
    }
  };
  const dismiss = () => {
    if (showingPreview) setPreview(null);
    patch(ex.id, { cancelled: true });
  };
  const toggle = (i: number) => patch(ex.id, { excluded: ex.excluded.includes(i) ? ex.excluded.filter((x) => x !== i) : [...ex.excluded, i] });

  const timings = p?.timings && [t('ai.timings', { u: Math.round(p.timings.understandMs), v: Math.round(p.timings.validateMs) }), ...(ex.report?.executeMs !== undefined ? [t('ai.timingsExec', { e: Math.round(ex.report.executeMs) })] : [])].join(' · ');
  const runnableActions = runnable.map((i) => p!.actions[i]!.action!).filter(Boolean);
  return (
    <article className={`ai-exchange state-${state}`}>
      <div className="bubble user">{ex.prompt}</div>
      <div className="bubble ai-answer col" {...(p ? { 'data-testid': 'proposal' } : {})}>
        <div className="row ai-answer-head">
          <Bot size={16} aria-hidden />
          {p && (p.provider === 'local' ? <span className="badge cyan" title={t('ai.provider.localHint')}>{t('ai.provider.local')}</span> : <span className="badge violet">{t('ai.provider.remote', { model: p.model ?? '' })}</span>)}
          <StateChip state={state} />
          <span className="grow" />
          {timings && <span className="small dim" title={timings}>{timings}</span>}
          <span className="small dim">{new Date(ex.at).toLocaleTimeString()}</span>
        </div>

        {state === 'analysing' && <div className="muted ai-pending">{t('ai.analysing')}</div>}
        {ex.error && !ex.cancelled && <div className="ai-error" role="alert">{ex.error}</div>}

        {p && (
          <>
            <div><span className="ai-label">{t('ai.understanding')}</span> {p.understanding}</div>
            {p.question && <div className="ai-question" data-testid="ai-question"><b>{t('ai.question')}</b> {p.question}</div>}
            {runnableActions.length > 0 && <PlanSummary actions={runnableActions} fixtureIds={[...new Set(runnable.flatMap((i) => p.actions[i]!.fixtureIds))]} />}
            {p.relative && !closed && <div className="small dim">{t('ai.relative')}</div>}
            {p.notices.length > 0 && <ul className="ai-messages small warn">{p.notices.map((n, i) => <li key={i}>{n}</li>)}</ul>}
            {p.offer === 'undo' && !closed && <div className="row"><button className="btn" onClick={() => void act({ type: 'ai.undoApply' })} title={t('ai.undoHint')}><Undo2 size={14} />{t('ai.offerUndo')}</button></div>}
            {p.actions.length > 0 && (
              <section aria-label={t('ai.plan')}>
                <ol className="ai-plan">
                  {p.actions.map((v, i) => <ActionCard key={`${p.id}-${i}`} v={v} excluded={ex.excluded.includes(i)} locked={closed || !!ex.applying} onToggle={() => toggle(i)} onEdit={(raw) => void revise(p.actions.map((a, k) => (k === i ? raw : a.action ?? a.raw)))} />)}
                </ol>
              </section>
            )}
          </>
        )}

        {ex.applyError && <div className="ai-error" role="alert">{t('ai.applyError', { error: ex.applyError })}</div>}
        {ex.report && <Report ex={ex} output={output} />}

        <div className="row ai-actions">
          {p && !closed && p.actions.length > 0 && (
            <>
              <button className="btn" disabled={!Object.keys(p.preview).length || !!ex.applying} onClick={() => setPreview(showingPreview ? null : { label: p.id, values: p.preview })} title={t('ai.previewHint')} aria-pressed={showingPreview}><Eye size={14} />{showingPreview ? t('ai.hidePreview') : t('ai.preview')}</button>
              <button className="btn primary" data-testid="ai-apply" disabled={!runnable.length || !!ex.applying} onClick={() => void apply()}><Check size={14} />{t('ai.apply', { n: runnable.length })}</button>
            </>
          )}
          {p && !closed && !ex.applying && <button className="btn ghost" onClick={dismiss} title={t('ai.dismissHint')}><X size={14} />{t('ai.dismiss')}</button>}
          {(state === 'error' || state === 'cancelled' || state === 'failed' || state === 'question' || state === 'nothing') && <button className="btn ghost" onClick={() => onRetry(ex.prompt)} title={t('ai.retryHint')}><RotateCw size={14} />{t('ai.retry')}</button>}
          {state !== 'analysing' && state !== 'applying' && <button className="btn ghost" onClick={() => onReformulate(ex.prompt)} title={t('ai.reformulateHint')}><PencilLine size={14} />{t('ai.reformulate')}</button>}
          {p && !closed && runnable.length > 0 && <span className="small dim">{t('ai.confirmHint')}</span>}
        </div>
      </div>
    </article>
  );
});
