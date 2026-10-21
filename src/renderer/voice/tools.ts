import { Behavior, Type, type FunctionDeclaration } from '@google/genai';
import { act } from '../api';
import { t } from '../i18n';
import { useStore } from '../store';
import type { AiProposal } from '../../core/ai/actions';

const LOG = '[Voice:Tools]';

/**
 * What the voice model may do: the same typed, validated pipeline as the AI Director page (propose → apply → undo).
 * It never produces DMX or actions itself; the engine validates everything against the patch.
 */
export const SYSTEM_PROMPT = `Tu es l'assistant vocal d'une console d'éclairage DMX. Réponds en français, en une ou deux phrases courtes.
Pour toute demande d'éclairage (ambiance, couleur, intensité, effet, scène…), appelle propose_lighting avec la demande de l'utilisateur, mot pour mot.
Lis ensuite à voix haute le résumé de la proposition (compréhension, actions, avertissements) et demande « J'applique ? ».
N'appelle apply_proposal qu'après un accord explicite (« oui », « vas-y », « applique »). Sans accord clair ou si l'utilisateur change d'avis, n'applique rien.
Pour revenir en arrière (« annule »), appelle undo_last. N'invente jamais d'action : tout passe par ces outils.`;

const request = { type: Type.OBJECT, properties: { request: { type: Type.STRING, description: `La demande de l'utilisateur, telle qu'il l'a dite.` } }, required: ['request'] };

export const TOOLS = [{
  functionDeclarations: [
    // Non-blocking: the model keeps talking while the (remote) planner works, then the summary interrupts.
    { name: 'propose_lighting', behavior: Behavior.NON_BLOCKING, description: `Prépare une proposition d'actions d'éclairage à partir de la demande. N'applique rien.`, parameters: request },
    { name: 'apply_proposal', description: `Applique la dernière proposition, UNIQUEMENT après l'accord explicite de l'utilisateur.` },
    { name: 'undo_last', description: `Annule la dernière application et rend la main.` },
  ] satisfies FunctionDeclaration[],
}];

export function summarize(p: AiProposal) {
  return {
    understanding: p.understanding,
    notices: p.notices,
    actions: p.actions.map((a) => ({ summary: a.summary, status: a.status, problems: a.messages })),
    appliable: p.actions.filter((a) => a.status !== 'rejected').length,
  };
}

/** Executes one tool call; keeps the last proposal so « oui » applies exactly what was read out. */
export function createToolRunner(): (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>> {
  let last: AiProposal | null = null;
  let turns = 0;
  const fail = (error: string) => {
    console.error(LOG, '✖ tool fail —', error);
    return { error };
  };

  return async (name, args) => {
    console.log(LOG, `▶ run("${name}") — args:`, JSON.stringify(args));

    switch (name) {
      case 'propose_lighting': {
        const text = typeof args.request === 'string' ? args.request.trim().slice(0, 2000) : '';
        if (!text) return fail('Demande vide');

        console.log(LOG, `propose_lighting — dispatching ai.propose | turn #${turns} | prompt: "${text}"`);
        const p = await act({ type: 'ai.propose', prompt: text, continueThread: turns++ > 0 });

        if (!p) {
          console.error(LOG, 'propose_lighting — ai.propose returned null/undefined');
          return fail('Proposition impossible (voir le message affiché)');
        }

        last = p;
        const summary = summarize(p);
        console.log(LOG, 'propose_lighting — success | appliable actions:', summary.appliable, '| summary:', JSON.stringify(summary));
        return summary;
      }

      case 'apply_proposal': {
        if (!last) return fail('Aucune proposition en attente');
        if (!last.actions.some((a) => a.status !== 'rejected')) return fail('Aucune action applicable dans cette proposition');

        console.log(LOG, 'apply_proposal — dispatching ai.apply | proposalId:', last.id);
        const report = await act({ type: 'ai.apply', proposalId: last.id });

        if (!report) {
          console.error(LOG, 'apply_proposal — ai.apply returned null/undefined');
          return fail('Application impossible (voir le message affiché)');
        }

        last = null;
        console.log(LOG, 'apply_proposal — success | executed:', report.executed.length, '| skipped:', report.skipped.length);
        useStore.getState().toast({ kind: report.skipped.length ? 'warn' : 'success', title: t('voice.applied', { n: report.executed.length }), detail: report.skipped.length ? t('voice.skipped', { n: report.skipped.length }) : undefined });
        return { executed: report.executed.map((e) => e.summary), skipped: report.skipped.map((s) => `${s.summary} : ${s.reason}`) };
      }

      case 'undo_last': {
        console.log(LOG, 'undo_last — dispatching ai.undoApply');
        const ok = await act({ type: 'ai.undoApply' });
        if (ok) {
          console.log(LOG, 'undo_last — success');
          return { ok: true };
        }
        return fail('Rien à annuler');
      }

      default:
        return fail(`Outil inconnu : ${name}`);
    }
  };
}
