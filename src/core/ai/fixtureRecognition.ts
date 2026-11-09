import { z } from 'zod';
import { FIXTURE_TYPES, type FixtureType } from '../model/schemas';
import { visionJson } from './sceneFromPhoto';
import type { OpenRouterOptions } from './providers/openrouter';

export interface RecognitionCandidate {
  fixtureId: string;
  name: string;
  manufacturer: string;
  model: string;
  type: FixtureType;
  universe: number;
  address: number;
  dimensions?: { width: number; height: number; depth: number };
}

const llmSchema = z.object({
  summary: z.string(),
  observations: z.array(z.object({
    imageIndex: z.number().int(),
    label: z.string(),
    observedType: z.enum(FIXTURE_TYPES),
    manufacturerGuess: z.string(),
    modelGuess: z.string(),
    mountGuess: z.enum(['hanging', 'floor', 'wall', 'unknown']),
    supportHint: z.string(),
    bbox: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
    suggestedFixtureId: z.string().nullable(),
    matchConfidence: z.number(),
    evidence: z.string(),
  })),
});
const JSON_SCHEMA = z.toJSONSchema(llmSchema);

const SYSTEM = `You are a senior stage-lighting technician performing visual inventory of a real lighting rig from venue photographs.
Return ONE JSON object only, matching the supplied JSON Schema.
Identify physical lighting fixtures (the housings), not their projected beams, reflections, screens, trusses, cables or people.
For each visible fixture:
- Give a normalized bounding box (x,y,width,height in 0..1, origin top-left) tightly around the physical fixture body.
- Classify only with the closest supported type: ${FIXTURE_TYPES.join(', ')}.
- Read manufacturer/model only when visible or visually distinctive; otherwise use an empty string. Never invent a precise model from a generic silhouette.
- Estimate mount as hanging/floor/wall/unknown. Give a supportHint only when a support is actually visible.
- Match to one candidate fixtureId ONLY when the image provides meaningful evidence (distinctive body/model, readable label, or clear one-to-one evidence). The candidate IDs below are the complete allowed set. Never invent IDs. When uncertain, return null.
- matchConfidence is a cautious 0..1 estimate for the proposed patch match, not for object detection. Similar-looking fixtures must remain unmatched rather than being forced to a candidate.
- evidence: short French explanation of visible clues and match reasoning.
- imageIndex is the zero-based index of the photo in the request.
Do not infer exact stage coordinates, mounting height, pan/tilt orientation or DMX address from pixels. Those require calibrated measurement or operator input.
Include every clearly visible lighting fixture, but do not hallucinate occluded or ambiguous objects. Summary in French.`;

export interface FixtureRecognitionObservation {
  imageIndex: number;
  label: string;
  observedType: FixtureType;
  manufacturerGuess: string;
  modelGuess: string;
  mountGuess: 'hanging' | 'floor' | 'wall' | 'unknown';
  supportHint: string;
  bbox: { x: number; y: number; width: number; height: number };
  suggestedFixtureId: string | null;
  matchConfidence: number;
  evidence: string;
}

export interface FixtureRecognitionResult {
  summary: string;
  observations: FixtureRecognitionObservation[];
  candidates: RecognitionCandidate[];
  dropped: number;
}

const short = (v: unknown, max: number, fallback = '') =>
  typeof v === 'string' ? v.trim().slice(0, max) : fallback;
const unit = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;

export function parseFixtureRecognition(raw: unknown, candidates: RecognitionCandidate[], imageCount: number): FixtureRecognitionResult {
  const parsed = llmSchema.safeParse(raw);
  if (!parsed.success) throw new Error('La réponse de reconnaissance visuelle ne respecte pas le format attendu.');
  const allowed = new Map(candidates.map((candidate) => [candidate.fixtureId, candidate]));
  let dropped = 0;
  const observations = parsed.data.observations.slice(0, 128).flatMap((item): FixtureRecognitionObservation[] => {
    const b = item.bbox;
    if (!Number.isInteger(item.imageIndex) || item.imageIndex < 0 || item.imageIndex >= imageCount
      || ![b.x, b.y, b.width, b.height].every(Number.isFinite) || b.width <= 0 || b.height <= 0) {
      dropped++;
      return [];
    }
    const x = unit(b.x), y = unit(b.y);
    const width = Math.min(unit(b.width), 1 - x), height = Math.min(unit(b.height), 1 - y);
    if (width <= 0 || height <= 0) { dropped++; return []; }
    const candidate = item.suggestedFixtureId ? allowed.get(item.suggestedFixtureId) : undefined;
    const matchConfidence = unit(item.matchConfidence);
    const trustedMatch = candidate && matchConfidence >= 0.55 ? candidate.fixtureId : null;
    return [{
      imageIndex: item.imageIndex,
      label: short(item.label, 80, 'Projecteur détecté'),
      observedType: item.observedType,
      manufacturerGuess: short(item.manufacturerGuess, 80),
      modelGuess: short(item.modelGuess, 80),
      mountGuess: item.mountGuess,
      supportHint: short(item.supportHint, 120),
      bbox: { x, y, width, height },
      suggestedFixtureId: trustedMatch ?? null,
      matchConfidence: trustedMatch ? matchConfidence : 0,
      evidence: short(item.evidence, 500, 'Aucun indice distinctif fourni.'),
    }];
  });
  return {
    summary: short(parsed.data.summary, 1000, 'Analyse visuelle terminée.'),
    observations,
    candidates,
    dropped: dropped + Math.max(0, parsed.data.observations.length - 128),
  };
}

export async function recognizeFixturesFromPhotos(
  images: readonly string[],
  candidates: RecognitionCandidate[],
  opts: OpenRouterOptions,
): Promise<FixtureRecognitionResult & { model: string; notices: string[] }> {
  if (!images.length || images.length > 6) throw new Error('Fournissez entre 1 et 6 photos.');
  const safeCandidates = candidates.slice(0, 256);
  const request = `Photos à analyser : ${images.length}. Candidats du patch DMX (ne jamais inventer d'autres identifiants) :\n${JSON.stringify(safeCandidates)}\nDétecte les appareils visibles et propose uniquement les correspondances justifiées.`;
  const response = await visionJson(SYSTEM, request, images, 'fixture_visual_recognition', JSON_SCHEMA, opts);
  return { ...parseFixtureRecognition(response.json, safeCandidates, images.length), model: response.model, notices: response.notices };
}
