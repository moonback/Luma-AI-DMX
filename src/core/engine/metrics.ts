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

/** Fixed-capacity sample window: insertion and memory are bounded independently of show duration. */
export class RollingPercentileWindow {
  private readonly samples: number[] = [];
  private cursor = 0;

  constructor(readonly capacity = 512) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity must be a positive integer');
  }

  push(value: number): void {
    if (!Number.isFinite(value)) return;
    if (this.samples.length < this.capacity) {
      this.samples.push(value);
      return;
    }
    this.samples[this.cursor] = value;
    this.cursor = (this.cursor + 1) % this.capacity;
  }

  get count(): number {
    return this.samples.length;
  }

  percentile(p: number): number | null {
    return percentile(this.samples, p);
  }
}
