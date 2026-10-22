import type { SongAnalysis } from '../model/schemas';
import type { CompileResult } from './songToShow';

export interface ShowIntegrityReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates musical, technical and safety integrity of a generated show.
 * Part of Phase 1 verification suite (reproducibility, coherency, safety constraints).
 *
 * Checks:
 *  1. Timeline duration covers the full song.
 *  2. All timeline events reference valid scenes/effects with positive durations and non-negative start times.
 *  3. CueList cue numbers are sequential and reference valid scenes/effects.
 *  4. No strobe effect is present when forbidden; strobe speed does not exceed maxStrobeHz.
 */
export function validateShowIntegrity(
  result: CompileResult,
  analysis: SongAnalysis,
  opts: { allowStrobe?: boolean; maxStrobeHz?: number } = {},
): ShowIntegrityReport {
  const allowStrobe = opts.allowStrobe ?? true;
  const maxStrobeHz = opts.maxStrobeHz ?? 10;
  const errors: string[] = [];
  const warnings: string[] = [];
  const sceneIds = new Set(result.scenes.map((s) => s.id));
  const effectIds = new Set(result.effects.map((e) => e.id));

  // 1. Duration check
  if (result.timeline.duration < Math.floor(analysis.duration)) {
    errors.push(
      `Durée de la timeline (${result.timeline.duration}s) inférieure à la durée du morceau (${analysis.duration}s)`,
    );
  }

  // 2. Timeline events integrity
  for (const ev of result.timeline.events) {
    if (ev.start < 0) {
      errors.push(`Événement ${ev.id} (${ev.label}) avec un temps de départ négatif: ${ev.start}`);
    }
    if (ev.duration <= 0) {
      errors.push(`Événement ${ev.id} (${ev.label}) avec une durée non-positive: ${ev.duration}`);
    }
    if (ev.kind === 'scene' && (!ev.refId || !sceneIds.has(ev.refId))) {
      errors.push(`Événement scène ${ev.id} référence une scène inconnue ${ev.refId}`);
    }
    if (ev.kind === 'effect' && (!ev.refId || !effectIds.has(ev.refId))) {
      errors.push(`Événement effet ${ev.id} référence un effet inconnu ${ev.refId}`);
    }
  }

  // 3. CueList integrity
  for (let k = 0; k < result.cueList.cues.length; k++) {
    const cue = result.cueList.cues[k]!;
    if (cue.number !== k + 1) {
      errors.push(`Cue à l'index ${k} porte le numéro ${cue.number} au lieu de ${k + 1}`);
    }
    if (!cue.sceneId || !sceneIds.has(cue.sceneId)) {
      errors.push(`Cue ${cue.number} (${cue.name}) référence une scène inconnue ${cue.sceneId}`);
    }
    for (const efId of cue.effectIds) {
      if (!effectIds.has(efId)) {
        errors.push(`Cue ${cue.number} référence un effet inconnu ${efId}`);
      }
    }
  }

  // 4. Strobe & photosensitive safety
  for (const ef of result.effects) {
    if (ef.type === 'strobe') {
      if (!allowStrobe) {
        errors.push(`Effet strobe ${ef.id} (${ef.name}) présent alors que le strobe est interdit`);
      }
      const speed = ef.params.speed ?? 1;
      if (speed > maxStrobeHz) {
        errors.push(
          `Effet strobe ${ef.id} avec une vitesse de ${speed} Hz dépassant la limite max de ${maxStrobeHz} Hz`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
