import { randomUUID } from 'node:crypto';
import type { Project, MusicTrack, ShowPlan } from '../../model/schemas';
import { adjustSection, compileShow, planLocally, rigInfo } from '../../music/songToShow';
import { KEY_NAMES, SECTION_NAMES } from '../../music/analyze';
import { DEFAULT_OPENROUTER_MODEL, planShowWithOpenRouter, type OpenRouterModel } from '../../ai/providers/openrouter';
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
      const { plan, notices } = await planShow(app, t, cmd.intent, variant);
      return applyShow(app, t, plan, notices);
    }
    case 'music.regenerateSection': {
      const t = track(app, cmd.trackId);
      if (!t.plan) throw new UserError('Générez d’abord le show de ce morceau');
      const rig = rigInfo(app.index, app.settings.ai.allowStrobe);
      const plan: ShowPlan = structuredClone(t.plan);
      const s = plan.sections[cmd.index];
      if (!s) throw new UserError('Section introuvable');
      if (cmd.instruction.trim()) plan.sections[cmd.index] = adjustSection(s, cmd.instruction, rig);
      else {
        // No instruction: a new variant of this section only.
        const fresh = planLocally(t.analysis, plan.intent, rig, plan.variant + 1 + cmd.index);
        plan.sections[cmd.index] = { ...fresh.sections[cmd.index]!, locked: s.locked };
      }
      return applyShow(app, t, plan, []);
    }
  }
}

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

/** Plan with OpenRouter when configured (validated, local fallback), else with the local rules. */
export async function planShow(app: AppService, t: MusicTrack, intent: string, variant: number): Promise<{ plan: ShowPlan; notices: string[] }> {
  const rig = rigInfo(app.index, app.settings.ai.allowStrobe);
  const local = planLocally(t.analysis, intent, rig, variant, t.plan);
  const ai = app.settings.ai;
  const key = app.opts.secrets.get(OPENROUTER_KEY);
  if (ai.provider !== 'openrouter' || !key) return { plan: local, notices: ai.provider === 'openrouter' ? ['Aucune clé API : plan généré par les règles locales.'] : [] };
  if (app.aiBusy) throw new UserError('Une demande IA est déjà en cours');
  app.aiBusy = true;
  try {
    const a = t.analysis;
    // Only the symbolic structure leaves the machine: no audio.
    const structure = [
      `Tempo ${a.bpm.toFixed(1)} BPM, key ${KEY_NAMES[a.key.tonic]} ${a.key.mode}, duration ${a.duration.toFixed(0)} s.`,
      `Rig: ${rig.wash} wash/PAR, ${rig.moving} moving heads, ${rig.bars} LED bars; strobeAllowed: ${rig.allowStrobe}.`,
      'Sections (index, label, start s, duration s, measured energy 0..1, repeat group):',
      ...a.sections.map((s, i) => `${i}. ${s.label} (${SECTION_NAMES[s.label]}) start ${s.start.toFixed(1)} dur ${(s.end - s.start).toFixed(1)} energy ${s.energy.toFixed(2)} group ${s.cluster}`),
    ].join('\n');
    const model = ai.model || DEFAULT_OPENROUTER_MODEL;
    const caps = (await openRouterModels(app).catch(() => [] as OpenRouterModel[])).find((m) => m.id === model);
    const r = await planShowWithOpenRouter(intent, structure, { apiKey: key, model, effort: ai.effort, timeoutMs: ai.timeoutSec * 1000, capabilities: caps }, local.sections);
    app.aiLastError = null;
    // Locked sections are kept from the previous plan.
    const sections = r.sections.map((s, i) => (t.plan?.sections[i]?.locked && t.plan.sections.length === r.sections.length ? t.plan.sections[i]! : s));
    return { plan: { intent: intent.slice(0, 500), provider: 'openrouter', model: r.model, variant, summary: r.summary, sections }, notices: r.notices };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    app.aiLastError = msg;
    app.logger.error('Musique', `Planification OpenRouter indisponible : ${msg}`);
    if (!ai.fallbackToLocal) throw new UserError(`Fournisseur IA indisponible : ${msg}`);
    return { plan: local, notices: [`OpenRouter indisponible (${msg}) : plan généré par les règles locales.`] };
  } finally {
    app.aiBusy = false;
  }
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
    track.plan = plan;
    track.created = { sceneIds: c.scenes.map((s) => s.id), effectIds: c.effects.map((e) => e.id), timelineId: c.timeline.id };
  });
  const all = [...notices, ...c.notices];
  app.logger.info('Musique', `Show généré pour « ${t.name} » (${plan.provider === 'openrouter' ? `OpenRouter · ${plan.model}` : 'règles locales'}) : ${c.scenes.length} scènes, ${c.effects.length} effets, timeline « ${c.timeline.name} »`);
  for (const n of c.notices) app.logger.warn('Musique', n);
  return { timelineId: c.timeline.id, notices: all, provider: plan.provider };
}
