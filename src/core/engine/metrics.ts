/** Percentile helper for bounded runtime metric windows. Returns null when no sample exists. */
export function percentile(samples: readonly number[], p: number): number | null {
  if (samples.length === 0) return null;
  const sorted = samples.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const rank = Math.max(0, Math.min(100, p)) / 100 * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower]!;
  const weight = rank - lower;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * weight;
}
