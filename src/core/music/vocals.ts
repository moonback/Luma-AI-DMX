import { BAND_HI, BAND_LO, cosine, median, N_BANDS } from './dsp';

/** Shortest stretch kept: a follow-spot cue shorter than that would flicker on instrumental fills. */
const MIN_SECONDS = 4;

/**
 * Voice presence estimate: share of the 300 Hz–3 kHz bands in the energy above 150 Hz (where the voice sits on top
 * of the accompaniment) and harmonic stability (concentrated chroma that holds from frame to frame), both smoothed
 * over ~1 s and compared with the song's own median, so a pad or a guitar present all along does not count.
 * shortcut: signal rules, not a trained voice detector (a lead synth in the same register also counts); upgrade to a
 * model if follow-spot cues land on instrumentals.
 */
export function detectVocals(bands: readonly Float32Array[], chroma: readonly Float32Array[], rms: Float32Array, fr: number, offset: number): { t: number; duration: number }[] {
  const n = bands.length;
  if (n < fr * 4) return [];
  const centre = (b: number) => BAND_LO * (BAND_HI / BAND_LO) ** ((b + 0.5) / N_BANDS);
  const voiceBand = Array.from({ length: N_BANDS }, (_, b) => centre(b) >= 300 && centre(b) <= 3000);
  const aboveBass = Array.from({ length: N_BANDS }, (_, b) => centre(b) >= 150);
  const presence = new Float32Array(n), harmony = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0, all = 0;
    for (let b = 0; b < N_BANDS; b++) {
      if (!aboveBass[b]) continue;
      const p = Math.expm1(bands[i]![b]!);
      all += p;
      if (voiceBand[b]) v += p;
    }
    presence[i] = all > 0 ? v / all : 0;
    const c = chroma[i]!;
    let max = 0, sum = 0;
    for (let k = 0; k < 12; k++) { max = Math.max(max, c[k]!); sum += c[k]!; }
    const tonal = sum > 0 ? (max / (sum / 12) - 1) / 11 : 0;
    harmony[i] = i ? tonal * cosine(chroma[i - 1]!, c) : 0;
  }
  const w = Math.max(1, Math.round(fr / 2));
  const smooth = (x: Float32Array) => {
    const out = new Float32Array(n);
    let acc = 0;
    for (let i = 0; i < n + w; i++) {
      if (i < n) acc += x[i]!;
      if (i - 2 * w - 1 >= 0) acc -= x[i - 2 * w - 1]!;
      const c = i - w;
      if (c >= 0 && c < n) out[c] = acc / (Math.min(i, n - 1) - Math.max(0, i - 2 * w) + 1);
    }
    return out;
  };
  const ps = smooth(presence), hs = smooth(harmony);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, rms[i]!);
  const sounding = (i: number) => rms[i]! > 0.05 * peak;
  const live = Array.from({ length: n }, (_, i) => i).filter(sounding);
  const pMed = median(live.map((i) => ps[i]!)), hMed = median(live.map((i) => hs[i]!));
  const on = (i: number) => sounding(i) && ps[i]! > pMed * 1.1 && hs[i]! > hMed * 1.2;
  // Segments of at least MIN_SECONDS, gaps under 1 s bridged (breaths between phrases).
  const out: { t: number; duration: number }[] = [];
  let start = -1, last = -1;
  const flush = () => { if (start >= 0 && (last - start + 1) / fr >= MIN_SECONDS) out.push({ t: start / fr + offset, duration: (last - start + 1) / fr }); };
  for (let i = 0; i < n; i++) {
    if (!on(i)) continue;
    if (start >= 0 && (i - last) / fr > 1) { flush(); start = -1; }
    if (start < 0) start = i;
    last = i;
  }
  flush();
  return out;
}
