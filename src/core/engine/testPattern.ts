/**
 * Raw DMX test patterns for the hardware validation campaign (docs/HARDWARE.md). They replace the computed frame of
 * the chosen universes, bypassing fixtures, profiles, master and blackout: meant for a DMX tester or a node's
 * monitor page, never for a rig with people around (every channel can be driven, reset and lamp channels included).
 */
export type TestPatternKind = 'signature' | 'walk' | 'ramp' | 'zero';

export interface TestPattern {
  kind: TestPatternKind;
  /** Local universes overridden; the others keep the show. */
  universes: number[];
  /** Engine time (ms) when the pattern started. */
  startedAt: number;
}

/** Channel walk: one channel at full, advancing every WALK_STEP_MS. */
export const WALK_STEP_MS = 500;
/** Ramp period: all channels together 0 → 255 → 0. */
export const RAMP_PERIOD_MS = 10_000;

/** Signature value of a channel (1..512): readable on a tester, distinct from its neighbours. */
export const signatureValue = (channel: number): number => channel % 256;

export function fillTestPattern(kind: TestPatternKind, frame: Uint8Array, elapsedMs: number): void {
  switch (kind) {
    case 'zero':
      frame.fill(0);
      return;
    case 'signature':
      for (let i = 0; i < 512; i++) frame[i] = signatureValue(i + 1);
      return;
    case 'walk': {
      frame.fill(0);
      frame[Math.floor(Math.max(0, elapsedMs) / WALK_STEP_MS) % 512] = 255;
      return;
    }
    case 'ramp': {
      const phase = (Math.max(0, elapsedMs) % RAMP_PERIOD_MS) / RAMP_PERIOD_MS;
      frame.fill(Math.round((phase < 0.5 ? phase * 2 : 2 - phase * 2) * 255));
      return;
    }
  }
}
