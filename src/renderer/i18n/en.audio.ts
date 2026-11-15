import type { frAudio } from './fr.audio';

/** English catalogue of the Audio Reactive page additions, typed against fr.audio.ts. */
export const enAudio: Record<keyof typeof frAudio, string> = {
  'audio.system': 'PC audio',
  'audio.system.hint': 'Analyses the sound played by the computer’s speakers (Spotify, browser…)',
  'audio.state.system': 'PC audio',
  'audio.autoGain': 'Automatic gain',
  'audio.autoGain.hint': 'Normalises the input level: lights react the same whether the sound is quiet or loud.',
  'audio.remembered': 'Source remembered: restarted at next launch.',
  'audio.spectrum': 'Spectrum',
  'audio.spectrum.none': 'No real input',
  'audio.presets': 'Presets',
  'audio.presets.hint': 'Sets the continuous reactions on every group; cue GOs are left unchanged.',
  'audio.presets.noGroups': 'Create a group to use the presets',
  'audio.preset.club': 'Club',
  'audio.preset.concert': 'Concert',
  'audio.preset.ambient': 'Ambient',
  'audio.preset.off': 'All off',
};
