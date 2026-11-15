/**
 * Automatic input gain: brings the program level to TARGET_RMS so the reactions behave the same for a quiet
 * microphone or a loud system output. Works on the input (pre-gain) level, so the gain never chases itself.
 */
export const TARGET_RMS = 0.12;
const MIN_GAIN = 0.25;
const MAX_GAIN = 20;
/** Below this input level: silence, the gain is held (the noise floor is never amplified). */
const SILENCE = 0.002;

export interface AutoGainState {
  gain: number;
  /** Peak-hold of the input RMS, ~4 s release at 60 Hz. */
  peak: number;
}

export function autoGainStep(s: AutoGainState, inputRms: number): AutoGainState {
  // Gate on the instant level: between two songs the peak decays, and the gain must not climb meanwhile.
  if (inputRms < SILENCE) return s;
  const peak = Math.max(inputRms, s.peak * 0.996);
  const want = Math.min(MAX_GAIN, Math.max(MIN_GAIN, TARGET_RMS / peak));
  return { gain: s.gain + (want - s.gain) * 0.05, peak };
}
