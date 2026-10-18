import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { showSectionPlanSchema, type Mood, type Project, type MusicTrack, type ShowPlan, type ShowSectionPlan } from '../../model/schemas';
import { adjustSection, compileShow, planLocally, rigInfo, withMood, type RigInfo } from '../../music/songToShow';
import { KEY_NAMES, SECTION_NAMES } from '../../music/analyze';
import { DEFAULT_OPENROUTER_MODEL, planSectionWithOpenRouter, planShowWithOpenRouter, type OpenRouterModel, type OpenRouterOptions } from '../../ai/providers/openrouter';
import { ResponseCache } from '../../ai/responseCache';
import { openRouterModels } from './ai';
import { OPENROUTER_KEY, UserError } from '../shared';
import type { AppService, CommandIn } from '../AppService';

/* Song-to-Show: tracks, show planning (local rules or OpenRouter) and compilation. */
export async function handleMusic(app: AppService, cmd: CommandIn<'music'>): Promise<unknown> {
  const ok = { ok: true } as const;
  switch (cmd.type) {
    case 'music.addTrack': {
      const existing = app.project.music.tracks.find((t) => t.hash === cmd.hash);
      if (existing) return { id: existing.id, cached: true };
      const id = randomUUID();
      app.mutate((d) => { d.music.tracks.push({ id, name: cmd.name, hash: cmd.hash, analysis: cmd.analysis, plan: null, created: { sceneIds: [], effectIds: [], timelineId: null } }); });
      const a = cmd.analysis;
      app.logger.info('Musique', `« ${cmd.name} » analysé : ${a.bpm.toFixed(1)} BPM, ${KEY_NAMES[a.key.tonic]} ${a.key.mode === 'major' ? 'majeur' : 'mineur'}, ${a.sections.length} sections`);
      return { id, cached: false };
    }
    // The audio itself is kept per machine (keyed by its SHA-256), not in the project file.
    case 'music.storeAudio': {
      if (createHash('sha256').update(cmd.data).digest('hex') !== cmd.hash) throw new UserError('Empreinte du fichier audio incohérente');
      const file = audioFile(app, cmd.hash);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, cmd.data);
      return ok;
    }
    case 'music.loadAudio':
      return fs.readFile(audioFile(app, cmd.hash)).then((b) => new Uint8Array(b.buffer, b.byteOffset, b.byteLength), () => null);
    case 'music.removeTrack': {
      const t = track(app, cmd.id);
      app.mutate((d) => {
        removeGenerated(app, d, t);
        d.music.tracks = d.music.tracks.filter((x) => x.id !== cmd.id);
      });
      return ok;
    }
    case 'music.setSection':
      app.mutate((d) => {
        const t = d.music.tracks.find((x) => x.id === cmd.trackId);
        const s = t?.analysis.sections[cmd.index];
        if (!t || !s) throw new UserError('Section introuvable');
        if (cmd.label) s.label = cmd.label;
        const p = t.plan?.sections[cmd.index];
        if (cmd.locked !== undefined && p) p.locked = cmd.locked;
      });
      return ok;
    case 'music.generate': {
      const t = track(app, cmd.trackId);
      const variant = cmd.nextVariant ? (t.plan?.variant ?? 0) + 1 : t.plan?.variant ?? 0;
      const { plan, notices } = await planShow(app, t, cmd.intent, variant, cmd.mood);
      return applyShow(app, t, plan, notices);
    }
    case 'music.updateSection': {
      const t = track(app, cmd.trackId);
      if (!t.plan) throw new UserError('Générez d’abord le show de ce morceau');
      const plan: ShowPlan = structuredClone(t.plan);
      const s = plan.sections[cmd.index];
      if (!s) throw new UserError('Section introuvable');
      const patch = Object.fromEntries(Object.entries(cmd.patch).filter(([, v]) => v !== undefined));
      const why = s.why.startsWith('Modifié à la main') ? s.why : `Modifié à la main${s.why ? ` ; ${s.why}` : ''}`.slice(0, 300);
      // A hand-edited section is locked so « Régénérer le show » keeps it (unless the edit itself unlocks it).
      plan.sections[cmd.index] = { ...s, ...patch, locked: cmd.patch.locked ?? true, why };
      return applyShow(app, t, plan, []);
    }
    case 'music.restorePrevious': {
      const t = track(app, cmd.trackId);
      if (!t.previousPlan) throw new UserError('Aucun show précédent pour ce morceau');
      return applyShow(app, t, t.previousPlan, []);
    }
    case 'music.regenerateSection': {
      const t = track(app, cmd.trackId);
      if (!t.plan) throw new UserError('Générez d’abord le show de ce morceau');
      const plan: ShowPlan = structuredClone(t.plan);
      if (!plan.sections[cmd.index]) throw new UserError('Section introuvable');
      const { section, notices } = await planSection(app, t, plan, cmd.index, cmd.instruction.trim());
      plan.sections[cmd.index] = section;
      return applyShow(app, t, plan, notices);
    }
  }
}

const audioFile = (app: AppService, hash: string) => path.join(app.opts.dataDir, 'music', hash);

export function track(app: AppService, id: string): MusicTrack {
  const t = app.project.music.tracks.find((x) => x.id === id);
  if (!t) throw new UserError('Morceau introuvable');
  return t;
}

export function removeGenerated(app: AppService, d: Project, t: MusicTrack): void {
  const scenes = new Set(t.created.sceneIds), effects = new Set(t.created.effectIds);
  d.scenes = d.scenes.filter((s) => !scenes.has(s.id));
  d.effects = d.effects.filter((e) => !effects.has(e.id));
  if (t.created.timelineId) d.timelines = d.timelines.filter((x) => x.id !== t.created.timelineId);
}

/** The song as the LLM sees it. Only the symbolic structure leaves the machine: no audio. */
function songStructure(t: MusicTrack, rig: Required<RigInfo>): string {
  const a = t.analysis;
  const vocals = a.events.filter((e) => e.kind === 'vocal');
  const voiced = (s: { start: number; end: number }) => vocals.reduce((d, v) => d + Math.max(0, Math.min(s.end, v.t + v.duration) - Math.max(s.start, v.t)), 0) / Math.max(0.1, s.end - s.start);
  const names = (list: { name: string }[]) => (list.length ? list.map((x) => `"${x.name}"`).join(', ') : '(none)');
  return [
    `Tempo ${a.bpm.toFixed(1)} BPM, key ${KEY_NAMES[a.key.tonic]} ${a.key.mode}, duration ${a.duration.toFixed(0)} s.`,
    `Rig: ${rig.wash} wash/PAR, ${rig.moving} moving heads, ${rig.bars} LED bars; strobeAllowed: ${rig.allowStrobe}.`,
    `Groups: ${names(rig.groups)}. Stage markers: ${names(rig.markers)}.`,
    'Sections (index, label, start s, duration s, measured energy 0..1, repeat group, share of the section with a voice, brightness 0..1, onsets per beat, bass share 0..1):',
    ...a.sections.map((s, i) => `${i}. ${s.label} (${SECTION_NAMES[s.label]}) start ${s.start.toFixed(1)} dur ${(s.end - s.start).toFixed(1)} energy ${s.energy.toFixed(2)} group ${s.cluster} voice ${voiced(s).toFixed(2)} bright ${s.brightness.toFixed(2)} onsets ${(s.density / (a.bpm / 60)).toFixed(1)} bass ${s.bassShare.toFixed(2)}`),
  ].join('\n');
}

const cachedShowSchema = z.object({ summary: z.string().max(1000), sections: z.array(showSectionPlanSchema).max(300), model: z.string().max(150), notices: z.array(z.string()) });
const cachedSectionSchema = z.object({ section: showSectionPlanSchema, model: z.string().max(150), notices: z.array(z.string()) });

/**
 * One OpenRouter request through the response cache: the key covers the request (`parts`: song hash, intent, rig and
 * structure, variant…) plus the model and effort, so the same request is answered from disk, reproducibly and free.
 * Returns null when OpenRouter is not configured (`notices` then says why, if it was selected).
 */
async function askOpenRouter<T extends { notices: string[] }>(app: AppService, parts: Record<string, unknown>, schema: z.ZodType<T>, notices: string[], call: (o: OpenRouterOptions) => Promise<T>): Promise<T | null> {
  const ai = app.settings.ai;
  const apiKey = app.opts.secrets.get(OPENROUTER_KEY);
  if (ai.provider !== 'openrouter' || !apiKey) {
    if (ai.provider === 'openrouter') notices.push('Aucune clé API : plan généré par les règles locales.');
    return null;
  }
  const model = ai.model || DEFAULT_OPENROUTER_MODEL;
  const cache = new ResponseCache(path.join(app.opts.dataDir, 'ai-cache'));
  const id = cache.key({ ...parts, model, effort: ai.effort });
  const hit = await cache.get(id, schema);
  if (hit) return { ...hit, notices: ['Réponse IA reprise du cache (même demande, aucun nouvel appel).', ...hit.notices] };
  if (app.aiBusy) throw new UserError('Une demande IA est déjà en cours');
  app.aiBusy = true;
  try {
    const caps = (await openRouterModels(app).catch(() => [] as OpenRouterModel[])).find((m) => m.id === model);
    const r = await call({ apiKey, model, effort: ai.effort, timeoutMs: ai.timeoutSec * 1000, capabilities: caps });
    app.aiLastError = null;
    await cache.set(id, r).catch((err: unknown) => app.logger.warn('Musique', `Cache IA non enregistré : ${err instanceof Error ? err.message : String(err)}`));
    return r;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    app.aiLastError = msg;
    app.logger.error('Musique', `Planification OpenRouter indisponible : ${msg}`);
    if (!ai.fallbackToLocal) throw new UserError(`Fournisseur IA indisponible : ${msg}`);
    notices.push(`OpenRouter indisponible (${msg}) : plan généré par les règles locales.`);
    return null;
  } finally {
    app.aiBusy = false;
  }
}

/** Plan with OpenRouter when configured (validated, cached, local fallback), else with the local rules. */
export async function planShow(app: AppService, t: MusicTrack, userIntent: string, variant: number, mood?: Mood): Promise<{ plan: ShowPlan; notices: string[] }> {
  const rig = rigInfo(app.index, app.settings.ai.allowStrobe);
  // Planned with the sliders in words; the plan keeps the operator's own text and the sliders apart for the panel.
  const intent = withMood(userIntent, mood);
  const local = { ...planLocally(t.analysis, intent, rig, variant, t.plan), intent: userIntent.slice(0, 500), mood };
  const notices: string[] = [];
  const structure = songStructure(t, rig);
  // The variant number reaches the model, so « Variante » asks for another take instead of replaying the cache.
  const prompt = variant ? `${structure}\nVariant ${variant}: propose a clearly different take from the previous variants, same intent.` : structure;
  const r = await askOpenRouter(app, { kind: 'show', hash: t.hash, intent, structure, variant }, cachedShowSchema, notices,
    (o) => planShowWithOpenRouter(intent, prompt, o, local.sections, { groups: rig.groups, markers: rig.markers }));
  if (!r) return { plan: local, notices };
  // Locked sections are kept from the previous plan.
  const sections = r.sections.map((s, i) => (t.plan?.sections[i]?.locked && t.plan.sections.length === r.sections.length ? t.plan.sections[i]! : s));
  return { plan: { intent: userIntent.slice(0, 500), provider: 'openrouter', model: r.model, variant, summary: r.summary, sections, mood }, notices: r.notices };
}

/**
 * New version of one section: with OpenRouter (the section, its neighbours and the instruction are sent), else by
 * the local rules: the instruction applied to the section, or a fresh local variant of it without instruction.
 */
async function planSection(app: AppService, t: MusicTrack, plan: ShowPlan, index: number, instruction: string): Promise<{ section: ShowSectionPlan; notices: string[] }> {
  const rig = rigInfo(app.index, app.settings.ai.allowStrobe);
  const s = plan.sections[index]!;
  const intent = withMood(plan.intent, plan.mood);
  const local = instruction ? adjustSection(s, instruction, rig) : { ...planLocally(t.analysis, intent, rig, plan.variant + 1 + index).sections[index]!, locked: s.locked };
  const notices: string[] = [];
  const structure = songStructure(t, rig);
  const req = { intent, instruction, structure, index, current: s, prev: plan.sections[index - 1], next: plan.sections[index + 1] };
  const r = await askOpenRouter(app, { kind: 'section', hash: t.hash, ...req }, cachedSectionSchema, notices,
    (o) => planSectionWithOpenRouter(req, o, local, { groups: rig.groups, markers: rig.markers }));
  return r ? { section: { ...r.section, locked: s.locked }, notices: r.notices } : { section: local, notices };
}

/** Compiles the plan, replaces the track's previously generated objects and stores the plan. */
export function applyShow(app: AppService, t: MusicTrack, plan: ShowPlan, notices: string[]) {
  const c = compileShow(app.index, t.name, t.analysis, plan, { maxStrobeHz: app.settings.engine.maxStrobeHz, allowStrobe: app.settings.ai.allowStrobe });
  if (app.engine.snapshot().timeline.timelineId === t.created.timelineId) app.engine.timelineStop();
  app.mutate((d) => {
    const track = d.music.tracks.find((x) => x.id === t.id)!;
    removeGenerated(app, d, track);
    d.scenes.push(...c.scenes);
    d.effects.push(...c.effects);
    d.timelines.push(c.timeline);
    track.previousPlan = track.plan; // so restoring twice swaps back (redo)
    track.plan = plan;
    track.created = { sceneIds: c.scenes.map((s) => s.id), effectIds: c.effects.map((e) => e.id), timelineId: c.timeline.id };
  });
  const all = [...notices, ...c.notices];
  app.logger.info('Musique', `Show généré pour « ${t.name} » (${plan.provider === 'openrouter' ? `OpenRouter · ${plan.model}` : 'règles locales'}) : ${c.scenes.length} scènes, ${c.effects.length} effets, timeline « ${c.timeline.name} »`);
  for (const n of c.notices) app.logger.warn('Musique', n);
  return { timelineId: c.timeline.id, notices: all, provider: plan.provider };
}
