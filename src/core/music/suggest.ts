import type { SongAnalysis } from '../model/schemas';

/**
 * Intention phrases suggested from the measured sound of a track (shown under the intention field). Each phrase is one
 * that `parseIntent` already understands, so accepting a suggestion changes the plan exactly as typing it would.
 * Pure: no DOM, no Node API, so the renderer can import it.
 */
export function suggestIntents(analysis: SongAnalysis, max = 5): string[] {
  const secs = analysis.sections;
  if (!secs.length) return [];
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const peaks = secs.filter((s) => s.label === 'chorus' || s.label === 'drop');
  const soft = secs.filter((s) => s.label === 'intro' || s.label === 'verse' || s.label === 'outro');
  const out: string[] = [];
  // Contrast between the soft parts and the peaks: the plan can separate them.
  if (peaks.length && soft.length && mean(peaks.map((s) => s.energy)) - mean(soft.map((s) => s.energy)) >= 0.2) {
    out.push('couplets sobres', 'refrains explosifs');
  }
  if (secs.some((s) => s.label === 'drop')) out.push('strobe sur les drops');
  // Bass-driven song: lights follow the bass.
  if (mean(secs.map((s) => s.bassShare)) >= 0.6) out.push('lumières sur les basses');
  // Key confidence gates the warm / cold choice, as in the local planner.
  if (analysis.key.confidence >= 0.3) out.push(analysis.key.mode === 'minor' ? 'couleurs froides' : 'couleurs chaudes');
  // Busy playing (many onsets per second): more movement.
  if (mean(secs.map((s) => s.density)) >= 3) out.push('beaucoup de mouvement');
  // Quiet overall: calm ambience.
  if (mean(secs.map((s) => s.energy)) < 0.3) out.push('ambiance calme');
  return [...new Set(out)].slice(0, max);
}
