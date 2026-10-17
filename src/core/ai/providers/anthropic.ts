import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { EFFECT_TYPES, FIXTURE_TYPES } from '../../model/schemas';
import type { ProjectIndex } from '../../engine/resolve';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';

/*
 * Loose output schema for structured outputs (no numeric bounds, flat optional fields).
 * The model's output is NEVER trusted: every action is re-validated with the strict `aiActionSchema`.
 */
const target = z.object({
  all: z.boolean().optional(),
  groupNames: z.array(z.string()).optional(),
  fixtureNames: z.array(z.string()).optional(),
  fixtureTypes: z.array(z.enum(FIXTURE_TYPES)).optional(),
  limit: z.number().optional(),
});
const look = z.object({ target, level: z.number().optional(), color: z.string().optional(), colors: z.array(z.string()).optional(), pan: z.number().optional(), tilt: z.number().optional() });
const effect = z.object({
  name: z.string(), effectType: z.enum(EFFECT_TYPES), target,
  speed: z.number().optional(), bpmSync: z.boolean().optional(), beatsPerCycle: z.number().optional(), amplitude: z.number().optional(),
  offset: z.number().optional(), phaseSpread: z.number().optional(), colors: z.array(z.string()).optional(),
  shape: z.enum(['circle', 'figure8', 'pan', 'tilt']).optional(),
});
const llmAction = z.object({
  type: z.enum(['setIntensity', 'setColor', 'setPosition', 'startEffect', 'stopEffect', 'createScene', 'applyScene', 'createCue', 'createSequence', 'setBpm', 'releaseAi']),
  target: target.optional(),
  level: z.number().optional(),
  color: z.string().optional(),
  colors: z.array(z.string()).optional(),
  pan: z.number().optional(),
  tilt: z.number().optional(),
  fade: z.number().optional(),
  effect: effect.optional(),
  effectName: z.string().optional(),
  effectType: z.enum(EFFECT_TYPES).optional(),
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
});
export const llmPlanSchema = z.object({ understanding: z.string(), actions: z.array(llmAction) });

const SYSTEM_PROMPT = `You are the lighting director assistant inside a DMX lighting console.
You translate the operator's request into a short list of structured actions. You never output DMX values, code or commands outside the schema.

Rules:
- Values are normalized 0..1 (level, pan, tilt, amplitude, offset, phaseSpread). Colours are "#RRGGBB". Fades/holds are seconds. speed is cycles per second.
- Target fixtures only by the exact group names, fixture names or fixture types listed in the rig description. {"all": true} targets the whole rig.
- Only use capabilities the fixtures have (see attributes). Movement effects (panTilt, randomMove) need pan/tilt. Colour effects need colour attributes.
- Never touch reset, lamp or other special/control functions; they are not available to you.
- Strobe effects are only allowed when the rig description says strobeAllowed: true.
- Use setIntensity/setColor/setPosition for immediate changes, createScene (apply true to show it) for a reusable look, createSequence for timed or multi-step shows (hold = seconds before auto-advancing, null for manual GO), startEffect for dynamic effects.
- "understanding" is one or two sentences in French describing what you will do and any limitation (e.g. you cannot hear the music).
- Keep proposals small and focused; at most 20 actions. Omit optional fields you do not need.`;

export function describeRig(index: ProjectIndex, allowStrobe: boolean, bpm: number): string {
  return JSON.stringify({
    strobeAllowed: allowStrobe,
    bpm,
    fixtures: [...index.fixtures.values()].map((rf) => ({ name: rf.fixture.name, type: rf.profile.type, attributes: rf.attributes.filter((a) => a !== 'control' && a !== 'macro') })),
    groups: [...index.groups.values()].map((g) => ({ name: g.name, size: g.fixtureIds.length })),
    scenes: [...index.scenes.values()].map((s) => s.name),
    cueLists: [...index.cueLists.values()].map((c) => c.name),
  });
}

export interface ClaudeOptions {
  apiKey: string;
  model: string;
  effort: 'low' | 'medium' | 'high';
  timeoutMs: number;
}

export interface ClaudeResult {
  understanding: string;
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

export async function proposeWithClaude(prompt: string, rig: string, opts: ClaudeOptions): Promise<ClaudeResult> {
  const client = new Anthropic({ apiKey: opts.apiKey, timeout: opts.timeoutMs, maxRetries: 1 });
  const response = await client.beta.messages.parse({
    model: opts.model,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: opts.effort, format: betaZodOutputFormat(llmPlanSchema) },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }, { type: 'text', text: `Rig description:\n${rig}` }],
    messages: [{ role: 'user', content: prompt }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Le fournisseur IA a refusé la demande');
  if (response.stop_reason === 'max_tokens') throw new Error('Réponse IA tronquée (max_tokens)');
  const plan = response.parsed_output;
  if (!plan) throw new Error('Réponse IA non conforme au schéma');
  const notices: string[] = [];
  if (response.model !== opts.model) notices.push(`Réponse servie par ${response.model}`);
  return { understanding: plan.understanding, actions: plan.actions.map(clean), model: response.model, notices };
}

export function describeClaudeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'Clé API refusée (401)';
  if (err instanceof Anthropic.RateLimitError) return 'Limite de débit atteinte (429), réessayez plus tard';
  if (err instanceof Anthropic.APIConnectionTimeoutError) return 'Délai dépassé';
  if (err instanceof Anthropic.APIConnectionError) return 'Connexion impossible (réseau indisponible ?)';
  if (err instanceof Anthropic.APIError) return `Erreur API ${err.status ?? ''} : ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}
