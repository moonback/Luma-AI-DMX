import type { FixtureType } from '../../model/schemas';
import type { AiEffectSpec, AiTarget, LookPart } from '../actions';

/* Built-in templates of the local interpreter: named moods and the show / sequence sections. */

export const MOVING: FixtureType[] = ['moving-head-spot', 'moving-head-wash'];
export const MOVING_TARGET: AiTarget = { fixtureTypes: MOVING };
export const ALL: AiTarget = { all: true };

/**
 * Named moods: « ambiance rock », « ambiance coucher de soleil »… (colours, level, scene name). Only the first three
 * apply on their own (« lounge », « club »); the others need a lighting word, so « un poème sur l’océan » stays off-topic.
 */
export const MOODS: { re: RegExp; colors: string[]; level: number; name: string; standalone?: boolean }[] = [
  { re: /\b(lounge|chill|cosy|cozy|tamise\w*)\b/, colors: ['#8B00FF', '#0040FF'], level: 0.55, name: 'lounge', standalone: true },
  { re: /\b(club|fete|party|dancefloor|boite)\b/, colors: ['#FF00C8', '#00E5FF'], level: 0.9, name: 'club', standalone: true },
  { re: /\b(romanti\w*|diner|intime)\b/, colors: ['#FFB000', '#FF4FA0'], level: 0.5, name: 'intime', standalone: true },
  { re: /\b(rock|metal|concert)\b/, colors: ['#FF0000', '#FFFFFF'], level: 0.9, name: 'rock' },
  { re: /\b(theatre|discours|conference|allocution)\b/, colors: ['#FFE2B8'], level: 0.6, name: 'théâtre' },
  { re: /\b(mysteri\w*|inquietant\w*|sombre|angoiss\w*|mystery)\b/, colors: ['#4B0082', '#0040FF'], level: 0.35, name: 'mystère' },
  { re: /\b(coucher de soleil|lever de soleil|sunset|sunrise|crepuscule)\b/, colors: ['#FF7000', '#FF4FA0'], level: 0.7, name: 'coucher de soleil' },
  { re: /\b(sous[ -]marin\w*|ocean\w*|aquatique|underwater)\b/, colors: ['#0040FF', '#00E5FF'], level: 0.55, name: 'sous-marine' },
  { re: /\b(glaciale?|glace|hiver\w*|banquise|icy)\b/, colors: ['#9FD8FF', '#FFFFFF'], level: 0.6, name: 'glaciale' },
  { re: /\b(feu de camp|braises?|campfire|cheminee)\b/, colors: ['#FF7000', '#FF0000'], level: 0.5, name: 'feu de camp' },
  { re: /\b(mariage|bal|wedding)\b/, colors: ['#FFB000', '#FF4FA0'], level: 0.6, name: 'mariage' },
  { re: /\bhalloween\b/, colors: ['#FF7000', '#8B00FF'], level: 0.5, name: 'halloween' },
  { re: /\b(noel|christmas)\b/, colors: ['#FF0000', '#00FF40'], level: 0.7, name: 'Noël' },
];

export function effectSpec(name: string, effectType: AiEffectSpec['effectType'], target: AiTarget, extra: Partial<AiEffectSpec> = {}): AiEffectSpec {
  return { name, effectType, target, ...extra };
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

export interface Section { name: string; share: number; colors: string[]; level: number; effects: (allowStrobe: boolean) => AiEffectSpec[] }

export const ELECTRO_SECTIONS: Section[] = [
  { name: 'Intro', share: 0.15, colors: ['#0040FF', '#8B00FF'], level: 0.4, effects: () => [effectSpec('Intro · vague douce', 'dimmerWave', ALL, { speed: 0.1, phaseSpread: 0.6, offset: 0.55, amplitude: 0.5 })] },
  { name: 'Montée', share: 0.15, colors: ['#8B00FF', '#FF00C8'], level: 0.7, effects: () => [effectSpec('Montée · pulse', 'pulse', ALL, { bpmSync: true, beatsPerCycle: 1, offset: 0.6, amplitude: 0.8 }), effectSpec('Montée · cercle', 'panTilt', MOVING_TARGET, { bpmSync: true, beatsPerCycle: 8, amplitude: 0.4 })] },
  { name: 'Drop 1', share: 0.2, colors: ['#00E5FF', '#FFFFFF'], level: 1, effects: (s) => [effectSpec('Drop · chase', 'chase', ALL, { bpmSync: true, beatsPerCycle: 1, offset: 0.5, amplitude: 1 }), effectSpec('Drop · mouvement', 'panTilt', MOVING_TARGET, { bpmSync: true, beatsPerCycle: 4, amplitude: 0.6 }), ...(s ? [effectSpec('Drop · strobe', 'strobe', { fixtureTypes: ['strobe'] }, { speed: 8 })] : [])] },
  { name: 'Break', share: 0.15, colors: ['#0040FF'], level: 0.35, effects: () => [effectSpec('Break · respiration', 'fade', ALL, { speed: 0.125, offset: 0.4, amplitude: 0.5 })] },
  { name: 'Montée 2', share: 0.1, colors: ['#FF00C8', '#FF7000'], level: 0.75, effects: () => [effectSpec('Montée 2 · pulse', 'pulse', ALL, { bpmSync: true, beatsPerCycle: 0.5, offset: 0.6, amplitude: 0.8 })] },
  { name: 'Drop 2', share: 0.2, colors: ['#FF0000', '#FFFFFF'], level: 1, effects: (s) => [effectSpec('Drop 2 · arc-en-ciel', 'rainbow', ALL, { bpmSync: true, beatsPerCycle: 8, phaseSpread: 1 }), effectSpec('Drop 2 · mouvement aléatoire', 'randomMove', MOVING_TARGET, { bpmSync: true, beatsPerCycle: 2, amplitude: 0.7 }), ...(s ? [effectSpec('Drop 2 · strobe', 'strobe', { fixtureTypes: ['strobe'] }, { speed: 10 })] : [])] },
  { name: 'Outro', share: 0.05, colors: ['#8B00FF'], level: 0.2, effects: () => [] },
];

export const SOFT_SECTIONS: Section[] = [
  { name: 'Ouverture', share: 0.25, colors: ['#8B00FF', '#0040FF'], level: 0.45, effects: () => [effectSpec('Ouverture · vague', 'dimmerWave', ALL, { speed: 0.08, phaseSpread: 0.8, offset: 0.5, amplitude: 0.4 })] },
  { name: 'Cœur', share: 0.35, colors: ['#FFB000', '#FF4FA0'], level: 0.6, effects: () => [effectSpec('Cœur · cycle couleurs', 'colorCycle', ALL, { speed: 0.03, colors: ['#FFB000', '#FF4FA0', '#8B00FF'], phaseSpread: 0.5 })] },
  { name: 'Envolée', share: 0.25, colors: ['#00E5FF', '#8B00FF'], level: 0.75, effects: () => [effectSpec('Envolée · balayage', 'panTilt', MOVING_TARGET, { speed: 0.05, shape: 'pan', amplitude: 0.5 })] },
  { name: 'Final', share: 0.15, colors: ['#FFB000'], level: 0.3, effects: () => [] },
];

export function lookFromColors(colors: string[], level: number, target: AiTarget = ALL): LookPart[] {
  return [{ target, colors, level }];
}
