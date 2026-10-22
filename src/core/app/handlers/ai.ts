import type { AiExecutionReport, AiProposal } from '../../ai/actions';
import { buildProposal, executeProposal, guardProposalFlashes, interpreterContext, liveState, proposeLocally } from '../../ai/director';
import { enforceConstraints, expandRelativeIntensity, promptConstraints } from '../../ai/guards';
import { pruneTransientEffects } from '../../ai/transient';
import { ProjectIndex } from '../../engine/resolve';
import type { Project } from '../../model/schemas';
import { DEFAULT_OPENROUTER_MODEL, describeRig, listOpenRouterModels, proposeWithOpenRouter, type OpenRouterModel, type OpenRouterOptions } from '../../ai/providers/openrouter';
import { sceneFromPhotoWithOpenRouter } from '../../ai/sceneFromPhoto';
import { profileFromPhotoWithOpenRouter } from '../../ai/profileFromPhoto';
import { GEMINI_KEY, OPENROUTER_KEY, UserError, VOICE_MODEL } from '../shared';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { voicePrompt } from '../../ai/prompts';
import { AiUsageLedger, type AiUsage } from '../../ai/usage';
import type { AppService, CommandIn } from '../AppService';

/* AI Director: proposals (local or OpenRouter), revision, application and the model catalogue. */
export async function handleAi(app: AppService, cmd: CommandIn<'ai'>): Promise<unknown> {
  const ok = { ok: true } as const;
  const e = app.engine;
  switch (cmd.type) {
    case 'ai.propose': return aiPropose(app, cmd.prompt, cmd.continueThread);
    case 'ai.resetThread':
      threads.delete(app);
      return ok;
    case 'ai.usage': return { ...(await ledgerOf(app).totals()), budget: app.settings.ai.monthlyBudget };
    case 'ai.revise': {
      const prev = app.proposals.get(cmd.proposalId);
      if (!prev) throw new UserError('Proposition expirée');
      const p = buildProposal({ prompt: prev.prompt, provider: prev.provider, model: prev.model, understanding: `${prev.understanding} (modifiée par l’utilisateur)`, notices: [], rawActions: cmd.actions, ctx: validationCtx(app) });
      guardConstraints(app, p);
      guardFlashes(app, p);
      storeProposal(app, p);
      return p;
    }
    case 'ai.apply': return applyProposal(app, cmd.proposalId);
    case 'ai.release':
      e.releaseAi();
      for (const fx of e.snapshot().effects) if (fx.owner === 'ai') e.stopEffect(fx.instanceId);
      pruneAiEffects(app);
      return ok;
    case 'ai.cancel':
      if (app.aiAbort) {
        app.aiAbort.abort();
        app.logger.info('IA', 'Demande IA annulée par l’utilisateur');
      }
      return ok;
    case 'ai.undoApply': {
      const u = app.lastAiUndo;
      if (!u) throw new UserError('Aucune application IA à annuler');
      if (app.revision !== u.revision) throw new UserError('Le projet a été modifié depuis l’application IA : annulation impossible');
      for (const fx of e.snapshot().effects) if (fx.owner === 'ai') e.stopEffect(fx.instanceId);
      e.releaseAi();
      app.mutate((d) => { Object.assign(d, structuredClone(u.project)); });
      e.bpm = u.project.show.bpm;
      app.lastAiUndo = null;
      app.logger.info('IA', 'Dernière application IA annulée');
      return ok;
    }
    case 'ai.listModels':
      if (cmd.refresh) app.modelCache = null;
      return openRouterModels(app);
    case 'ai.sceneFromPhoto': return sceneFromPhoto(app, cmd.image);
    case 'ai.profileFromPhoto': return profileFromPhoto(app, cmd.images);
    case 'ai.setKey':
      app.opts.secrets.set(OPENROUTER_KEY, cmd.key);
      app.logger.info('IA', cmd.key ? 'Clé API enregistrée (stockage chiffré du système)' : 'Clé API supprimée');
      return ok;
    case 'ai.voiceKey':
      app.opts.secrets.set(GEMINI_KEY, cmd.key);
      app.logger.info('IA', cmd.key ? 'Clé Gemini (assistant vocal) enregistrée' : 'Clé Gemini (assistant vocal) supprimée');
      return ok;
    case 'ai.voiceToken': {
      const apiKey = app.opts.secrets.get(GEMINI_KEY);
      if (!apiKey) throw new UserError('Clé Gemini manquante : saisissez-la dans Paramètres › IA');
      const { GoogleGenAI, Modality, Behavior, Type } = await import('@google/genai');
      const now = Date.now();
      // systemInstruction and tools MUST be locked inside liveConnectConstraints so that the
      // constrained WebSocket endpoint enforces them server-side. A constrained token ignores
      // any config sent by the client — if these fields are omitted here, the model will never
      // use the declared tools (it just speaks freely without calling them).
      // The tools must match src/renderer/voice/tools.ts (TOOLS); the instructions come from Paramètres › Assistant (src/core/ai/prompts.ts).
      const token = await new GoogleGenAI({ apiKey }).authTokens.create({
        config: {
          uses: 1,
          expireTime: new Date(now + 30 * 60_000).toISOString(),
          newSessionExpireTime: new Date(now + 60_000).toISOString(),
          liveConnectConstraints: {
            model: VOICE_MODEL,
            config: {
              responseModalities: [Modality.AUDIO],
              systemInstruction: voicePrompt(app.settings.assistant.name, app.settings.assistant.voicePrompt, app.settings.assistant.autoApply),
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: app.settings.assistant.voice } } },
              tools: [{
                functionDeclarations: [
                  {
                    name: 'propose_lighting',
                    behavior: Behavior.NON_BLOCKING,
                    description: `Prépare une proposition d'actions d'éclairage à partir de la demande de l'opérateur. N'applique RIEN. Retourne un résumé lisible (compréhension, actions, avertissements).`,
                    parameters: {
                      type: Type.OBJECT,
                      properties: {
                        request: { type: Type.STRING, description: `La demande de l'opérateur, telle qu'il l'a dite, mot pour mot. Ex: "mets les lyres en rouge", "ambiance disco", "baisse l'intensité à 50%".` },
                      },
                      required: ['request'],
                    },
                  },
                  {
                    name: 'apply_proposal',
                    description: `Applique la dernière proposition générée par propose_lighting. À n'appeler QU'après accord explicite de l'opérateur (« oui », « vas-y », « ok », « go »). Retourne la liste des actions exécutées et celles ignorées.`,
                  },
                  {
                    name: 'undo_last',
                    description: `Annule la dernière application IA et restaure l'état précédent. À appeler si l'opérateur dit « annule », « reviens en arrière », « défais ça ». Attention : ne fonctionne que si rien n'a changé manuellement depuis.`,
                  },
                  {
                    name: 'get_status',
                    description: `Retourne l'état courant du moteur DMX : blackout, BPM (valeur et source), couche IA active, effets IA en cours, cue lists actives et leur état. À utiliser pour répondre à des questions sur l'état du spectacle.`,
                  },
                  {
                    name: 'control_engine',
                    description: `Effectue une action directe et immédiate sur le moteur DMX, sans passer par une proposition. Actions disponibles : blackout on/off, set_bpm, cue_go, cue_back, cue_pause, cue_resume, release_ai (libère uniquement la couche IA), release_all (libère TOUT — demande confirmation avant).`,
                    parameters: {
                      type: Type.OBJECT,
                      properties: {
                        action: { type: Type.STRING, description: `Action à effectuer. Valeurs : "blackout_on" | "blackout_off" | "set_bpm" | "cue_go" | "cue_back" | "cue_pause" | "cue_resume" | "release_ai" | "release_all".` },
                        bpm: { type: Type.NUMBER, description: 'Nouveau BPM (20-300). Requis uniquement pour action="set_bpm".' },
                        cue_list_name: { type: Type.STRING, description: `Nom de la cue list cible. Requis pour cue_go, cue_back, cue_pause, cue_resume. Si omis et qu'une seule cue list est active, elle est utilisée automatiquement.` },
                      },
                      required: ['action'],
                    },
                  },
                ],
              }],
            },
          },
        },
      });
      if (!token.name) throw new UserError('Jeton Gemini non délivré');
      return { token: token.name, model: VOICE_MODEL };
    }
  }
}

/** Executes a stored proposal once (button « Appliquer », voice « vas-y » or automatic application). */
function applyProposal(app: AppService, id: string): AiExecutionReport {
  const p = app.proposals.get(id);
  if (!p) throw new UserError('Proposition expirée ou inconnue');
  // What was previewed must be what is applied: refuse when the rig the actions were resolved against has changed.
  if (p.basis !== rigBasis(app)) throw new UserError('Proposition périmée : le patch, les groupes ou les scènes ont changé depuis l’aperçu. Relancez la demande.');
  if (Date.now() - app.lastAiApply < 300) throw new UserError('Applications IA trop rapprochées (protection anti-boucle)');
  app.lastAiApply = Date.now();
  app.proposals.delete(id); // a proposal is applied at most once
  // All or nothing: every creation goes to one draft, validated and committed once; effects start after the commit.
  const before = app.project;
  let draft: Project | null = null;
  let index = app.index;
  const deferred: (() => void)[] = [];
  const report = executeProposal(p, {
    index: () => index,
    mutate: (fn) => {
      draft ??= structuredClone(app.project);
      fn(draft);
      index = new ProjectIndex(draft, app.userProfiles);
    },
    defer: (fn) => deferred.push(fn),
    engine: app.engine,
    maxStrobeHz: app.settings.engine.maxStrobeHz,
  });
  if (draft) {
    const next: Project = draft;
    try {
      app.mutate((d) => { Object.assign(d, next); });
    } catch (err) {
      app.engine.releaseAi();
      throw err;
    }
  }
  for (const start of deferred) {
    try {
      start();
    } catch (err) {
      app.logger.warn('IA', (err as Error).message);
    }
  }
  app.lastAiUndo = { proposalId: p.id, project: before, revision: app.revision };
  const thread = threads.get(app); // only executed actions are remembered, never skipped or refused ones
  if (thread) thread.last = { basis: rigBasis(app), fixtures: [...new Set(report.executed.flatMap((x) => p.actions[x.index]?.fixtureIds ?? []))].flatMap((id) => app.index.fixtures.get(id)?.fixture.name ?? []) };
  app.logger.info('IA', `Proposition appliquée : ${report.executed.length} action(s) exécutée(s), ${report.skipped.length} ignorée(s)`);
  for (const s of report.skipped) app.logger.warn('IA', `Ignorée — ${s.summary} : ${s.reason}`);
  return report;
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

/** What the request forbids (« sans strobe », « sauf les faces ») is enforced by code on every proposal, local or remote. */
function guardConstraints(app: AppService, p: AiProposal): void {
  const n = enforceConstraints(p, promptConstraints(p.prompt, interpreterContext(app.index, app.engine, app.settings.ai.allowStrobe)), app.index);
  if (n) p.notices.push(`${n} action(s) refusée(s) : elles ne respectaient pas une contrainte de la demande.`);
}

export function guardFlashes(app: AppService, p: AiProposal): void {
  if (app.settings.engine.flashGuard === 'off') return;
  const n = guardProposalFlashes(p, app.index, app.engine, app.settings.engine.maxStrobeHz);
  if (n) p.notices.push(`${n} effet(s) refusé(s) par le garde-fou photosensible (Paramètres › Moteur & sécurité).`);
}

/** Digest of what AI actions resolve against: fixtures (id, profile, mode), groups and scene names. */
export function rigBasis(app: AppService): string {
  const p = app.project;
  const rig = [p.patch.map((f) => [f.id, f.profileId, f.mode]), p.groups.map((g) => [g.id, g.name, g.fixtureIds]), p.scenes.map((s) => s.name)];
  return createHash('sha1').update(JSON.stringify(rig)).digest('hex');
}

const ledgers = new WeakMap<AppService, AiUsageLedger>();
export function ledgerOf(app: AppService): AiUsageLedger {
  let l = ledgers.get(app);
  if (!l) ledgers.set(app, (l = new AiUsageLedger(path.join(app.opts.dataDir, 'ai-usage.json'))));
  return l;
}
export const recordUsage = (app: AppService) => (u: AiUsage): void => { void ledgerOf(app).record(u).catch(() => undefined); };

/** Refuses an OpenRouter call once the monthly budget is spent (the local fallback still answers when enabled). */
export async function guardBudget(app: AppService): Promise<void> {
  const budget = app.settings.ai.monthlyBudget;
  if (budget === null) return;
  const { month } = await ledgerOf(app).totals();
  if (month.cost >= budget) throw new UserError(`Budget IA mensuel atteint (${month.cost.toFixed(2)} $ sur ${budget} $) : modifiable dans Paramètres › IA`);
}

/** Last exchanges of the conversation with the remote model, for follow-up requests (« plutôt l’inverse »). */
const THREAD_TURNS = 3;
const threads = new WeakMap<AppService, { projectId: string; turns: { prompt: string; answer: string }[]; last?: { basis: string; fixtures: string[] } }>();

/** Fixtures the last applied proposal of the thread really acted on (« baisse leur intensité »), while the rig is unchanged. */
const lastTargets = (app: AppService): string[] | undefined => { const last = threads.get(app)?.last; return last?.basis === rigBasis(app) ? last.fixtures : undefined; };

function threadHistory(app: AppService): { role: 'user' | 'assistant'; content: string }[] {
  const t = threads.get(app);
  if (!t || t.projectId !== app.project.id) return [];
  return t.turns.flatMap((x) => [{ role: 'user' as const, content: x.prompt }, { role: 'assistant' as const, content: x.answer }]);
}

function rememberTurn(app: AppService, prompt: string, p: AiProposal): void {
  let t = threads.get(app);
  if (!t || t.projectId !== app.project.id) threads.set(app, (t = { projectId: app.project.id, turns: [] }));
  // What the model said and what validation kept, so a follow-up can build on it without re-sending the rig twice.
  const answer = JSON.stringify({ understanding: p.understanding, actions: p.actions.map((a) => `${a.status} — ${a.summary}`) }).slice(0, 1500);
  t.turns = [...t.turns, { prompt, answer }].slice(-THREAD_TURNS);
}

/** Removes the stopped live AI effects nobody kept (see `pruneTransientEffects`). */
export function pruneAiEffects(app: AppService): void {
  const running = new Set(app.engine.snapshot().effects.map((x) => x.effectId));
  if (app.project.effects.some((x) => x.transient && !running.has(x.id))) app.mutate((d) => { pruneTransientEffects(d, running); });
}

export function storeProposal(app: AppService, p: AiProposal): void {
  p.basis = rigBasis(app);
  app.proposals.set(p.id, p);
  while (app.proposals.size > 20) app.proposals.delete(app.proposals.keys().next().value!);
}

export async function aiPropose(app: AppService, prompt: string, continueThread = false): Promise<AiProposal> {
  if (app.aiBusy) throw new UserError('Une demande IA est déjà en cours');
  app.aiBusy = true;
  const abort = (app.aiAbort = new AbortController());
  try {
    const ai = app.settings.ai;
    const key = app.opts.secrets.get(OPENROUTER_KEY);
    let proposal: AiProposal;
    if (ai.provider === 'openrouter' && key) {
      try {
        await guardBudget(app);
        const model = ai.model || DEFAULT_OPENROUTER_MODEL;
        const caps = (await openRouterModels(app).catch(() => [] as OpenRouterModel[])).find((m) => m.id === model);
        const r = await proposeWithOpenRouter(prompt, describeRig(app.index, ai.allowStrobe, app.engine.bpm, liveState(app.index, app.engine)), { apiKey: key, model, effort: ai.effort, timeoutMs: ai.timeoutSec * 1000, capabilities: caps, signal: abort.signal, onUsage: recordUsage(app), history: continueThread ? threadHistory(app) : [], instructions: app.settings.assistant.directorPrompt });
        // Validated against the project as it is now: it may have changed during the request.
        proposal = buildProposal({ prompt, provider: 'openrouter', model: r.model, understanding: r.understanding, notices: r.notices, rawActions: expandRelativeIntensity(r.actions, app.index, liveState(app.index, app.engine).current), ctx: validationCtx(app) });
        if (r.question) proposal.question = r.question;
        app.aiLastError = null;
      } catch (err) {
        if (abort.signal.aborted) throw new UserError('Demande IA annulée');
        const msg = err instanceof Error ? err.message : String(err);
        app.aiLastError = msg;
        app.logger.error('IA', `Fournisseur OpenRouter indisponible : ${msg}`);
        if (!ai.fallbackToLocal) throw new UserError(`Fournisseur IA indisponible : ${msg}`);
        proposal = proposeLocally(prompt, validationCtx(app), app.engine, continueThread ? lastTargets(app) : undefined);
        proposal.notices.unshift(`Fournisseur OpenRouter indisponible (${msg}) : proposition générée par le mode local déterministe.`);
      }
    } else {
      proposal = proposeLocally(prompt, validationCtx(app), app.engine, continueThread ? lastTargets(app) : undefined);
      if (ai.provider === 'openrouter') proposal.notices.unshift('Aucune clé API configurée : mode local déterministe utilisé.');
    }
    guardConstraints(app, proposal);
    guardFlashes(app, proposal);
    storeProposal(app, proposal);
    if (!continueThread) threads.delete(app);
    rememberTurn(app, prompt, proposal);
    // Remembering the prompt is not an edit of the show: a clean project stays clean (saved with the next save).
    const clean = !app.dirty;
    app.mutate((d) => { d.ai.recentPrompts = [prompt.slice(0, 500), ...d.ai.recentPrompts.filter((x) => x !== prompt)].slice(0, 20); }, { history: false });
    if (clean) {
      app.savedRevision = app.revision;
      app.emitProject();
    }
    // Paramètres › Assistant › « Appliquer sans confirmation »: same checks as the button, never on a question.
    if (app.settings.assistant.autoApply && !proposal.question && proposal.actions.some((a) => a.status !== 'rejected')) {
      try {
        proposal.autoApplied = applyProposal(app, proposal.id);
      } catch (err) {
        proposal.notices.push(`Application automatique impossible : ${(err as Error).message}`);
      }
    }
    return proposal;
  } finally {
    app.aiBusy = false;
    app.aiAbort = null;
  }
}

/** Photo → scene with a vision model (needs OpenRouter); nothing is applied here, the renderer asks first. */
async function sceneFromPhoto(app: AppService, image: string) {
  const r = await withVision(app, (opts) => sceneFromPhotoWithOpenRouter(image, opts, randomUUID));
  app.logger.info('IA', `Scène depuis photo : ${r.trusses.length} structure(s), ${r.props.length} décor(s), ${r.screens.length} écran(s)`);
  return r;
}

/** Photo(s) of a manual's DMX chart → fixture profile; nothing is saved here, the renderer shows it for review first. */
async function profileFromPhoto(app: AppService, images: string[]) {
  const r = await withVision(app, (opts) => profileFromPhotoWithOpenRouter(images, opts));
  if (!r.profile) throw new UserError(`Aucun tableau de canaux DMX lu sur la photo : ${r.summary}`);
  app.logger.info('IA', `Profil depuis photo : ${r.profile.manufacturer} ${r.profile.name}, ${r.profile.modes.length} mode(s)`);
  return r;
}

/** Runs one vision request with the OpenRouter key, model and budget of the settings (one AI request at a time). */
async function withVision<T>(app: AppService, run: (opts: OpenRouterOptions) => Promise<T>): Promise<T> {
  const ai = app.settings.ai;
  const key = app.opts.secrets.get(OPENROUTER_KEY);
  if (!key) throw new UserError('Analyse de photo : configurez une clé OpenRouter dans Paramètres › IA');
  if (app.aiBusy) throw new UserError('Une demande IA est déjà en cours');
  app.aiBusy = true;
  const abort = (app.aiAbort = new AbortController());
  try {
    await guardBudget(app);
    const model = ai.model || DEFAULT_OPENROUTER_MODEL;
    const caps = (await openRouterModels(app).catch(() => [] as OpenRouterModel[])).find((m) => m.id === model);
    const r = await run({ apiKey: key, model, effort: ai.effort, timeoutMs: Math.max(60, ai.timeoutSec) * 1000, capabilities: caps, signal: abort.signal, onUsage: recordUsage(app) });
    app.aiLastError = null;
    return r;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    app.aiLastError = msg;
    app.logger.error('IA', `Analyse de photo impossible : ${msg}`);
    throw err instanceof UserError ? err : new UserError(`Analyse de photo impossible : ${msg}`);
  } finally {
    app.aiBusy = false;
    app.aiAbort = null;
  }
}
