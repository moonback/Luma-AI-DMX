import { z } from 'zod';
import { BUILTIN_ATTRIBUTES, FIXTURE_TYPES, RANGE_KINDS, profileSchema, type Channel, type ChannelRange, type FixtureMode, type FixtureProfile } from '../model/schemas';
import { dedupeRanges, slug } from '../fixtures/ofl';
import type { OpenRouterOptions } from './providers/openrouter';
import { visionJson } from './sceneFromPhoto';

/**
 * Photo(s) of a manual's DMX chart → fixture profile: a vision model transcribes the channel table(s), the answer is
 * repaired into a valid profile. Channels are never dropped (that would shift every following DMX address).
 */

const llmProfileSchema = z.object({
  summary: z.string(),
  manufacturer: z.string(),
  name: z.string(),
  type: z.enum(FIXTURE_TYPES),
  modes: z.array(z.object({
    name: z.string(),
    channels: z.array(z.object({
      name: z.string(),
      attribute: z.string(),
      fine: z.boolean(),
      default: z.number(),
      ranges: z.array(z.object({ from: z.number(), to: z.number(), label: z.string(), kind: z.enum(RANGE_KINDS) })),
    })),
  })),
});
const PROFILE_JSON_SCHEMA = z.toJSONSchema(llmProfileSchema);

const PROFILE_SYSTEM = `You are a lighting technician. You transcribe the DMX channel chart of a stage light fixture from photos of its user manual.
Answer with ONE JSON object only (no prose, no code fence) matching this JSON Schema:
${JSON.stringify(PROFILE_JSON_SCHEMA)}
- manufacturer / name: brand and model as printed (empty string if not visible). type: closest of ${FIXTURE_TYPES.join(', ')}.
- modes: one per DMX mode / personality in the chart (e.g. "8ch", "16ch"); name it as the manual does. channels: in DMX order, exactly one entry per DMX channel, none skipped or merged.
- channel.name: the function as printed (short). attribute: one of ${BUILTIN_ATTRIBUTES.join(', ')}; "shutter" for a channel mixing closed/open/strobe, "strobe" for a pure strobe speed, "control" for reset/lamp/settings, "colorMacro" for colour presets; if none fits, a short english slug (e.g. "auto-program").
- fine: true for the 16-bit low byte ("fine", "16 bit", "LSB") of an attribute whose coarse channel is also in the mode; it keeps the same attribute as its coarse channel.
- default: the power-on / home value only if the manual states it, else 0.
- ranges: every value range printed for the channel (from, to in 0..255, label as printed, kind: open/closed/strobe/pulse/random/color/gobo/shake/rotation/reset/lamp-on/lamp-off/other). Empty for plain 0-255 proportional channels.
- If several photos are given, they are consecutive pages of the same manual.
"summary": one or two sentences in French on what you read and anything unreadable.`;

export interface PhotoProfile {
  profile: FixtureProfile | null;
  summary: string;
  /** Value ranges that could not be repaired, plus empty modes. */
  dropped: number;
}

const text = (x: unknown, max: number, fallback: string) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : fallback);
const int = (x: unknown, fallback: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(Math.min(255, Math.max(0, x))) : fallback);
const objs = (x: unknown, max: number): Record<string, unknown>[] => (Array.isArray(x) ? x.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object').slice(0, max) : []);
const BUILTIN = new Set<string>(BUILTIN_ATTRIBUTES);
const DANGEROUS = new Set<string>(['reset', 'lamp-off']);

function repairMode(m: Record<string, unknown>, count: { dropped: number }): FixtureMode | null {
  const raw = objs(m.channels, 512);
  if (!raw.length) return null;
  const coarse = new Set<string>();
  const fine = new Set<string>();
  const channels = raw.map((c, i): Channel => {
    const name = text(c.name, 48, `Canal ${i + 1}`);
    const asked = typeof c.attribute === 'string' ? c.attribute.trim() : '';
    let attribute = BUILTIN.has(asked) ? asked : `custom:${slug(asked.replace(/^custom:/, '') || name)}`;
    const isFine = c.fine === true && coarse.has(attribute) && !fine.has(attribute);
    if (!isFine && coarse.has(attribute)) {
      // Same attribute twice (e.g. two "Strobe" channels): keep both channels under distinct custom attributes.
      const base = `custom:${slug(name).slice(0, 26)}`;
      attribute = base;
      for (let n = 2; coarse.has(attribute); n++) attribute = `${base}-${n}`;
    }
    (isFine ? fine : coarse).add(attribute);
    const ranges = dedupeRanges(objs(c.ranges, 64).flatMap((r): ChannelRange[] => {
      const a = int(r.from, -1), b = int(r.to, -1);
      if (a < 0 || b < 0) { count.dropped++; return []; }
      const kind = (RANGE_KINDS as readonly string[]).includes(r.kind as string) ? (r.kind as ChannelRange['kind']) : 'other';
      const from = Math.min(a, b), to = Math.max(a, b);
      return [{ from, to, label: text(r.label, 64, `${from}-${to}`), kind, dangerous: DANGEROUS.has(kind) }];
    }));
    return { name, attribute, fine: isFine, default: int(c.default, 0), ranges };
  });
  return { name: text(m.name, 48, `${channels.length} canaux`), channels };
}

/** Repairs a model answer into a schema-valid profile (null when no channel table was read). */
export function parsePhotoProfile(raw: unknown): PhotoProfile {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const count = { dropped: 0 };
  const summary = text(r.summary, 1000, 'Profil lu depuis la photo');
  const modes: FixtureMode[] = [];
  for (const m of objs(r.modes, 32)) {
    const mode = repairMode(m, count);
    if (!mode) { count.dropped++; continue; }
    // Patched fixtures reference their mode by name: names must be unique.
    let name = mode.name;
    for (let n = 2; modes.some((x) => x.name === name); n++) name = `${mode.name.slice(0, 42)} (${n})`;
    modes.push({ ...mode, name });
  }
  if (!modes.length) return { profile: null, summary, dropped: count.dropped };
  const manufacturer = text(r.manufacturer, 80, 'Inconnu');
  const name = text(r.name, 80, 'Machine (photo)');
  const type = (FIXTURE_TYPES as readonly string[]).includes(r.type as string) ? r.type : 'other';
  const profile = profileSchema.parse({ id: `photo-${slug(manufacturer)}-${slug(name)}`.slice(0, 64), name, manufacturer, type, modes });
  return { profile, summary, dropped: count.dropped };
}

/** Sends the manual page photo(s) (data URLs) to a vision model and returns the repaired profile, unsaved. */
export async function profileFromPhotoWithOpenRouter(images: readonly string[], opts: OpenRouterOptions): Promise<PhotoProfile & { model: string; notices: string[] }> {
  const r = await visionJson(PROFILE_SYSTEM, 'Transcribe the DMX channel chart of this fixture.', images, 'profile_from_photo', PROFILE_JSON_SCHEMA, opts);
  return { ...parsePhotoProfile(r.json), model: r.model, notices: r.notices };
}
