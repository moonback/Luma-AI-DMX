import type { AiProposal } from '../../ai/actions';
import { buildProposal, executeProposal, guardProposalFlashes, liveState, proposeLocally } from '../../ai/director';
import { DEFAULT_OPENROUTER_MODEL, describeRig, listOpenRouterModels, proposeWithOpenRouter, type OpenRouterModel } from '../../ai/providers/openrouter';
import { OPENROUTER_KEY, UserError } from '../shared';
import type { AppService, CommandIn } from '../AppService';

/* AI Director: proposals (local or OpenRouter), revision, application and the model catalogue. */
export async function handleAi(app: AppService, cmd: CommandIn<'ai'>): Promise<unknown> {
  const ok = { ok: true } as const;
  const e = app.engine;
  switch (cmd.type) {
    case 'ai.propose': return aiPropose(app, cmd.prompt);
    case 'ai.revise': {
      const prev = app.proposals.get(cmd.proposalId);
      if (!prev) throw new UserError('Proposition expirée');
      const p = buildProposal({ prompt: prev.prompt, provider: prev.provider, model: prev.model, understanding: `${prev.understanding} (modifiée par l’utilisateur)`, notices: [], rawActions: cmd.actions, ctx: validationCtx(app) });
      guardFlashes(app, p);
      storeProposal(app, p);
      return p;
    }
    case 'ai.apply': {
      const p = app.proposals.get(cmd.proposalId);
      if (!p) throw new UserError('Proposition expirée ou inconnue');
      if (Date.now() - app.lastAiApply < 300) throw new UserError('Applications IA trop rapprochées (protection anti-boucle)');
      app.lastAiApply = Date.now();
      app.proposals.delete(cmd.proposalId); // a proposal is applied at most once
      const report = executeProposal(p, { index: () => app.index, mutate: (fn) => app.mutate(fn), engine: e, maxStrobeHz: app.settings.engine.maxStrobeHz });
      app.logger.info('IA', `Proposition appliquée : ${report.executed.length} action(s) exécutée(s), ${report.skipped.length} ignorée(s)`);
      for (const s of report.skipped) app.logger.warn('IA', `Ignorée — ${s.summary} : ${s.reason}`);
      return report;
    }
    case 'ai.release':
      e.releaseAi();
      for (const fx of e.snapshot().effects) if (fx.owner === 'ai') e.stopEffect(fx.instanceId);
      return ok;
    case 'ai.listModels':
      if (cmd.refresh) app.modelCache = null;
      return openRouterModels(app);
    case 'ai.setKey':
      app.opts.secrets.set(OPENROUTER_KEY, cmd.key);
      app.logger.info('IA', cmd.key ? 'Clé API enregistrée (stockage chiffré du système)' : 'Clé API supprimée');
      return ok;
  }
}

/** OpenRouter catalogue, cached 10 min (public endpoint, no key needed). */
export function openRouterModels(app: AppService): Promise<OpenRouterModel[]> {
  if (!app.modelCache || Date.now() - app.modelCache.at > 600_000) {
    const models = listOpenRouterModels({ timeoutMs: 15_000 });
    app.modelCache = { at: Date.now(), models };
    models.catch(() => { app.modelCache = null; });
  }
  return app.modelCache.models;
}

export function validationCtx(app: AppService) {
  return { index: app.index, allowStrobe: app.settings.ai.allowStrobe, maxStrobeHz: app.settings.engine.maxStrobeHz };
}

export function guardFlashes(app: AppService, p: AiProposal): void {
  if (app.settings.engine.flashGuard === 'off') return;
  const n = guardProposalFlashes(p, app.index, app.engine, app.settings.engine.maxStrobeHz);
  if (n) p.notices.push(`${n} effet(s) refusé(s) par le garde-fou photosensible (Paramètres › Moteur & sécurité).`);
}

export function storeProposal(app: AppService, p: AiProposal): void {
  app.proposals.set(p.id, p);
  while (app.proposals.size > 20) app.proposals.delete(app.proposals.keys().next().value!);
}

export async function aiPropose(app: AppService, prompt: string): Promise<AiProposal> {
  if (app.aiBusy) throw new UserError('Une demande IA est déjà en cours');
  app.aiBusy = true;
  try {
    const ctx = validationCtx(app);
    const ai = app.settings.ai;
    const key = app.opts.secrets.get(OPENROUTER_KEY);
    let proposal: AiProposal;
    if (ai.provider === 'openrouter' && key) {
      try {
        const model = ai.model || DEFAULT_OPENROUTER_MODEL;
        const caps = (await openRouterModels(app).catch(() => [] as OpenRouterModel[])).find((m) => m.id === model);
        const r = await proposeWithOpenRouter(prompt, describeRig(app.index, ai.allowStrobe, app.engine.bpm, liveState(app.index, app.engine)), { apiKey: key, model, effort: ai.effort, timeoutMs: ai.timeoutSec * 1000, capabilities: caps });
        proposal = buildProposal({ prompt, provider: 'openrouter', model: r.model, understanding: r.understanding, notices: r.notices, rawActions: r.actions, ctx });
        app.aiLastError = null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        app.aiLastError = msg;
        app.logger.error('IA', `Fournisseur OpenRouter indisponible : ${msg}`);
        if (!ai.fallbackToLocal) throw new UserError(`Fournisseur IA indisponible : ${msg}`);
        proposal = proposeLocally(prompt, ctx, app.engine);
        proposal.notices.unshift(`Fournisseur OpenRouter indisponible (${msg}) : proposition générée par le mode local déterministe.`);
      }
    } else {
      proposal = proposeLocally(prompt, ctx, app.engine);
      if (ai.provider === 'openrouter') proposal.notices.unshift('Aucune clé API configurée : mode local déterministe utilisé.');
    }
    guardFlashes(app, proposal);
    storeProposal(app, proposal);
    app.mutate((d) => { d.ai.recentPrompts = [prompt.slice(0, 500), ...d.ai.recentPrompts.filter((x) => x !== prompt)].slice(0, 20); });
    return proposal;
  } finally {
    app.aiBusy = false;
  }
}
