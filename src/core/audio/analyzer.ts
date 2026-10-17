/**
 * Audio feature extraction from per-hop measurements (RMS + low-band energy).
 * Pure and deterministic: the renderer feeds frames from the Web Audio API, tests feed synthetic frames.
 * BPM and "energy rise" are ESTIMATES (onset-interval histogram / energy ratio), not musical structure analysis.
 */

export interface AudioFrame {
  /** seconds */
  t: number;
  /** RMS of the time-domain block, 0..1 */
  rms: number;
  /** mean low-band (≈ <150 Hz) magnitude, 0..1 */
  bass: number;
}

export interface AudioFeatures {
  t: number;
  level: number; // 0..1 after sensitivity
  levelDb: number;
  energy: number; // smoothed 0..1
  onset: boolean;
  onsetStrength: number;
  bpm: number | null;
  bpmConfidence: number; // 0..1
  energyRise: boolean;
}

export interface AnalyzerOptions {
  sensitivity: number;
  smoothing: number; // 0..1
  onsetThreshold: number; // multiple of the adaptive mean
  riseRatio: number;
}

export class AudioAnalyzer {
  private prevBass = 0;
  private novelty: { t: number; v: number }[] = [];
  private onsets: number[] = [];
  private lastOnset = -Infinity;
  private energy = 0;
  private shortE = 0;
  private longE = 0;
  private riseArmed = true;
  private lastT: number | null = null;

  constructor(public opts: AnalyzerOptions) {}

  push(f: AudioFrame): AudioFeatures {
    const dt = this.lastT === null ? 1 / 60 : Math.max(1e-3, f.t - this.lastT);
    this.lastT = f.t;
    const level = Math.min(1, f.rms * this.opts.sensitivity * 2);
    const levelDb = f.rms > 0 ? 20 * Math.log10(f.rms) : -120;
    const a = Math.min(0.99, Math.max(0, this.opts.smoothing));
    this.energy = this.energy * a + level * (1 - a);

    // Onset detection: positive low-band flux above an adaptive (1 s) mean.
    const nov = Math.max(0, f.bass - this.prevBass);
    this.prevBass = f.bass;
    this.novelty.push({ t: f.t, v: nov });
    while (this.novelty.length && this.novelty[0]!.t < f.t - 1) this.novelty.shift();
    const mean = this.novelty.reduce((s, x) => s + x.v, 0) / this.novelty.length;
    const threshold = mean * this.opts.onsetThreshold + 0.01 / this.opts.sensitivity;
    const onset = nov > threshold && f.t - this.lastOnset > 0.1;
    if (onset) {
      this.lastOnset = f.t;
      this.onsets.push(f.t);
    }
    while (this.onsets.length && this.onsets[0]! < f.t - 8) this.onsets.shift();

    // Energy rise: short (0.5 s) vs long (8 s) energy, with hysteresis.
    this.shortE += (level - this.shortE) * Math.min(1, dt / 0.5);
    this.longE += (level - this.longE) * Math.min(1, dt / 8);
    const ratio = this.longE > 0.01 ? this.shortE / this.longE : 0;
    let energyRise = false;
    if (this.riseArmed && ratio > this.opts.riseRatio && this.shortE > 0.1) {
      energyRise = true;
      this.riseArmed = false;
    } else if (ratio < 1.1) this.riseArmed = true;

    const { bpm, confidence } = estimateBpm(this.onsets);
    return { t: f.t, level, levelDb, energy: this.energy, onset, onsetStrength: threshold > 0 ? nov / threshold : 0, bpm, bpmConfidence: confidence, energyRise };
  }
}

/** Tempo estimate from inter-onset intervals folded into 70..180 BPM. */
export function estimateBpm(onsets: readonly number[]): { bpm: number | null; confidence: number } {
  if (onsets.length < 4) return { bpm: null, confidence: 0 };
  const scores = new Map<number, number>();
  let total = 0;
  for (let i = 0; i < onsets.length; i++) {
    for (let j = i + 1; j < Math.min(onsets.length, i + 5); j++) {
      const ioi = onsets[j]! - onsets[i]!;
      if (ioi < 0.25 || ioi > 2.5) continue;
      let bpm = 60 / ioi;
      while (bpm < 70) bpm *= 2;
      while (bpm > 180) bpm /= 2;
      const w = 1 / (j - i); // nearer neighbours weigh more
      for (let b = Math.floor(bpm) - 2; b <= Math.ceil(bpm) + 2; b++) {
        const s = w * Math.exp(-((b - bpm) ** 2) / 2);
        scores.set(b, (scores.get(b) ?? 0) + s);
        total += s;
      }
    }
  }
  if (!total) return { bpm: null, confidence: 0 };
  let best = 0, bestScore = 0;
  for (const [b, s] of scores) if (s > bestScore) { best = b; bestScore = s; }
  // Confidence: share of votes within ±2 BPM of the winner.
  let near = 0;
  for (const [b, s] of scores) if (Math.abs(b - best) <= 2) near += s;
  return { bpm: best, confidence: Math.min(1, near / total) };
}

/** Synthetic kick-drum track for tests and the "simulated source" mode. */
export function simulateFrames(opts: { bpm: number; seconds: number; fps?: number; seed?: number; level?: number }): AudioFrame[] {
  const fps = opts.fps ?? 60;
  const frames: AudioFrame[] = [];
  const beat = 60 / opts.bpm;
  let s = opts.seed ?? 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const lvl = opts.level ?? 0.5;
  for (let i = 0; i < opts.seconds * fps; i++) {
    const t = i / fps;
    const sinceBeat = t % beat;
    const kick = Math.exp(-sinceBeat * 18);
    frames.push({ t, rms: lvl * (0.35 + 0.65 * kick) + rnd() * 0.02, bass: Math.min(1, 0.9 * kick + rnd() * 0.03) });
  }
  return frames;
}
