import { z } from 'zod';
import { propSchema, screenSchema, trussSchema, trussShapeSchema, type StageProp, type StageScreen, type Truss } from '../model/schemas';
import { clamp } from '../util/math';
import { completeJson, OpenRouterError, type OpenRouterOptions } from './providers/openrouter';

/**
 * Photo → scene: a vision model reads a photo of a real stage and describes its structures (trusses, totems, set
 * pieces, screens) in stage coordinates; the answer is repaired and validated element by element before use.
 */

const PROP_KINDS = propSchema.shape.kind.options;

const llmPhotoSchema = z.object({
  summary: z.string(),
  stageWidth: z.number(),
  stageDepth: z.number(),
  trusses: z.array(z.object({ name: z.string(), shape: trussShapeSchema, x: z.number(), y: z.number(), height: z.number(), length: z.number(), rotation: z.number(), support: z.enum(['towers', 'hung', 'none']) })),
  props: z.array(z.object({ name: z.string(), kind: z.enum(PROP_KINDS), x: z.number(), y: z.number(), width: z.number(), depth: z.number(), height: z.number(), elevation: z.number(), rotation: z.number(), color: z.string() })),
  screens: z.array(z.object({ name: z.string(), x: z.number(), y: z.number(), elevation: z.number(), width: z.number(), height: z.number(), rotation: z.number(), color: z.string() })),
});
const PHOTO_JSON_SCHEMA = z.toJSONSchema(llmPhotoSchema);

const PHOTO_SYSTEM = `You are a stage technician. From ONE photo of a stage or event venue, you rebuild its physical structure for a 3D lighting visualizer.
Answer with ONE JSON object only (no prose, no code fence) matching this JSON Schema:
${JSON.stringify(PHOTO_JSON_SCHEMA)}
Coordinates (meters): x = 0 at the stage centre, negative = left side of the photo, positive = right side; y = 0 at the front edge of the stage, positive = towards the back wall (a front truss over the audience has a negative y). Estimate real sizes from usual references (a person ≈ 1.75 m, a truss section ≈ 0.3 m wide, a door ≈ 2 m).
- stageWidth / stageDepth: size of the stage floor.
- trusses: every truss, pipe or bar visible. shape: line (straight, length = span; rotation 0 = parallel to the front edge, 90 = running front to back), circle (length = diameter), square (length = side), corner/tee/cross (junction pieces, length = arm length), totem (vertical tower standing alone, height = its height, length 0.5). height = height of the truss axis above the floor. support: towers (ground supported), hung (motors from the ceiling), none (part of a larger assembly).
- props: risers, stairs, speakers, stage monitors, mic stands, tables, drapes/curtains, boxes, columns. elevation = height of its bottom above the floor. color "#RRGGBB".
- screens: LED walls or projection screens; elevation = height of the bottom edge, color = dominant colour "#RRGGBB".
Only include what you actually see; skip people, lights and fixtures. "summary": one or two sentences in French describing what you rebuilt.`;

export interface PhotoScene {
  stageWidth: number;
  stageDepth: number;
  trusses: Truss[];
  props: StageProp[];
  screens: StageScreen[];
  summary: string;
  /** Elements dropped because they could not be repaired into a valid element. */
  dropped: number;
}

const num = (x: unknown, lo: number, hi: number, fallback: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(clamp(x, lo, hi) * 100) / 100 : fallback);
const str = (x: unknown, fallback: string) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, 80) : fallback);
const color = (x: unknown, fallback: string) => (typeof x === 'string' && /^#[0-9a-fA-F]{6}$/.test(x) ? x : fallback);
const list = (x: unknown, max: number): Record<string, unknown>[] => (Array.isArray(x) ? x.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object').slice(0, max) : []);

/** Repairs a model answer (numbers clamped, missing fields defaulted) into schema-valid elements; ids come from `id`. */
export function parsePhotoScene(raw: unknown, id: () => string): PhotoScene {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  let dropped = 0;
  const keep = <T>(schema: z.ZodType<T>, el: unknown): T[] => {
    const p = schema.safeParse(el);
    if (p.success) return [p.data];
    dropped++;
    return [];
  };
  const trusses = list(r.trusses, 64).flatMap((t, i) => keep(trussSchema, {
    id: id(), name: str(t.name, `Structure ${i + 1}`), shape: t.shape,
    x: num(t.x, -100, 100, 0), y: num(t.y, -100, 100, 0), height: num(t.height, 0.5, 30, 6),
    length: num(t.length, 0.5, 60, 0.5), rotation: num(t.rotation, -360, 360, 0), support: t.support ?? 'towers',
  }));
  const props = list(r.props, 256).flatMap((p, i) => keep(propSchema, {
    id: id(), name: str(p.name, `Décor ${i + 1}`), kind: p.kind,
    x: num(p.x, -100, 100, 0), y: num(p.y, -100, 100, 0), width: num(p.width, 0.05, 40, 1), depth: num(p.depth, 0.05, 40, 1),
    height: num(p.height, 0.05, 20, 1), elevation: num(p.elevation, 0, 20, 0), rotation: num(p.rotation, -360, 360, 0), color: color(p.color, '#2a2f3a'),
  }));
  const screens = list(r.screens, 16).flatMap((s, i) => keep(screenSchema, {
    id: id(), name: str(s.name, `Écran ${i + 1}`), x: num(s.x, -100, 100, 0), y: num(s.y, -100, 100, 0),
    elevation: num(s.elevation, 0, 30, 1), width: num(s.width, 0.2, 60, 4), height: num(s.height, 0.2, 30, 2.5),
    rotation: num(s.rotation, -360, 360, 0), source: 'color', color: color(s.color, '#1e3a8a'), image: null, glow: 0.5,
  }));
  return {
    stageWidth: num(r.stageWidth, 2, 200, 12), stageDepth: num(r.stageDepth, 2, 200, 8),
    trusses, props, screens, summary: (typeof r.summary === 'string' && r.summary.trim() ? r.summary.trim() : 'Scène reconstruite depuis la photo').slice(0, 1000), dropped,
  };
}

/** Sends the photo (data URL) to a vision model and returns the validated scene. */
export async function sceneFromPhotoWithOpenRouter(image: string, opts: OpenRouterOptions, id: () => string): Promise<PhotoScene & { model: string; notices: string[] }> {
  const user = [
    { type: 'text', text: 'Rebuild the structures of this stage.' },
    { type: 'image_url', image_url: { url: image } },
  ];
  let r: Awaited<ReturnType<typeof completeJson>>;
  try {
    r = await completeJson(PHOTO_SYSTEM, user, 'stage_from_photo', PHOTO_JSON_SCHEMA, opts);
  } catch (err) {
    // Text-only models reject image parts with a 4xx: say which setting to change.
    if (err instanceof OpenRouterError && (err.status === 400 || err.status === 404)) throw new OpenRouterError(`${err.message} — choisissez un modèle compatible avec les images (vision) dans Paramètres › IA`, err.status);
    throw err;
  }
  return { ...parsePhotoScene(r.json, id), model: r.model, notices: r.notices };
}
