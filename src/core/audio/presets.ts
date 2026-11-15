import type { AudioReactions } from '../model/schemas';

export const AUDIO_PRESETS = ['club', 'concert', 'ambient', 'off'] as const;
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
    off: { bpm: false, flash: null, level: null, color: false, bass: null, bright: false, move: null },
  }[preset];
  return {
    ...r,
    bpmFollow: { ...r.bpmFollow, enabled: p.bpm },
    beatFlash: { ...r.beatFlash, ...on(p.flash !== null), decay: p.flash ?? r.beatFlash.decay },
    levelToIntensity: { ...r.levelToIntensity, ...on(p.level !== null), floor: p.level ?? r.levelToIntensity.floor },
    energyToColor: { ...r.energyToColor, ...on(p.color) },
    followers: {
      intensityFromBass: { ...r.followers.intensityFromBass, ...on(p.bass !== null), amount: p.bass ?? r.followers.intensityFromBass.amount },
      colorFromBrightness: { ...r.followers.colorFromBrightness, ...on(p.bright) },
      moveFromOnsets: { ...r.followers.moveFromOnsets, ...on(p.move !== null), amount: p.move ?? r.followers.moveFromOnsets.amount },
    },
  };
}
