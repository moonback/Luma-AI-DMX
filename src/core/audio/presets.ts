import type { AudioReactions } from '../model/schemas';

export const AUDIO_PRESETS = ['club', 'concert', 'ambient', 'festival', 'theatre', 'edm', 'live', 'off'] as const;
export type AudioPreset = (typeof AUDIO_PRESETS)[number];

/**
 * One-click set of light reactions, targeting the given groups. The cue-list reactions (energy-rise GO, drop GO)
 * and the user's colours are kept as they are: a preset only switches and tunes the continuous reactions.
 */
export function applyAudioPreset(r: AudioReactions, preset: AudioPreset, groupIds: string[]): AudioReactions {
  const targets = { fixtureIds: [], groupIds };
  const on = (enabled: boolean) => ({ enabled, targets });
  const p = {
    club: { bpm: true, flash: 0.2, level: null, color: true, bass: 0.8, bright: false, move: 0.6 },
    concert: { bpm: true, flash: null, level: 0.35, color: false, bass: null, bright: true, move: 0.3 },
    ambient: { bpm: false, flash: null, level: 0.5, color: true, bass: null, bright: false, move: null },
    festival: { bpm: true, flash: 0.3, level: null, color: true, bass: 0.9, bright: true, move: 0.7 },
    theatre: { bpm: false, flash: null, level: 0.4, color: true, bass: null, bright: false, move: 0.2 },
    edm: { bpm: true, flash: 0.4, level: null, color: true, bass: 1.0, bright: true, move: 0.8 },
    live: { bpm: true, flash: 0.1, level: 0.4, color: true, bass: 0.7, bright: true, move: 0.5 },
    off: { bpm: false, flash: null, level: null, color: false, bass: null, bright: false, move: null },
  }[preset];
  return {
    ...r,
    ...(preset === 'off' ? { beatChase: { ...r.beatChase, enabled: false }, beatPalette: { ...r.beatPalette, enabled: false } } : {}),
    bpmFollow: { ...r.bpmFollow, enabled: p.bpm },
    beatFlash: { ...r.beatFlash, ...on(p.flash !== null), decay: p.flash ?? r.beatFlash.decay },
    levelToIntensity: { ...r.levelToIntensity, ...on(p.level !== null), floor: p.level ?? r.levelToIntensity.floor },
    energyToColor: { ...r.energyToColor, ...on(p.color) },
    followers: {
      ...r.followers,
      // « Tout couper » also switches off the mid/high followers; the other presets leave them as the user set them.
      ...(preset === 'off' ? { intensityFromMid: { ...r.followers.intensityFromMid, enabled: false }, intensityFromHigh: { ...r.followers.intensityFromHigh, enabled: false } } : {}),
      intensityFromBass: { ...r.followers.intensityFromBass, ...on(p.bass !== null), amount: p.bass ?? r.followers.intensityFromBass.amount },
      colorFromBrightness: { ...r.followers.colorFromBrightness, ...on(p.bright) },
      moveFromOnsets: { ...r.followers.moveFromOnsets, ...on(p.move !== null), amount: p.move ?? r.followers.moveFromOnsets.amount },
    },
  };
}

/**
 * Generates a random audio preset configuration.
 * Each call produces different random values for dynamic, exploratory lighting reactions.
 */
export function generateRandomAudioPreset(): {
  bpm: boolean;
  flash: number | null;
  level: number | null;
  color: boolean;
  bass: number | null;
  bright: boolean;
  move: number | null;
} {
  return {
    bpm: Math.random() > 0.3,
    flash: Math.random() > 0.5 ? Math.random() * 0.4 : null,
    level: Math.random() > 0.5 ? Math.random() * 0.6 : null,
    color: Math.random() > 0.2,
    bass: Math.random() > 0.5 ? Math.random() : null,
    bright: Math.random() > 0.4,
    move: Math.random() > 0.5 ? Math.random() : null,
  };
}
