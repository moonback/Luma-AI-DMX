
import { BAND_HI, BAND_LO, cosine, median, N_BANDS } from './dsp';

/** Minimum duration of a detected vocal segment, in seconds. */
const MIN_SECONDS_VOCALS = 1.5;

/** Maximum inactive gap bridged inside a vocal segment, in seconds. */
const MIN_GAP_SECONDS_VOCALS = 0.5;

/** Minimum fraction of the signal peak required to consider a frame audible. */
const MIN_PEAK_RATIO = 0.02;

/** Frequency range used to estimate vocal presence. */
const VOICE_MIN_HZ = 200;
const VOICE_MAX_HZ = 4000;

/** Lower frequency bound for the energy used as the presence denominator. */
const ENERGY_MIN_HZ = 150;

/** Minimum number of active voice-range bands. */
const MIN_ACTIVE_BANDS = 4;

/** Minimum number of frames required for a meaningful estimate. */
const MIN_ANALYSIS_SECONDS = 2;

export type VocalSegment = {
  t: number;
  duration: number;
  confidence?: number;
};

/**
 * Returns a quantile using linear interpolation.
 * Input values are copied so callers' arrays are never mutated.
 */
function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const pos = Math.max(0, Math.min(1, q)) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);

  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/**
 * Centered moving average with clipped boundaries.
 *
 * The prefix sum makes this O(n), independent of window size.
 * At the beginning and end, only existing frames are averaged.
 */
function smooth(input: Float32Array, radius: number): Float32Array {
  const n = input.length;
  const out = new Float32Array(n);
  const prefix = new Float64Array(n + 1);

  for (let i = 0; i < n; i++) {
    prefix[i + 1] = prefix[i]! + input[i]!;
  }

  for (let i = 0; i < n; i++) {
    const left = Math.max(0, i - radius);
    const right = Math.min(n - 1, i + radius);
    out[i] =
      (prefix[right + 1]! - prefix[left]!) / (right - left + 1);
  }

  return out;
}

/**
 * Estimate vocal presence from spectral bands, chroma and RMS.
 *
 * This is a DSP heuristic, not a trained speech/singing classifier.
 * Harmonic instruments can still trigger detections.
 *
 * @param bands Log-scaled spectral magnitudes, one array per frame.
 * @param chroma 12-bin chroma vector, one array per frame.
 * @param rms RMS energy, one value per frame.
 * @param fr Frames per second.
 * @param offset Time offset in seconds applied to returned segments.
 */
export function detectVocals(
  bands: readonly Float32Array[],
  chroma: readonly Float32Array[],
  rms: Float32Array,
  fr: number,
  offset: number,
): VocalSegment[] {
  const n = bands.length;

  if (
    !Number.isFinite(fr) ||
    fr <= 0 ||
    !Number.isFinite(offset) ||
    n < Math.ceil(fr * MIN_ANALYSIS_SECONDS) ||
    chroma.length !== n ||
    rms.length < n
  ) {
    return [];
  }

  // Validate frame dimensions before performing any DSP operations.
  for (let i = 0; i < n; i++) {
    if (
      bands[i]!.length < N_BANDS ||
      chroma[i]!.length < 12
    ) {
      return [];
    }
  }

  const centre = (b: number): number =>
    BAND_LO * Math.pow(BAND_HI / BAND_LO, (b + 0.5) / N_BANDS);

  const voiceBands: number[] = [];
  const energyBands: number[] = [];

  for (let b = 0; b < N_BANDS; b++) {
    const hz = centre(b);

    if (hz >= VOICE_MIN_HZ && hz <= VOICE_MAX_HZ) {
      voiceBands.push(b);
    }

    if (hz >= ENERGY_MIN_HZ) {
      energyBands.push(b);
    }
  }

  if (voiceBands.length < MIN_ACTIVE_BANDS || energyBands.length === 0) {
    return [];
  }

  const presence = new Float32Array(n);
  const harmony = new Float32Array(n);
  const density = new Float32Array(n);
  const validRms = new Float32Array(n);

  let peak = 0;

  // Convert log magnitudes back to linear energy-like values.
  // Invalid and negative magnitudes are treated as zero.
  const linearMagnitude = (value: number): number => {
    if (!Number.isFinite(value) || value <= 0) return 0;

    const result = Math.expm1(value);
    return Number.isFinite(result) && result > 0 ? result : 0;
  };

  for (let i = 0; i < n; i++) {
    const frame = bands[i]!;
    let totalEnergy = 0;
    let voiceEnergy = 0;

    for (const b of energyBands) {
      const energy = linearMagnitude(frame[b]!);
      totalEnergy += energy;

      if (centre(b) >= VOICE_MIN_HZ && centre(b) <= VOICE_MAX_HZ) {
        voiceEnergy += energy;
      }
    }

    // Avoid division by zero on silent frames.
    presence[i] = totalEnergy > 0 ? voiceEnergy / totalEnergy : 0;

    // Count active bands relative to the average energy in the vocal range.
    // The small floor prevents near-silent frames from appearing dense.
    const averageVoiceEnergy =
      voiceBands.length > 0 ? voiceEnergy / voiceBands.length : 0;

    const activeThreshold = Math.max(
      averageVoiceEnergy * 0.15,
      1e-8,
    );

    let activeBands = 0;

    for (const b of voiceBands) {
      if (linearMagnitude(frame[b]!) > activeThreshold) {
        activeBands++;
      }
    }

    density[i] = activeBands;

    const rawRms = rms[i]!;
    validRms[i] =
      Number.isFinite(rawRms) && rawRms > 0 ? rawRms : 0;

    peak = Math.max(peak, validRms[i]!);

    // Chroma concentration: higher values indicate energy concentrated
    // in fewer pitch classes. Temporal similarity rewards stable harmony.
    const c = chroma[i]!;
    let maxChroma = 0;
    let sumChroma = 0;
    let validChroma = true;

    for (let k = 0; k < 12; k++) {
      const value = c[k]!;

      if (!Number.isFinite(value) || value < 0) {
        validChroma = false;
        break;
      }

      maxChroma = Math.max(maxChroma, value);
      sumChroma += value;
    }

    const tonal =
      validChroma && sumChroma > 0
        ? Math.max(0, Math.min(1, (12 * maxChroma / sumChroma - 1) / 11))
        : 0;

    harmony[i] =
      i > 0 && validChroma
        ? tonal * Math.max(0, Math.min(1, cosine(chroma[i - 1]!, c)))
        : 0;
  }

  // An entirely silent or numerically invalid recording has no vocals.
  if (!(peak > 0) || !Number.isFinite(peak)) {
    return [];
  }

  const audibleThreshold = peak * MIN_PEAK_RATIO;
  const liveIndices: number[] = [];

  for (let i = 0; i < n; i++) {
    if (validRms[i]! > audibleThreshold) {
      liveIndices.push(i);
    }
  }

  if (liveIndices.length === 0) {
    return [];
  }

  // Smooth over approximately one second, using a centered window.
  const radius = Math.max(1, Math.round(fr / 2));
  const ps = smooth(presence, radius);
  const hs = smooth(harmony, radius);
  const ds = smooth(density, radius);

  // Estimate song-specific baselines from audible frames only.
  const livePresence = liveIndices.map((i) => ps[i]!);
  const liveHarmony = liveIndices.map((i) => hs[i]!);

  const pMed = median(livePresence);
  const hMed = median(liveHarmony);

  const p75 = quantile(livePresence, 0.75);
  const h75 = quantile(liveHarmony, 0.75);

  // Require a measurable increase over the song's baseline.
  // Absolute floors prevent tiny numerical fluctuations from triggering
  // detections when the baseline is close to zero.
  const presenceThreshold = Math.max(
    pMed * 1.02,
    pMed + Math.max(0.005, (p75 - pMed) * 0.15),
  );

  const harmonyThreshold = Math.max(
    hMed * 1.10,
    hMed + Math.max(0.005, (h75 - hMed) * 0.15),
  );

  const isCandidate = (i: number): boolean =>
    validRms[i]! > audibleThreshold &&
    ps[i]! > presenceThreshold &&
    hs[i]! > harmonyThreshold &&
    ds[i]! >= MIN_ACTIVE_BANDS;

  // Close short gaps before extracting segments. This makes the behavior
  // explicit and prevents short breaths or missed frames splitting a phrase.
  const candidates = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    candidates[i] = isCandidate(i) ? 1 : 0;
  }

  const maxGapFrames = Math.floor(MIN_GAP_SECONDS_VOCALS * fr);

  let i = 0;

  while (i < n) {
    if (candidates[i] !== 0) {
      i++;
      continue;
    }

    const gapStart = i;

    while (i < n && candidates[i] === 0) {
      i++;
    }

    const gapLength = i - gapStart;
    const hasCandidateBefore = gapStart > 0 && candidates[gapStart - 1] === 1;
    const hasCandidateAfter = i < n && candidates[i] === 1;

    if (
      hasCandidateBefore &&
      hasCandidateAfter &&
      gapLength <= maxGapFrames
    ) {
      candidates.fill(1, gapStart, i);
    }
  }

  // Extract segments and apply the minimum duration after gap closing.
  const out: VocalSegment[] = [];
  const minFrames = Math.ceil(MIN_SECONDS_VOCALS * fr);

  i = 0;

  while (i < n) {
    if (candidates[i] === 0) {
      i++;
      continue;
    }

    const start = i;

    while (i < n && candidates[i] === 1) {
      i++;
    }

    const end = i;
    const duration = (end - start) / fr;

    if (end - start >= minFrames) {
      let presSum = 0;
      for (let f = start; f < end; f++) presSum += presence[f] ?? 0;
      const confidence = Math.max(0.1, Math.min(1, (presSum / (end - start)) * 1.5));
      out.push({
        t: start / fr + offset,
        duration,
        confidence: Math.round(confidence * 100) / 100,
      });
    }
  }

  return out;
}
