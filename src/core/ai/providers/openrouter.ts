import { z } from 'zod';
import { FIXTURE_TYPES, hexColorSchema, SHOW_BEAMS, SHOW_EFFECTS, SHOW_EXTRAS, SHOW_MOVEMENTS, showSectionPlanSchema, type ShowSectionPlan } from '../../model/schemas';
import { clamp } from '../../util/math';
import { AI_EFFECT_TYPES } from '../actions';
import { parseIntent } from '../../music/songToShow';
import type { NamedRef } from '../../music/showRig';
import { normalize } from '../local/interpreter';
import type { ProjectIndex } from '../../engine/resolve';
import { baseAttribute } from '../../fixtures/attributes';
import { coarseChannel, modeCells } from '../../fixtures/profiles';
import { BRAND } from '../../../shared/brand';
import { DEFAULT_DIRECTOR_PROMPT } from '../prompts';
import type { AiUsage } from '../usage';

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1';
export const DEFAULT_OPENROUTER_MODEL = 'openrouter/auto';

/*
 * Loose output schema sent to the model (flat optional fields, no numeric bounds).
 * The model's output is NEVER trusted: every action is re-validated with the strict `aiActionSchema`.
 */
const target = z.object({
  all: z.boolean().optional(),
  groupNames: z.array(z.string()).optional(),
  fixtureNames: z.array(z.string()).optional(),
  fixtureTypes: z.array(z.enum(FIXTURE_TYPES)).optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().optional(),
  module: z.string().optional(),
  exclude: z.object({ groupNames: z.array(z.string()).optional(), fixtureNames: z.array(z.string()).optional() }).optional(),
});
const look = z.object({ target, level: z.number().optional(), color: z.string().optional(), colors: z.array(z.string()).optional(), pan: z.number().optional(), tilt: z.number().optional() });
const effect = z.object({
  name: z.string(), effectType: z.enum(AI_EFFECT_TYPES), target,
  speed: z.number().optional(), bpmSync: z.boolean().optional(), beatsPerCycle: z.number().optional(), amplitude: z.number().optional(),
  offset: z.number().optional(), phaseSpread: z.number().optional(), colors: z.array(z.string()).optional(),
  shape: z.enum(['circle', 'figure8', 'pan', 'tilt']).optional(),
});
const llmAction = z.object({
  type: z.enum(['setIntensity', 'adjustIntensity', 'setColor', 'setPosition', 'setBeam', 'startEffect', 'stopEffect', 'adjustEffect', 'createScene', 'applyScene', 'createCue', 'createSequence', 'setBpm', 'releaseAi']),
  target: target.optional(),
  level: z.number().optional(),
  color: z.string().optional(),
  colors: z.array(z.string()).optional(),
  pan: z.number().optional(),
  tilt: z.number().optional(),
  fade: z.number().optional(),
  effect: effect.optional(),
  effectName: z.string().optional(),
  effectType: z.enum(AI_EFFECT_TYPES).optional(),
  all: z.boolean().optional(),
  name: z.string().optional(),
  look: z.array(look).optional(),
  apply: z.boolean().optional(),
  sceneName: z.string().optional(),
  cueListName: z.string().optional(),
  followAfter: z.number().optional(),
  loop: z.boolean().optional(),
  cues: z.array(z.object({ name: z.string(), look: z.array(look), fade: z.number().optional(), hold: z.number().optional(), effects: z.array(effect).optional() })).optional(),
  bpm: z.number().optional(),
  gobo: z.number().optional(),
  prism: z.boolean().optional(),
  zoom: z.number().optional(),
  focus: z.number().optional(),
  frost: z.number().optional(),
  iris: z.number().optional(),
  speedFactor: z.number().optional(),
  /** adjustIntensity: multiplies the current level of each targeted fixture (0.8 = « baisse de 20 % »). */
  factor: z.number().optional(),
});
export const llmPlanSchema = z.object({ understanding: z.string(), question: z.string().optional(), actions: z.array(llmAction) });
const PLAN_JSON_SCHEMA = z.toJSONSchema(llmPlanSchema);

/** Output format, always appended after the (editable) instructions: without it the answer cannot be parsed. */
const FORMAT_RULE = `Answer with ONE JSON object only (no prose, no code fence) matching this JSON Schema:
${JSON.stringify(PLAN_JSON_SCHEMA)}`;

/** What is on stage right now: display colour/level per fixture id, and the AI effects running. */
export interface LiveState {
  current: Record<string, { color: string; level: number }>;
  aiEffects: { name: string; type: string; speed: number; bpmSync: boolean; beatsPerCycle: number }[];
}

export function describeRig(index: ProjectIndex, allowStrobe: boolean, bpm: number, live?: LiveState): string {
  return JSON.stringify({
    strobeAllowed: allowStrobe,
    bpm,
    fixtures: [...index.fixtures.values()].map((rf) => {
      const now = live?.current[rf.fixture.id];
      const { x, y } = rf.fixture.position;
      const gobos = coarseChannel(rf.mode, 'gobo')?.ranges.filter((r) => r.kind === 'gobo').length;
      const cells = modeCells(rf.mode).length;
      const wheel = coarseChannel(rf.mode, 'colorWheel')?.ranges.filter((r) => r.kind === 'color' && r.color).map((r) => ({ label: r.label, color: r.color }));
      const phys = rf.profile.physical;
      return {
        name: rf.fixture.name,
        type: rf.profile.type,
        position: { x, y },
        height: rf.fixture.height,
        side: x < -1 ? 'left' : x > 1 ? 'right' : 'center',
        ...(rf.fixture.tags.length ? { tags: rf.fixture.tags } : {}),
        attributes: [...new Set(rf.attributes.map(baseAttribute))].filter((a) => a !== 'control' && a !== 'macro'),
        ...(rf.profile.modules.length ? { modules: rf.profile.modules.map((m) => m.name) } : {}),
        ...(phys.panRange > 0 ? { pan_degrees: phys.panRange, tilt_degrees: phys.tiltRange, beam_angle: phys.beamAngle, ...(phys.panTiltTime ? { move_seconds_540: phys.panTiltTime } : {}) } : {}),
        ...(gobos ? { gobos } : {}),
        ...(cells ? { cells } : {}),
        ...(wheel?.length ? { colorWheelSlots: wheel } : {}),
        ...(now && now.level > 0.01 ? { now: { color: now.color, level: Math.round(now.level * 100) / 100 } } : {}),
      };
    }),
    ...(live ? { runningAiEffects: live.aiEffects } : {}),
    groups: [...index.groups.values()].map((g) => {
      const members = g.fixtureIds.flatMap((id) => { const m = index.fixtures.get(id); return m ? [m] : []; });
      return {
        name: g.name,
        size: g.fixtureIds.length,
        types: [...new Set(members.map((m) => m.profile.type))],
        attributes: [...new Set(members.flatMap((m) => m.attributes.map(baseAttribute)))].filter((a) => a !== 'control' && a !== 'macro'),
      };
    }),
    scenes: [...index.scenes.values()].map((s) => s.name),
    cueLists: [...index.cueLists.values()].map((c) => c.name),
  });
}

/* ------------------------------------------------------------------ */
/* Models                                                              */
/* ------------------------------------------------------------------ */

const modelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  context_length: z.number().nullable().optional(),
  pricing: z.object({ prompt: z.string().optional(), completion: z.string().optional() }).partial().optional(),
  supported_parameters: z.array(z.string()).optional(),
});
export interface OpenRouterModel {
  id: string;
  name: string;
  contextLength: number | null;
  /** USD per million tokens (null when unknown). */
  promptPrice: number | null;
  completionPrice: number | null;
  structuredOutputs: boolean;
  jsonMode: boolean;
  reasoning: boolean;
}

const perMillion = (s: string | undefined) => (s !== undefined && Number.isFinite(Number(s)) ? Math.round(Number(s) * 1e6 * 1000) / 1000 : null);

export function parseModels(json: unknown): OpenRouterModel[] {
  const data = z.object({ data: z.array(z.unknown()) }).parse(json).data;
  const out: OpenRouterModel[] = [];
  for (const raw of data) {
    const m = modelSchema.safeParse(raw);
    if (!m.success) continue;
    const p = m.data.supported_parameters ?? [];
    out.push({
      id: m.data.id,
      name: m.data.name ?? m.data.id,
      contextLength: m.data.context_length ?? null,
      promptPrice: perMillion(m.data.pricing?.prompt),
      completionPrice: perMillion(m.data.pricing?.completion),
      structuredOutputs: p.includes('structured_outputs'),
      jsonMode: p.includes('response_format'),
      reasoning: p.includes('reasoning'),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export class OpenRouterError extends Error {
  /** Delay asked by the provider before retrying (Retry-After), when given. */
  retryAfterMs?: number;
  constructor(message: string, readonly status: number | null, readonly cancelled = false, readonly network = false) {
    super(message);
  }
}

/** Transient answers worth another attempt (rate limit, gateway errors); a network failure is too. */
const RETRYABLE = new Set([429, 502, 503, 504]);
export const MAX_ATTEMPTS = 3;

const pause = (ms: number, cancel?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    cancel?.addEventListener('abort', () => { clearTimeout(t); reject(new OpenRouterError('Demande annulée', null, true)); }, { once: true });
  });

/**
 * One API call with at most `MAX_ATTEMPTS` attempts on transient failures (exponential backoff with jitter, or the
 * provider's Retry-After), all within the same overall `timeoutMs`. A cancelled or refused request is never retried.
 */
async function request(fetchImpl: FetchLike, url: string, init: RequestInit, timeoutMs: number, cancel?: AbortSignal, stats?: { attempts: number }): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 1; ; attempt++) {
    if (stats) stats.attempts = attempt;
    try {
      return await requestOnce(fetchImpl, url, init, Math.max(1, deadline - Date.now()), cancel);
    } catch (err) {
      const e = err as OpenRouterError;
      const transient = !e.cancelled && (e.status === null ? e.network : RETRYABLE.has(e.status));
      const wait = e.retryAfterMs ?? 500 * 2 ** (attempt - 1) + Math.random() * 250;
      if (!transient || attempt >= MAX_ATTEMPTS || Date.now() + wait >= deadline) throw err;
      await pause(wait, cancel);
    }
  }
}

type FetchLike = typeof fetch;

async function requestOnce(fetchImpl: FetchLike, url: string, init: RequestInit, timeoutMs: number, cancel?: AbortSignal): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const onCancel = () => ctrl.abort();
  cancel?.addEventListener('abort', onCancel);
  let res: Response;
  try {
    if (cancel?.aborted) throw Object.assign(new Error('annulée'), { name: 'AbortError' });
    res = await fetchImpl(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    if (cancel?.aborted) throw new OpenRouterError('Demande annulée', null, true);
    if ((err as Error).name === 'AbortError') throw new OpenRouterError('Délai dépassé', null);
    throw new OpenRouterError(`Connexion impossible (réseau indisponible ?) : ${(err as Error).message}`, null, false, true);
  } finally {
    clearTimeout(t);
    cancel?.removeEventListener('abort', onCancel);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg = (body as { error?: { message?: string } } | null)?.error?.message ?? text.slice(0, 200);
    const hint = res.status === 401 ? 'Clé API refusée' : res.status === 402 ? 'Crédits OpenRouter insuffisants' : res.status === 429 ? 'Limite de débit atteinte, réessayez plus tard' : res.status === 404 ? 'Modèle introuvable' : `Erreur API ${res.status}`;
    const e = new OpenRouterError(`${hint}${msg ? ` : ${msg}` : ''}`, res.status);
    const retryAfter = Number(res.headers.get('retry-after'));
    if (res.headers.has('retry-after') && Number.isFinite(retryAfter)) e.retryAfterMs = retryAfter * 1000;
    throw e;
  }
  return body;
}

export async function listOpenRouterModels(opts: { timeoutMs: number; fetchImpl?: FetchLike }): Promise<OpenRouterModel[]> {
  const body = await request(opts.fetchImpl ?? fetch, `${OPENROUTER_URL}/models`, { method: 'GET' }, opts.timeoutMs);
  return parseModels(body);
}

/* ------------------------------------------------------------------ */
/* Completion                                                          */
/* ------------------------------------------------------------------ */

export interface OpenRouterOptions {
  apiKey: string;
  model: string;
  effort: 'low' | 'medium' | 'high';
  timeoutMs: number;
  /** Capabilities of the chosen model when known (from the models list). */
  capabilities?: Pick<OpenRouterModel, 'structuredOutputs' | 'jsonMode' | 'reasoning'>;
  fetchImpl?: FetchLike;
  /** Cancels the request (user « Annuler »); the error is an `OpenRouterError` with `cancelled`. */
  signal?: AbortSignal;
  /** One corrective request when the answer does not match the schema (default: on). */
  repair?: boolean;
  /** Tokens and cost of each completed call (OpenRouter `usage`). */
  onUsage?: (u: AiUsage) => void;
  /** Previous exchanges of the conversation, sent between the system prompt and the request. */
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export interface ProviderResult {
  understanding: string;
  /** Clarifying question when the request is ambiguous. */
  question?: string;
  actions: unknown[];
  model: string;
  notices: string[];
}

/** Strips undefined/null fields so the strict schema sees clean objects. */
function clean(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== null).map(([k, x]) => [k, clean(x)]));
  return v;
}

/** Extracts the JSON object from a model answer (tolerates code fences or surrounding prose). */
export function extractJson(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const a = trimmed.indexOf('{'), b = trimmed.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(trimmed.slice(a, b + 1));
      } catch {
        // fall through
      }
    }
    throw new OpenRouterError('Réponse IA sans objet JSON valide', null);
  }
}

/** One chat completion constrained to a JSON object (as far as the model supports it); returns the parsed object. */
export async function completeJson(system: string, user: string | unknown[], schemaName: string, jsonSchema: unknown, opts: OpenRouterOptions): Promise<{ json: unknown; model: string; notices: string[] }> {
  const caps = opts.capabilities;
  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: 8000,
    temperature: 0.3,
    usage: { include: true },
    messages: [
      { role: 'system', content: system },
      ...(opts.history ?? []),
      { role: 'user', content: user },
    ],
  };
  // Constrain the output format only as far as the chosen model supports it; the prompt always carries the schema.
  if (caps?.structuredOutputs) body.response_format = { type: 'json_schema', json_schema: { name: schemaName, strict: false, schema: jsonSchema } };
  else if (caps?.jsonMode) body.response_format = { type: 'json_object' };
  if (caps?.reasoning) body.reasoning = { effort: opts.effort };

  const stats = { attempts: 1 };
  const json = await request(opts.fetchImpl ?? fetch, `${OPENROUTER_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json', 'X-Title': BRAND.productName },
    body: JSON.stringify(body),
  }, opts.timeoutMs, opts.signal, stats);

  // The call is paid even if its content turns out unusable: record it first.
  const usage = z.object({ usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number(), cost: z.number().optional() }) }).safeParse(json);
  if (usage.success) opts.onUsage?.({ promptTokens: usage.data.usage.prompt_tokens, completionTokens: usage.data.usage.completion_tokens, cost: usage.data.usage.cost ?? null });
  const parsed = z
    .object({ model: z.string().optional(), choices: z.array(z.object({ finish_reason: z.string().nullable().optional(), message: z.object({ content: z.string().nullable().optional() }) })).min(1) })
    .safeParse(json);
  if (!parsed.success) {
    const err = (json as { error?: { message?: string } } | null)?.error?.message;
    throw new OpenRouterError(err ? `Erreur du fournisseur : ${err}` : 'Réponse OpenRouter inattendue', null);
  }
  const choice = parsed.data.choices[0]!;
  if (choice.finish_reason === 'length') throw new OpenRouterError('Réponse IA tronquée (limite de longueur)', null);
  if (!choice.message.content) throw new OpenRouterError('Réponse IA vide (refus ou filtre du modèle)', null);
  const model = parsed.data.model ?? opts.model;
  const notices: string[] = [];
  if (opts.model === DEFAULT_OPENROUTER_MODEL || model !== opts.model) notices.push(`Réponse servie par ${model}`);
  if (!caps) notices.push('Capacités du modèle inconnues : format JSON demandé par consigne uniquement.');
  if (stats.attempts > 1) notices.push(`Réponse obtenue après ${stats.attempts} tentatives (incident passager du fournisseur).`);
  // Many models emit null for optional fields: drop them before validating.
  return { json: clean(extractJson(choice.message.content)), model, notices };
}

/** `instructions`: the operator's custom director prompt (Paramètres › Assistant), the built-in one by default. */
export async function proposeWithOpenRouter(prompt: string, rig: string, opts: OpenRouterOptions & { instructions?: string | null }): Promise<ProviderResult> {
  const system = `${opts.instructions ?? DEFAULT_DIRECTOR_PROMPT}\n\n${FORMAT_RULE}\n\nRig description:\n${rig}`;
  let r = await completeJson(system, prompt, 'lighting_plan', PLAN_JSON_SCHEMA, opts);
  let plan = llmPlanSchema.safeParse(r.json);
  if (!plan.success && opts.repair !== false) {
    // One second chance with the validation errors: weaker models often miss a single field (costs one more call).
    const issues = plan.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    const retry = `${prompt}\n\nYour previous answer did not match the required JSON schema (${issues}).\nPrevious answer:\n${JSON.stringify(r.json).slice(0, 6000)}\nReturn only the corrected JSON object.`;
    r = await completeJson(system, retry, 'lighting_plan', PLAN_JSON_SCHEMA, opts);
    plan = llmPlanSchema.safeParse(r.json);
    if (plan.success) r.notices.push('Réponse corrigée par une seconde requête (format non conforme la première fois).');
  }
  if (!plan.success) throw new OpenRouterError(`Réponse IA non conforme au schéma : ${plan.error.issues[0]?.path.join('.')} ${plan.error.issues[0]?.message}`, null);
  return { understanding: plan.data.understanding, ...(plan.data.question?.trim() ? { question: plan.data.question.trim() } : {}), actions: plan.data.actions, model: r.model, notices: r.notices };
}

/* ------------------------------------------------------------------ */
/* Song-to-Show planning                                               */
/* ------------------------------------------------------------------ */

const llmSectionSchema = z.object({
    index: z.number(),
    energy: z.number(),
    palette: z.array(z.string()),
    layers: z.object({ wash: z.boolean(), moving: z.boolean(), bars: z.boolean() }),
    movement: z.enum(SHOW_MOVEMENTS),
    effect: z.enum(SHOW_EFFECTS),
    beam: z.enum(SHOW_BEAMS),
    effectBeats: z.number(),
    accents: z.boolean(),
    groups: z.array(z.string()),
    focus: z.string().nullable(),
    extras: z.array(z.enum(SHOW_EXTRAS)),
    why: z.string(),
});
const llmShowSchema = z.object({ summary: z.string(), sections: z.array(llmSectionSchema) });
/** What is actually parsed: sections are repaired field by field rather than rejected as a whole. */
const looseShowSchema = z.object({ summary: z.string().catch(''), sections: z.array(z.record(z.string(), z.unknown())).min(1) });
const SHOW_JSON_SCHEMA = z.toJSONSchema(llmShowSchema);
const SECTION_JSON_SCHEMA = z.toJSONSchema(llmSectionSchema);

const SHOW_INTRO = `You are the lighting designer assistant of a DMX console. You plan a light show for one song, section by section.
You only see the song's symbolic structure (sections, durations, measured energy, tempo, key), never the audio.
Answer with ONE JSON object only (no prose, no code fence) matching this JSON Schema:`;
const SECTION_RULES = `- energy: integer 0 (almost dark) to 5 (maximum). Follow the operator's intent first, then the song's dynamics.
- palette: 1 to 4 colours "#RRGGBB". Sections that are repeats of the same music should share a palette.
- layers: which fixture families are lit (only families present in the rig).
- movement (moving heads only): none | slow | sweep | fast | fan (heads open and close like a fan) | ballyhoo (wide random sweeps).
- effect: none | wave | pulse | chase | rainbow | strobe | colorChase (palette colours chasing across the fixtures).
- groups: names of project groups (from the "Groups" list) lit in this section, e.g. back lights on verses, front lights on choruses; [] = use layers.
- focus: name of a stage marker (from the "Stage markers" list) the moving heads aim at and hold (e.g. a shower on the singer while they sing), "audience" to sweep the audience, or null.
- extras (any of): ramp (long calm section slowly building up), blinder (full hit on the section start, for drops), breathe (zoom / iris breathing on calm parts), bassFollow (dimmer follows the bass, bass-heavy peaks), colorFollow (colour follows the brightness of the music).
- beam (moving heads with gobo/prism/frost): open | gobo | prism (gobo + prism, for peaks) | frost (soft, for calm parts).
- effectBeats: effect cycle in beats (0.5 to 16). Use strobe ONLY if strobeAllowed is true AND the operator asked for it.
- accents: flash on detected impacts (true only for high-energy sections).
- why: one short sentence in French explaining this look (repeat of an earlier section, measured energy, intent).
Design like a touring lighting designer:
- Build an arc: keep the intro and verses low so the peaks have room; each repeated chorus or drop a little bigger than the previous one, the last peak the biggest.
- Contrast neighbours: a section should differ from the one before it in energy, movement or effect, never the same look twice in a row.
- Few colours per section (1 or 2, 3 at most on peaks); calm parts in deep saturated colours, peaks may add white.
- Effect speed follows the playing: more onsets per beat → smaller effectBeats; sparse parts → slow waves or none.
- Bright sections (high brightness) suit gobos and prisms, dark ones frost and slow movement; bass-heavy peaks suit bassFollow.
The console mirrors effects across the stage, varies them every 8 bars, blacks out one beat before drops and ends the show on the last hit: do not try to encode these.`;
const SHOW_SYSTEM = `${SHOW_INTRO}
${JSON.stringify(SHOW_JSON_SCHEMA)}
Rules:
- Exactly one entry per section, same index as given, in order.
${SECTION_RULES}
- "summary": one or two sentences in French describing the show.`;
const SECTION_SYSTEM = `${SHOW_INTRO}
${JSON.stringify(SECTION_JSON_SCHEMA)}
You redo ONE section of an existing show, following the operator's instruction for it and staying coherent with the
neighbouring sections (given as they are) unless the instruction asks otherwise.
Rules:
${SECTION_RULES}`;

/** Newer fields an older or terse model may leave out: kept from the fallback without being reported as fixed. */
const OPTIONAL_FIELDS = new Set(['groups', 'focus', 'extras', 'why']);

/**
 * Repairs one LLM section: numbers are rounded/clamped, invalid colours dropped, and every field still missing or
 * invalid is taken from `fallback` (the local plan). Returns the names of the replaced fields. The explanation is
 * the model's own (never the fallback's, which describes another look).
 */
export function repairShowSection(raw: Record<string, unknown>, fallback: ShowSectionPlan, index: number): { section: ShowSectionPlan; fixed: string[] } {
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
  const energy = num(raw.energy), beats = num(raw.effectBeats);
  const candidate: Record<string, unknown> = {
    ...raw, index, locked: false, note: '',
    energy: energy === undefined ? undefined : clamp(Math.round(energy), 0, 5),
    effectBeats: beats === undefined ? undefined : clamp(beats, 0.5, 16),
    palette: Array.isArray(raw.palette) ? raw.palette.filter((c) => hexColorSchema.safeParse(c).success).slice(0, 4) : undefined,
  };
  const section: Record<string, unknown> = { ...fallback, index, locked: false, note: '' };
  const fixed: string[] = [];
  for (const [key, schema] of Object.entries(showSectionPlanSchema.shape)) {
    const r = candidate[key] === undefined ? null : schema.safeParse(candidate[key]);
    if (r?.success) section[key] = r.data;
    else if (r || !OPTIONAL_FIELDS.has(key)) fixed.push(key);
  }
  section.why = typeof raw.why === 'string' ? raw.why.trim().slice(0, 300) : '';
  return { section: section as ShowSectionPlan, fixed };
}

export interface ShowRefs { groups: NamedRef[]; markers: NamedRef[] }
const idOf = (list: NamedRef[], x: unknown) => (typeof x === 'string' ? list.find((r) => r.id === x || normalize(r.name).trim() === normalize(x).trim())?.id : undefined);
/** The model names groups and markers; the plan stores their ids (unknown names are dropped). */
function toIds(raw: Record<string, unknown>, refs: ShowRefs): void {
  if (Array.isArray(raw.groups)) raw.groups = raw.groups.map((g) => idOf(refs.groups, g)).filter(Boolean);
  if (typeof raw.focus === 'string' && raw.focus !== 'audience') raw.focus = idOf(refs.markers, raw.focus) ?? null;
}
/** A plan section as the model sees it: groups and markers by name, no editing state. */
function forModel(s: ShowSectionPlan, refs: ShowRefs): Record<string, unknown> {
  const { locked: _l, note: _n, ...rest } = s;
  const name = (list: NamedRef[], id: string) => list.find((r) => r.id === id)?.name ?? id;
  return { ...rest, groups: s.groups.map((g) => name(refs.groups, g)), focus: s.focus && s.focus !== 'audience' ? name(refs.markers, s.focus) : s.focus };
}

/**
 * Plans a show with an LLM. Sections are repaired one by one against `fallback` (the local plan, one entry per
 * section): missing sections and invalid fields come from it, a strobe the operator did not ask for is removed.
 * Only an unusable answer (no sections at all) throws.
 */
export async function planShowWithOpenRouter(intent: string, structure: string, opts: OpenRouterOptions, fallback: ShowSectionPlan[], refs: ShowRefs = { groups: [], markers: [] }): Promise<{ summary: string; sections: ShowSectionPlan[]; model: string; notices: string[] }> {
  const r = await completeJson(SHOW_SYSTEM, `Operator intent: ${intent || '(none)'}\n\n${structure}`, 'show_plan', SHOW_JSON_SCHEMA, opts);
  const loose = looseShowSchema.safeParse(r.json);
  if (!loose.success) throw new OpenRouterError(`Plan IA non conforme : ${loose.error.issues[0]?.path.join('.')} ${loose.error.issues[0]?.message}`, null);
  const notices = [...r.notices];
  const fixedNotes: string[] = [];
  const strobeWanted = parseIntent(intent).strobe === 'want';
  const sections = fallback.map((fb, i) => {
    const raw = loose.data.sections[i];
    if (!raw) return { ...fb, index: i, locked: false, note: '' };
    toIds(raw, refs);
    const { section, fixed } = repairShowSection(raw, fb, i);
    if (section.effect === 'strobe' && !strobeWanted) { section.effect = 'chase'; fixed.push('strobe non demandé → chase'); }
    if (fixed.length) fixedNotes.push(`${i + 1} (${fixed.join(', ')})`);
    return section;
  });
  const missing = fallback.length - Math.min(fallback.length, loose.data.sections.length);
  if (missing) notices.push(`Plan IA incomplet : ${missing} section(s) sur ${fallback.length} complétée(s) par les règles locales`);
  if (loose.data.sections.length > fallback.length) notices.push(`Plan IA : ${loose.data.sections.length - fallback.length} section(s) en trop ignorée(s)`);
  if (fixedNotes.length) notices.push(`Plan IA corrigé (champs invalides repris des règles locales) : section ${fixedNotes.join(' ; ')}`);
  return { summary: loose.data.summary.slice(0, 1000) || 'Plan IA', sections, model: r.model, notices };
}

/**
 * Redoes one section with an LLM: the song structure, the section as it is, its neighbours and the operator's
 * instruction are sent; the answer is repaired against `fallback` (the local edit of the section).
 */
export async function planSectionWithOpenRouter(
  req: { intent: string; instruction: string; structure: string; index: number; current: ShowSectionPlan; prev?: ShowSectionPlan; next?: ShowSectionPlan },
  opts: OpenRouterOptions, fallback: ShowSectionPlan, refs: ShowRefs,
): Promise<{ section: ShowSectionPlan; model: string; notices: string[] }> {
  const show = (s?: ShowSectionPlan) => (s ? JSON.stringify(forModel(s, refs)) : '(none)');
  const user = [
    `Operator intent for the whole show: ${req.intent || '(none)'}`,
    `Instruction for section ${req.index}: ${req.instruction || 'propose a different look, same intent'}`,
    '', req.structure, '',
    `Section ${req.index} now: ${show(req.current)}`,
    `Previous section: ${show(req.prev)}`,
    `Next section: ${show(req.next)}`,
  ].join('\n');
  const r = await completeJson(SECTION_SYSTEM, user, 'show_section', SECTION_JSON_SCHEMA, opts);
  if (!r.json || typeof r.json !== 'object' || Array.isArray(r.json)) throw new OpenRouterError('Section IA non conforme : objet JSON attendu', null);
  const raw = r.json as Record<string, unknown>;
  toIds(raw, refs);
  const { section, fixed } = repairShowSection(raw, fallback, req.index);
  if (section.effect === 'strobe' && parseIntent(`${req.intent} ${req.instruction}`).strobe !== 'want') { section.effect = 'chase'; fixed.push('strobe non demandé → chase'); }
  const notices = [...r.notices];
  if (fixed.length) notices.push(`Section IA corrigée (champs repris des règles locales) : ${fixed.join(', ')}`);
  return { section: { ...section, locked: req.current.locked, note: req.instruction.slice(0, 200) }, model: r.model, notices };
}

const SUGGEST_JSON_SCHEMA = z.toJSONSchema(z.object({ suggestions: z.array(z.string().max(120)).max(5) }));
const SUGGEST_SYSTEM = `You are the lighting designer assistant of a DMX console. For one song, you suggest short intention phrases the operator can add to the show intention.
You only see the song's symbolic structure (sections, measured energy, brightness, bass share, density, key), never the audio.
Answer with ONE JSON object only (no prose, no code fence) matching this JSON Schema:
${JSON.stringify(SUGGEST_JSON_SCHEMA)}
Rules:
- 3 to 5 suggestions, in French, 2 to 6 words each, written with the vocabulary of these examples: "couplets sobres", "refrains explosifs", "couleurs froides", "couleurs chaudes", "strobe sur les drops", "lumières sur les basses", "beaucoup de mouvement", "ambiance calme".
- Each suggestion must follow from THIS song's measured structure (energy contrast between verses and peaks, repeats, bass, density, brightness, key), not a generic style.
- Do not repeat what the operator already wrote, and do not ask for strobe unless the song has a drop.`;

/** Intention suggestions for one song, from its structure only. Throws when the answer has no usable suggestion. */
export async function suggestIntentsWithOpenRouter(intent: string, structure: string, opts: OpenRouterOptions): Promise<{ suggestions: string[]; model: string; notices: string[] }> {
  const r = await completeJson(SUGGEST_SYSTEM, `Operator intent already written: ${intent || '(none)'}\n\n${structure}`, 'intent_suggestions', SUGGEST_JSON_SCHEMA, opts);
  const parsed = z.object({ suggestions: z.array(z.string()) }).safeParse(r.json);
  if (!parsed.success) throw new OpenRouterError('Suggestions IA non conformes', null);
  const suggestions = [...new Set(parsed.data.suggestions.map((s) => s.trim().slice(0, 120)).filter(Boolean))].slice(0, 5);
  if (!suggestions.length) throw new OpenRouterError('Aucune suggestion IA exploitable', null);
  return { suggestions, model: r.model, notices: r.notices };
}
