/**
 * showPlanner.ts — Local rule-based show planner (Phase 1 refactor).
 *
 * Extracted from songToShow.ts to keep each module under the 600-line limit.
 * Contains the energy-to-look mapping (`sectionPlan`), the `planLocally` entry
 * point and the per-section live-edit helper `adjustSection`.
 */

import type { ShowSectionPlan, SongAnalysis, ShowPlan, ShowExtra, SectionLabel } from '../model/schemas';
import { normalize, COLORS } from '../ai/local/interpreter';
import { SECTION_NAMES } from './analyze';
import { groupsBySection, namePattern, singerMarker } from './showRig';
import { has, parseIntent, type Intent } from './intent';

/** Rig capabilities summary used by the local planner and compiler. */
export interface RigInfo {
  wash: number;
  moving: number;
  bars: number;
  allowStrobe: boolean;
  groups?: Array<{ id: string; name: string }>;
  markers?: Array<{ id: string; name: string }>;
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const LABEL_ENERGY: Record<SectionLabel, number> = {
  intro: 1, verse: 2, prechorus: 3, build: 3, chorus: 4, drop: 5, break: 1, bridge: 2, outro: 1,
};
const WARM = ['#FFB000', '#FF4FA0', '#FF7000', '#FF2A00', '#FF8C00', '#FF6347', '#FFA07A', '#FFD700', '#FF4500', '#DC143C'];
const COLD = ['#2040FF', '#8B00FF', '#00C8FF', '#00E5A0', '#00BFFF', '#1E90FF', '#4169E1', '#00FFFF', '#7B68EE', '#6495ED'];
const NEUTRAL = ['#FFFFFF', '#F5F5F5', '#D3D3D3', '#A9A9A9', '#808080'];
const PASTEL = ['#FFB6C1', '#FFC0CB', '#E6E6FA', '#B0E0E6', '#ADD8E6', '#90EE90', '#F0E68C', '#FFDAB9'];

/** Palettes de couleurs spécifiques par genre musical */
export const GENRE_PALETTES: Record<string, string[]> = {
  electronic: ['#FF00FF', '#00FFFF', '#FF00FF', '#FFFF00', '#FF00AA', '#00AAFF', '#FF55FF', '#55FFFF'],
  edm: ['#FF00FF', '#00FFFF', '#FFFFFF', '#FF00AA', '#00AAFF', '#AA00FF', '#FF55AA', '#55AAFF'],
  house: ['#FF6600', '#FFCC00', '#FFFFFF', '#FF9900', '#FF3300', '#FF6666', '#FFCC66', '#FFFF66'],
  techno: ['#FF0000', '#00FF00', '#0000FF', '#FFFFFF', '#FF0066', '#00FF66', '#6600FF', '#FFFF00'],
  trance: ['#CC00FF', '#00CCFF', '#FFFFFF', '#9900FF', '#0099FF', '#FF66FF', '#66FFFF', '#FFCCFF'],
  rock: ['#FF0000', '#FF8800', '#FF0000', '#880000', '#FF4400', '#884400', '#AA0000', '#FF6600'],
  metal: ['#000000', '#880000', '#440000', '#AA0000', '#660000', '#330000', '#990000', '#550000'],
  pop: ['#FF69B4', '#00CED1', '#FF1493', '#20B2AA', '#FFC0CB', '#00FFED', '#FF6347', '#90EE90'],
  hiphop: ['#8B4513', '#FFD700', '#FF8C00', '#CD853F', '#D2691E', '#F4A460', '#DEB887', '#8B0000'],
  rnb: ['#800080', '#FF1493', '#DC143C', '#FF69B4', '#C71585', '#DB7093', '#FF00FF', '#8B008B'],
  jazz: ['#8B4513', '#CD853F', '#D2B48C', '#F5DEB3', '#A0522D', '#DEB887', '#F4A460', '#D2691E'],
  blues: ['#191970', '#4169E1', '#6495ED', '#87CEEB', '#4682B4', '#5F9EA0', '#7FFFD4', '#00BFFF'],
  classical: ['#FFFFFF', '#F5F5DC', '#FFE4B5', '#DEB887', '#F5DEB3', '#FFF8DC', '#FAFAD2', '#FFEFD5'],
  ambient: ['#00CED1', '#20B2AA', '#48D1CC', '#40E0D0', '#AFEEEE', '#7FFFD4', '#B0E0E6', '#ADD8E6'],
  reggae: ['#008000', '#228B22', '#32CD32', '#90EE90', '#006400', '#2E8B57', '#6B8E23', '#556B2F'],
  country: ['#8B4513', '#A0522D', '#CD853F', '#D2B48C', '#F5DEB3', '#DEB887', '#F4A460', '#BC8F8F'],
  disco: ['#FF00FF', '#FFD700', '#00FFFF', '#FFFFFF', '#FF00AA', '#AA00FF', '#FF55FF', '#55FFFF'],
  funk: ['#FF0000', '#FF8800', '#FF00FF', '#800080', '#FF6600', '#800000', '#AA00AA', '#FF4500'],
};

/** Liste de tous les mouvements possibles pour les lyres */
const ALL_MOVEMENTS: ShowSectionPlan['movement'][] = [
  'none', 'slow', 'sweep', 'pendulum', 'zigzag', 'circle', 'figure8', 'pan', 'tilt',
  'fast', 'ballyhoo', 'fan', 'random',
];

/** Mouvement par défaut selon l'énergie */
const ENERGY_MOVEMENTS: Record<0 | 1 | 2 | 3 | 4 | 5, ShowSectionPlan['movement'][]> = {
  0: ['none'],
  1: ['slow', 'pan'],
  2: ['slow', 'circle', 'pan', 'tilt'],
  3: ['sweep', 'figure8', 'zigzag', 'circle', 'pan'],
  4: ['fast', 'sweep', 'figure8', 'zigzag', 'ballyhoo', 'fan'],
  5: ['fast', 'ballyhoo', 'fan', 'random', 'sweep'],
};

/** Sélection d'un mouvement basé sur une graine unique et plusieurs facteurs */
function selectMovement(
  energy: number,
  strat: ArtisticStrategy,
  genre: string | null,
  index: number,
  variant: number,
  hasVocals: boolean,
  peak: boolean,
  perBeat: number,
  sectionSeed: number
): ShowSectionPlan['movement'] {
  const me = energy;
  
  // Si pas de mouvement ou énergie trop basse
  if (me <= 1) return 'none';
  
  // Obtenir les mouvements adaptés à cette énergie
  const possibleMovements = ENERGY_MOVEMENTS[me as 0 | 1 | 2 | 3 | 4 | 5] ?? ENERGY_MOVEMENTS[3];
  
  // Filtrer selon la stratégie
  const stratMovements: Record<ArtisticStrategy, ShowSectionPlan['movement'][]> = {
    cinematic: ['slow', 'sweep', 'pendulum', 'circle', 'pan'],
    choreographic: ['circle', 'figure8', 'fan', 'ballyhoo', 'zigzag', 'sweep'],
    rhythmic: ['fast', 'sweep', 'zigzag', 'ballyhoo', 'fan'],
    minimalist: ['slow', 'pan', 'tilt', 'none'],
    balanced: [...possibleMovements],
  };
  
  // Filtrer selon le genre
  const genreMovements: Record<string, ShowSectionPlan['movement'][]> = {
    electronic: ['fast', 'ballyhoo', 'fan', 'random', 'zigzag', 'circle'],
    edm: ['fast', 'ballyhoo', 'random', 'fan', 'sweep'],
    house: ['sweep', 'circle', 'figure8', 'pendulum', 'pan'],
    techno: ['fast', 'ballyhoo', 'random', 'zigzag', 'sweep'],
    trance: ['circle', 'figure8', 'sweep', 'pendulum', 'fan'],
    rock: ['sweep', 'pendulum', 'circle', 'pan', 'fast'],
    metal: ['fast', 'ballyhoo', 'random', 'zigzag', 'sweep'],
    pop: ['sweep', 'circle', 'figure8', 'pendulum', 'pan'],
    hiphop: ['slow', 'sweep', 'circle', 'pan', 'tilt'],
    rnb: ['slow', 'sweep', 'circle', 'pendulum', 'pan'],
    jazz: ['slow', 'pan', 'tilt', 'circle', 'sweep'],
    blues: ['slow', 'pan', 'tilt', 'circle', 'pendulum'],
    classical: ['slow', 'pan', 'tilt'],
    ambient: ['slow', 'sweep', 'circle', 'pendulum'],
    reggae: ['sweep', 'circle', 'pendulum', 'pan'],
    country: ['slow', 'pan', 'circle', 'pendulum'],
    disco: ['fast', 'ballyhoo', 'fan', 'random', 'sweep', 'circle'],
    funk: ['fast', 'sweep', 'zigzag', 'ballyhoo', 'fan'],
  };
  
  // Combiner tous les filtres
  const stratMovs = stratMovements[strat as ArtisticStrategy] ?? possibleMovements;
  let candidates = possibleMovements.filter((m: ShowSectionPlan['movement']) => stratMovs.includes(m));
  if (genre) {
    const genreMovs = genreMovements[genre] ?? genreMovements[detectGenreFromBPM(140)] ?? possibleMovements;
    candidates = candidates.filter((m: ShowSectionPlan['movement']) => genreMovs.includes(m));
  }
  
  // Si pas de candidats, utiliser les mouvements de l'énergie
  if (candidates.length === 0) {
    candidates = possibleMovements;
  }
  
  // Pas de mouvements erratiques si voix
  if (hasVocals) {
    candidates = candidates.filter(m => m !== 'ballyhoo' && m !== 'random');
  }
  
  // Pour les peaks, privilégier les mouvements plus dynamiques
  if (peak && me >= 4) {
    const peakMovements: ShowSectionPlan['movement'][] = ['fast', 'ballyhoo', 'fan', 'random'];
    candidates = [...new Set([...peakMovements.filter(m => candidates.includes(m)), ...candidates])];
  }
  
  // Sélectionner un mouvement basé sur la graine unique
  const seed = (sectionSeed + variant * 13 + index * 17) % 100;
  const idx = seed % candidates.length;
  
  return candidates[idx] || possibleMovements[0] || 'slow';
}

/** Détection de genre basée sur le BPM */
export function detectGenreFromBPM(bpm: number): string {
  if (bpm < 70) return 'ambient';
  if (bpm < 90) return 'blues';
  if (bpm < 100) return 'jazz';
  if (bpm < 110) return 'classical';
  if (bpm < 120) return 'pop';
  if (bpm < 128) return 'rock';
  if (bpm < 135) return 'hiphop';
  if (bpm < 145) return 'rnb';
  if (bpm < 155) return 'country';
  if (bpm < 170) return 'disco';
  return 'electronic';
}

/* ── Combined Patterns (Effect + Movement + Beam) ──────────────────────── */

/** A combined visual pattern that ensures effect, movement, and beam work together */
export interface CombinedPattern {
  name: string;
  effect: ShowSectionPlan['effect'];
  movement: ShowSectionPlan['movement'];
  beam: ShowSectionPlan['beam'];
  minEnergy: number;
  maxEnergy: number;
  effectBeats: number;
}

/** Combined patterns by genre - ensures visual coherence */
const GENRE_PATTERNS: Record<string, CombinedPattern[]> = {
  electronic: [
    { name: 'EDM Pulse', effect: 'pulse', movement: 'ballyhoo', beam: 'gobo', minEnergy: 4, maxEnergy: 5, effectBeats: 1 },
    { name: 'EDM Chase', effect: 'chase', movement: 'fan', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 1 },
    { name: 'EDM Strobe', effect: 'strobe', movement: 'random', beam: 'open', minEnergy: 5, maxEnergy: 5, effectBeats: 0.5 },
    { name: 'EDM Color', effect: 'colorChase', movement: 'circle', beam: 'gobo', minEnergy: 3, maxEnergy: 4, effectBeats: 2 },
    { name: 'EDM Sweep', effect: 'snap', movement: 'sweep', beam: 'prism', minEnergy: 4, maxEnergy: 5, effectBeats: 1 },
    { name: 'EDM Gradient', effect: 'gradient', movement: 'figure8', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 4 },
    { name: 'EDM Wave', effect: 'dimmerWave', movement: 'slow', beam: 'frost', minEnergy: 1, maxEnergy: 3, effectBeats: 8 },
  ],
  edm: [
    { name: 'EDM Strobe', effect: 'strobe', movement: 'ballyhoo', beam: 'gobo', minEnergy: 5, maxEnergy: 5, effectBeats: 0.5 },
    { name: 'EDM Snap', effect: 'snap', movement: 'fan', beam: 'prism', minEnergy: 4, maxEnergy: 5, effectBeats: 1 },
    { name: 'EDM Chase', effect: 'chase', movement: 'sweep', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 1 },
    { name: 'EDM Color', effect: 'colorChase', movement: 'circle', beam: 'gobo', minEnergy: 3, maxEnergy: 4, effectBeats: 2 },
    { name: 'EDM Pulse', effect: 'pulse', movement: 'ballyhoo', beam: 'open', minEnergy: 4, maxEnergy: 5, effectBeats: 1 },
    { name: 'EDM Flicker', effect: 'flicker', movement: 'random', beam: 'open', minEnergy: 5, maxEnergy: 5, effectBeats: 0.5 },
    { name: 'EDM Gradient', effect: 'gradient', movement: 'figure8', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 4 },
  ],
  house: [
    { name: 'House Sweep', effect: 'colorChase', movement: 'sweep', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 2 },
    { name: 'House Circle', effect: 'wave', movement: 'circle', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 4 },
    { name: 'House Pulse', effect: 'pulse', movement: 'pan', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 2 },
    { name: 'House Gradient', effect: 'gradient', movement: 'figure8', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 4 },
    { name: 'House Dimmer', effect: 'dimmerWave', movement: 'slow', beam: 'frost', minEnergy: 1, maxEnergy: 3, effectBeats: 8 },
    { name: 'House Chase', effect: 'chase', movement: 'pendulum', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 2 },
  ],
  techno: [
    { name: 'Techno Strobe', effect: 'strobe', movement: 'fast', beam: 'prism', minEnergy: 5, maxEnergy: 5, effectBeats: 0.5 },
    { name: 'Techno Flicker', effect: 'flicker', movement: 'random', beam: 'open', minEnergy: 4, maxEnergy: 5, effectBeats: 0.5 },
    { name: 'Techno Chase', effect: 'chase', movement: 'ballyhoo', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 1 },
    { name: 'Techno Color', effect: 'colorChase', movement: 'zigzag', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 1 },
    { name: 'Techno Pulse', effect: 'pulse', movement: 'fan', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 1 },
    { name: 'Techno Snap', effect: 'snap', movement: 'sweep', beam: 'prism', minEnergy: 4, maxEnergy: 5, effectBeats: 1 },
    { name: 'Techno Gradient', effect: 'gradient', movement: 'circle', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 2 },
  ],
  trance: [
    { name: 'Trance Color', effect: 'colorChase', movement: 'circle', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 2 },
    { name: 'Trance Rainbow', effect: 'rainbow', movement: 'figure8', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 4 },
    { name: 'Trance Gradient', effect: 'gradient', movement: 'sweep', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 4 },
    { name: 'Trance Wave', effect: 'dimmerWave', movement: 'slow', beam: 'frost', minEnergy: 1, maxEnergy: 3, effectBeats: 8 },
    { name: 'Trance Pulse', effect: 'pulseSlow', movement: 'pendulum', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 4 },
    { name: 'Trance Chase', effect: 'chaseSlow', movement: 'circle', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 4 },
    { name: 'Trance Glow', effect: 'glow', movement: 'fan', beam: 'gobo', minEnergy: 1, maxEnergy: 3, effectBeats: 8 },
  ],
  rock: [
    { name: 'Rock Chase', effect: 'chase', movement: 'sweep', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 2 },
    { name: 'Rock Pulse', effect: 'pulse', movement: 'pendulum', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 2 },
    { name: 'Rock Dimmer', effect: 'dimmerWave', movement: 'slow', beam: 'open', minEnergy: 2, maxEnergy: 4, effectBeats: 4 },
    { name: 'Rock Color', effect: 'colorChase', movement: 'circle', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 2 },
    { name: 'Rock Snap', effect: 'snap', movement: 'fan', beam: 'open', minEnergy: 4, maxEnergy: 5, effectBeats: 1 },
    { name: 'Rock Gradient', effect: 'gradient', movement: 'pan', beam: 'gobo', minEnergy: 2, maxEnergy: 3, effectBeats: 4 },
    { name: 'Rock Glow', effect: 'glow', movement: 'none', beam: 'open', minEnergy: 1, maxEnergy: 2, effectBeats: 8 },
  ],
  metal: [
    { name: 'Metal Strobe', effect: 'strobe', movement: 'ballyhoo', beam: 'open', minEnergy: 5, maxEnergy: 5, effectBeats: 0.5 },
    { name: 'Metal Flicker', effect: 'flicker', movement: 'random', beam: 'open', minEnergy: 4, maxEnergy: 5, effectBeats: 0.5 },
    { name: 'Metal Chase', effect: 'chase', movement: 'fast', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 1 },
    { name: 'Metal Snap', effect: 'snap', movement: 'fan', beam: 'open', minEnergy: 4, maxEnergy: 5, effectBeats: 1 },
    { name: 'Metal Pulse', effect: 'pulse', movement: 'sweep', beam: 'open', minEnergy: 3, maxEnergy: 5, effectBeats: 1 },
    { name: 'Metal Color', effect: 'colorChase', movement: 'zigzag', beam: 'gobo', minEnergy: 3, maxEnergy: 4, effectBeats: 1 },
    { name: 'Metal Gradient', effect: 'gradient', movement: 'circle', beam: 'open', minEnergy: 2, maxEnergy: 3, effectBeats: 2 },
  ],
  pop: [
    { name: 'Pop Color', effect: 'colorChase', movement: 'circle', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 2 },
    { name: 'Pop Sweep', effect: 'wave', movement: 'sweep', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 4 },
    { name: 'Pop Pulse', effect: 'pulse', movement: 'pendulum', beam: 'gobo', minEnergy: 2, maxEnergy: 5, effectBeats: 2 },
    { name: 'Pop Gradient', effect: 'gradient', movement: 'figure8', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 4 },
    { name: 'Pop Dimmer', effect: 'dimmerWave', movement: 'slow', beam: 'frost', minEnergy: 1, maxEnergy: 3, effectBeats: 8 },
    { name: 'Pop Glow', effect: 'glow', movement: 'pan', beam: 'gobo', minEnergy: 1, maxEnergy: 3, effectBeats: 8 },
    { name: 'Pop Snap', effect: 'snap', movement: 'fan', beam: 'open', minEnergy: 4, maxEnergy: 5, effectBeats: 1 },
  ],
  hiphop: [
    { name: 'HipHop Color', effect: 'colorChase', movement: 'circle', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 2 },
    { name: 'HipHop Sweep', effect: 'wave', movement: 'sweep', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 4 },
    { name: 'HipHop Pulse', effect: 'pulse', movement: 'pan', beam: 'gobo', minEnergy: 2, maxEnergy: 5, effectBeats: 2 },
    { name: 'HipHop Dimmer', effect: 'dimmerWave', movement: 'slow', beam: 'frost', minEnergy: 1, maxEnergy: 3, effectBeats: 8 },
    { name: 'HipHop Glow', effect: 'glow', movement: 'tilt', beam: 'gobo', minEnergy: 1, maxEnergy: 3, effectBeats: 8 },
    { name: 'HipHop Gradient', effect: 'gradient', movement: 'pendulum', beam: 'gobo', minEnergy: 2, maxEnergy: 3, effectBeats: 4 },
    { name: 'HipHop Chase', effect: 'chaseSlow', movement: 'circle', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 4 },
  ],
  rnb: [
    { name: 'RnB Color', effect: 'colorChase', movement: 'circle', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 2 },
    { name: 'RnB Wave', effect: 'dimmerWave', movement: 'slow', beam: 'gobo', minEnergy: 1, maxEnergy: 3, effectBeats: 8 },
    { name: 'RnB Pulse', effect: 'pulseSlow', movement: 'pendulum', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 4 },
    { name: 'RnB Glow', effect: 'glow', movement: 'pan', beam: 'gobo', minEnergy: 1, maxEnergy: 3, effectBeats: 8 },
    { name: 'RnB Gradient', effect: 'gradient', movement: 'sweep', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 4 },
    { name: 'RnB ColorSlow', effect: 'colorChase', movement: 'figure8', beam: 'gobo', minEnergy: 2, maxEnergy: 3, effectBeats: 4 },
    { name: 'RnB Rainbow', effect: 'rainbow', movement: 'circle', beam: 'gobo', minEnergy: 3, maxEnergy: 4, effectBeats: 4 },
  ],
  jazz: [
    { name: 'Jazz Dimmer', effect: 'dimmerWave', movement: 'slow', beam: 'frost', minEnergy: 1, maxEnergy: 3, effectBeats: 8 },
    { name: 'Jazz Wave', effect: 'wave', movement: 'pan', beam: 'gobo', minEnergy: 1, maxEnergy: 3, effectBeats: 4 },
    { name: 'Jazz Glow', effect: 'glow', movement: 'tilt', beam: 'gobo', minEnergy: 1, maxEnergy: 2, effectBeats: 8 },
    { name: 'Jazz Color', effect: 'colorChase', movement: 'circle', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 4 },
    { name: 'Jazz Pulse', effect: 'pulse', movement: 'pendulum', beam: 'gobo', minEnergy: 2, maxEnergy: 3, effectBeats: 4 },
    { name: 'Jazz Gradient', effect: 'gradient', movement: 'sweep', beam: 'gobo', minEnergy: 2, maxEnergy: 3, effectBeats: 4 },
    { name: 'Jazz None', effect: 'none', movement: 'none', beam: 'open', minEnergy: 0, maxEnergy: 1, effectBeats: 4 },
  ],
  blues: [
    { name: 'Blues Dimmer', effect: 'dimmerWave', movement: 'slow', beam: 'frost', minEnergy: 1, maxEnergy: 3, effectBeats: 8 },
    { name: 'Blues Wave', effect: 'wave', movement: 'pan', beam: 'gobo', minEnergy: 1, maxEnergy: 3, effectBeats: 4 },
    { name: 'Blues Glow', effect: 'glow', movement: 'tilt', beam: 'gobo', minEnergy: 1, maxEnergy: 2, effectBeats: 8 },
    { name: 'Blues Color', effect: 'colorChase', movement: 'circle', beam: 'gobo', minEnergy: 2, maxEnergy: 3, effectBeats: 4 },
    { name: 'Blues Pulse', effect: 'pulseSlow', movement: 'pendulum', beam: 'gobo', minEnergy: 2, maxEnergy: 3, effectBeats: 4 },
    { name: 'Blues None', effect: 'none', movement: 'none', beam: 'open', minEnergy: 0, maxEnergy: 1, effectBeats: 4 },
    { name: 'Blues Gradient', effect: 'gradient', movement: 'sweep', beam: 'gobo', minEnergy: 2, maxEnergy: 3, effectBeats: 4 },
  ],
  classical: [
    { name: 'Classical None', effect: 'none', movement: 'none', beam: 'open', minEnergy: 0, maxEnergy: 2, effectBeats: 4 },
    { name: 'Classical Dimmer', effect: 'dimmerWave', movement: 'slow', beam: 'frost', minEnergy: 1, maxEnergy: 2, effectBeats: 12 },
    { name: 'Classical Wave', effect: 'wave', movement: 'pan', beam: 'open', minEnergy: 1, maxEnergy: 2, effectBeats: 8 },
    { name: 'Classical Glow', effect: 'glow', movement: 'tilt', beam: 'open', minEnergy: 1, maxEnergy: 2, effectBeats: 12 },
    { name: 'Classical Color', effect: 'colorChase', movement: 'circle', beam: 'open', minEnergy: 2, maxEnergy: 3, effectBeats: 8 },
    { name: 'Classical Gradient', effect: 'gradient', movement: 'sweep', beam: 'open', minEnergy: 2, maxEnergy: 3, effectBeats: 8 },
    { name: 'Classical Pulse', effect: 'pulseSlow', movement: 'pendulum', beam: 'open', minEnergy: 2, maxEnergy: 3, effectBeats: 8 },
  ],
  ambient: [
    { name: 'Ambient None', effect: 'none', movement: 'none', beam: 'frost', minEnergy: 0, maxEnergy: 1, effectBeats: 4 },
    { name: 'Ambient Dimmer', effect: 'dimmerWave', movement: 'slow', beam: 'frost', minEnergy: 1, maxEnergy: 2, effectBeats: 12 },
    { name: 'Ambient Wave', effect: 'wave', movement: 'sweep', beam: 'frost', minEnergy: 1, maxEnergy: 3, effectBeats: 8 },
    { name: 'Ambient Glow', effect: 'glow', movement: 'circle', beam: 'frost', minEnergy: 1, maxEnergy: 2, effectBeats: 12 },
    { name: 'Ambient Color', effect: 'colorChase', movement: 'figure8', beam: 'gobo', minEnergy: 2, maxEnergy: 3, effectBeats: 4 },
    { name: 'Ambient Gradient', effect: 'gradient', movement: 'pendulum', beam: 'frost', minEnergy: 1, maxEnergy: 2, effectBeats: 8 },
    { name: 'Ambient Rainbow', effect: 'rainbow', movement: 'slow', beam: 'frost', minEnergy: 2, maxEnergy: 3, effectBeats: 16 },
  ],
  reggae: [
    { name: 'Reggae Color', effect: 'colorChase', movement: 'circle', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 2 },
    { name: 'Reggae Sweep', effect: 'wave', movement: 'sweep', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 4 },
    { name: 'Reggae Pulse', effect: 'pulseSlow', movement: 'pendulum', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 4 },
    { name: 'Reggae Dimmer', effect: 'dimmerWave', movement: 'slow', beam: 'frost', minEnergy: 1, maxEnergy: 3, effectBeats: 8 },
    { name: 'Reggae Glow', effect: 'glow', movement: 'pan', beam: 'gobo', minEnergy: 1, maxEnergy: 3, effectBeats: 8 },
    { name: 'Reggae Gradient', effect: 'gradient', movement: 'figure8', beam: 'gobo', minEnergy: 2, maxEnergy: 3, effectBeats: 4 },
    { name: 'Reggae Rainbow', effect: 'rainbow', movement: 'circle', beam: 'gobo', minEnergy: 2, maxEnergy: 3, effectBeats: 8 },
  ],
  country: [
    { name: 'Country Dimmer', effect: 'dimmerWave', movement: 'slow', beam: 'open', minEnergy: 1, maxEnergy: 3, effectBeats: 8 },
    { name: 'Country Wave', effect: 'wave', movement: 'pan', beam: 'open', minEnergy: 1, maxEnergy: 3, effectBeats: 4 },
    { name: 'Country Glow', effect: 'glow', movement: 'tilt', beam: 'open', minEnergy: 1, maxEnergy: 2, effectBeats: 8 },
    { name: 'Country Color', effect: 'colorChase', movement: 'circle', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 4 },
    { name: 'Country Pulse', effect: 'pulseSlow', movement: 'pendulum', beam: 'open', minEnergy: 2, maxEnergy: 3, effectBeats: 4 },
    { name: 'Country Gradient', effect: 'gradient', movement: 'sweep', beam: 'open', minEnergy: 2, maxEnergy: 3, effectBeats: 4 },
    { name: 'Country None', effect: 'none', movement: 'none', beam: 'open', minEnergy: 0, maxEnergy: 1, effectBeats: 4 },
  ],
  disco: [
    { name: 'Disco Strobe', effect: 'strobe', movement: 'fan', beam: 'prism', minEnergy: 5, maxEnergy: 5, effectBeats: 0.5 },
    { name: 'Disco Flicker', effect: 'flicker', movement: 'random', beam: 'gobo', minEnergy: 4, maxEnergy: 5, effectBeats: 0.5 },
    { name: 'Disco Color', effect: 'colorChase', movement: 'circle', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 2 },
    { name: 'Disco Rainbow', effect: 'rainbow', movement: 'ballyhoo', beam: 'prism', minEnergy: 3, maxEnergy: 5, effectBeats: 2 },
    { name: 'Disco Pulse', effect: 'pulse', movement: 'sweep', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 1 },
    { name: 'Disco Snap', effect: 'snap', movement: 'fan', beam: 'prism', minEnergy: 4, maxEnergy: 5, effectBeats: 1 },
    { name: 'Disco Chase', effect: 'chase', movement: 'zigzag', beam: 'gobo', minEnergy: 3, maxEnergy: 4, effectBeats: 1 },
  ],
  funk: [
    { name: 'Funk Chase', effect: 'chase', movement: 'sweep', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 1 },
    { name: 'Funk Pulse', effect: 'pulse', movement: 'fan', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 1 },
    { name: 'Funk Snap', effect: 'snap', movement: 'ballyhoo', beam: 'prism', minEnergy: 4, maxEnergy: 5, effectBeats: 1 },
    { name: 'Funk Color', effect: 'colorChase', movement: 'circle', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 2 },
    { name: 'Funk Flicker', effect: 'flicker', movement: 'random', beam: 'open', minEnergy: 4, maxEnergy: 5, effectBeats: 0.5 },
    { name: 'Funk Gradient', effect: 'gradient', movement: 'zigzag', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 2 },
    { name: 'Funk Dimmer', effect: 'dimmerWave', movement: 'slow', beam: 'open', minEnergy: 1, maxEnergy: 3, effectBeats: 4 },
  ],
};

/** Patterns par stratégie artistique */
const STRATEGY_PATTERNS: Record<ArtisticStrategy, CombinedPattern[]> = {
  cinematic: [
    { name: 'Cinematic Slow', effect: 'dimmerWave', movement: 'slow', beam: 'frost', minEnergy: 1, maxEnergy: 3, effectBeats: 12 },
    { name: 'Cinematic Sweep', effect: 'wave', movement: 'sweep', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 8 },
    { name: 'Cinematic Circle', effect: 'colorChase', movement: 'circle', beam: 'gobo', minEnergy: 3, maxEnergy: 4, effectBeats: 4 },
    { name: 'Cinematic Glow', effect: 'glow', movement: 'pendulum', beam: 'gobo', minEnergy: 1, maxEnergy: 2, effectBeats: 8 },
    { name: 'Cinematic Gradient', effect: 'gradient', movement: 'figure8', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 8 },
    { name: 'Cinematic Fan', effect: 'colorChase', movement: 'fan', beam: 'gobo', minEnergy: 3, maxEnergy: 4, effectBeats: 4 },
    { name: 'Cinematic Rainbow', effect: 'rainbow', movement: 'slow', beam: 'gobo', minEnergy: 2, maxEnergy: 3, effectBeats: 16 },
  ],
  choreographic: [
    { name: 'Choreo Fan', effect: 'colorChase', movement: 'fan', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 2 },
    { name: 'Choreo Ballyhoo', effect: 'rainbow', movement: 'ballyhoo', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 2 },
    { name: 'Choreo Circle', effect: 'gradient', movement: 'circle', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 4 },
    { name: 'Choreo Figure8', effect: 'colorChase', movement: 'figure8', beam: 'gobo', minEnergy: 2, maxEnergy: 5, effectBeats: 2 },
    { name: 'Choreo Zigzag', effect: 'chase', movement: 'zigzag', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 2 },
    { name: 'Choreo Pendulum', effect: 'pulse', movement: 'pendulum', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 2 },
    { name: 'Choreo Sweep', effect: 'wave', movement: 'sweep', beam: 'gobo', minEnergy: 2, maxEnergy: 4, effectBeats: 4 },
  ],
  rhythmic: [
    { name: 'Rhythmic Pulse', effect: 'pulse', movement: 'sweep', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 1 },
    { name: 'Rhythmic Chase', effect: 'chase', movement: 'fast', beam: 'gobo', minEnergy: 3, maxEnergy: 5, effectBeats: 1 },
    { name: 'Rhythmic Snap', effect: 'snap', movement: 'ballyhoo', beam: 'prism', minEnergy: 4, maxEnergy: 5, effectBeats: 1 },
    { name: 'Rhythmic Flicker', effect: 'flicker', movement: 'random', beam: 'open', minEnergy: 4, maxEnergy: 5, effectBeats: 0.5 },
    { name: 'Rhythmic Strobe', effect: 'strobe', movement: 'fan', beam: 'prism', minEnergy: 5, maxEnergy: 5, effectBeats: 0.5 },
    { name: 'Rhythmic Color', effect: 'colorChase', movement: 'circle', beam: 'gobo', minEnergy: 2, maxEnergy: 5, effectBeats: 1 },
    { name: 'Rhythmic PulseSlow', effect: 'pulseSlow', movement: 'sweep', beam: 'gobo', minEnergy: 2, maxEnergy: 3, effectBeats: 2 },
  ],
  minimalist: [
    { name: 'Minimalist None', effect: 'none', movement: 'none', beam: 'open', minEnergy: 0, maxEnergy: 2, effectBeats: 4 },
    { name: 'Minimalist Dimmer', effect: 'dimmerWave', movement: 'slow', beam: 'frost', minEnergy: 1, maxEnergy: 3, effectBeats: 12 },
    { name: 'Minimalist Glow', effect: 'glow', movement: 'pan', beam: 'open', minEnergy: 1, maxEnergy: 3, effectBeats: 8 },
    { name: 'Minimalist Wave', effect: 'wave', movement: 'pan', beam: 'open', minEnergy: 1, maxEnergy: 3, effectBeats: 8 },
    { name: 'Minimalist Pulse', effect: 'pulseSlow', movement: 'pan', beam: 'open', minEnergy: 2, maxEnergy: 4, effectBeats: 4 },
    { name: 'Minimalist Color', effect: 'colorChase', movement: 'circle', beam: 'open', minEnergy: 2, maxEnergy: 4, effectBeats: 4 },
    { name: 'Minimalist Pulse', effect: 'pulse', movement: 'none', beam: 'open', minEnergy: 3, maxEnergy: 4, effectBeats: 2 },
  ],
  balanced: [], // Will use defaults
};

/** Sélection d'un pattern combiné basé sur plusieurs facteurs */
export function selectCombinedPattern(
  energy: number,
  strat: ArtisticStrategy,
  genre: string | null,
  index: number,
  variant: number,
  hasVocals: boolean,
  peak: boolean,
  perBeat: number,
  sectionSeed: number,
  allowStrobe: boolean,
  brightness: number
): CombinedPattern | null {
  const e = energy;
  
  // Si énergie nulle, pas de pattern
  if (e <= 0) return null;
  
  // Collecter les patterns candidates
  let candidates: CombinedPattern[] = [];
  
  // 1. Patterns par genre
  const genrePatterns = genre ? GENRE_PATTERNS[genre as keyof typeof GENRE_PATTERNS] : undefined;
  if (genrePatterns) {
    candidates.push(...genrePatterns.filter(p => e >= p.minEnergy && e <= p.maxEnergy));
  }
  
  // 2. Patterns par stratégie
  const stratPatterns = STRATEGY_PATTERNS[strat as ArtisticStrategy];
  if (stratPatterns) {
    candidates.push(...stratPatterns.filter(p => e >= p.minEnergy && e <= p.maxEnergy));
  }
  
  // 3. Si pas de candidats, utiliser les patterns EDM par défaut
  if (candidates.length === 0) {
    const defaultPatterns = GENRE_PATTERNS['electronic' as keyof typeof GENRE_PATTERNS];
    if (defaultPatterns) {
      candidates = defaultPatterns.filter(p => e >= p.minEnergy && e <= p.maxEnergy);
    }
  }
  
  // Filtrer selon les contraintes
  // Pas de strobe/flicker si voix
  if (hasVocals) {
    candidates = candidates.filter(p => p.effect !== 'strobe' && p.effect !== 'flicker');
  }
  
  // Respecter allowStrobe
  if (!allowStrobe) {
    candidates = candidates.filter(p => p.effect !== 'strobe' && p.effect !== 'flicker' && p.effect !== 'snap');
  }
  
  // Pour les peaks, privilégier les patterns les plus dynamiques
  if (peak && e >= 4) {
    const peakPatterns = candidates.filter(p => 
      p.effect === 'strobe' || p.effect === 'flicker' || p.effect === 'snap' || 
      p.movement === 'ballyhoo' || p.movement === 'fan' || p.movement === 'random' ||
      p.effect === 'chase' || p.effect === 'pulse'
    );
    if (peakPatterns.length > 0) {
      candidates = [...peakPatterns, ...candidates.filter(p => !peakPatterns.includes(p))];
    }
  }
  
  // Pour les sections calmes avec forte luminosité, privilégier les patterns doux
  if (e <= 2 && brightness >= 0.7) {
    const calmPatterns = candidates.filter(p => 
      p.effect === 'glow' || p.effect === 'dimmerWave' || p.effect === 'wave' || 
      p.effect === 'colorChase' || p.effect === 'gradient' || p.effect === 'none'
    );
    if (calmPatterns.length > 0) {
      candidates = [...calmPatterns, ...candidates.filter(p => !calmPatterns.includes(p))];
    }
  }
  
  // Si pas de candidats valides, retourner null
  if (candidates.length === 0) return null;
  
  // Sélectionner un pattern basé sur la graine unique
  const seed = (sectionSeed + variant * 29 + index * 31 + e * 37) % 100;
  const idx = seed % candidates.length;
  
  return candidates[idx] || null;
}

/** Liste de tous les effets possibles */
const ALL_EFFECTS: ShowSectionPlan['effect'][] = [
  'none', 'wave', 'pulse', 'pulseSlow', 'chase', 'chaseSlow',
  'rainbow', 'colorChase', 'dimmerWave', 'strobe', 'snap',
  'flicker', 'glow', 'gradient',
];

/** Effets par niveau d'énergie */
const ENERGY_EFFECTS: Record<0 | 1 | 2 | 3 | 4 | 5, ShowSectionPlan['effect'][]> = {
  0: ['none'],
  1: ['wave', 'glow', 'dimmerWave'],
  2: ['wave', 'pulse', 'dimmerWave', 'glow', 'colorChase'],
  3: ['pulse', 'chase', 'colorChase', 'gradient', 'dimmerWave', 'snap'],
  4: ['chase', 'pulse', 'colorChase', 'gradient', 'snap', 'flicker'],
  5: ['chase', 'strobe', 'snap', 'flicker', 'colorChase', 'gradient'],
};

/** Sélection d'un effet basé sur une graine unique et plusieurs facteurs */
function selectEffect(
  energy: number,
  strat: ArtisticStrategy,
  genre: string | null,
  index: number,
  variant: number,
  hasVocals: boolean,
  peak: boolean,
  perBeat: number,
  sectionSeed: number,
  allowStrobe: boolean,
  brightness: number
): { effect: ShowSectionPlan['effect']; effectBeats: number } {
  const e = energy;
  
  // Si énergie nulle ou très basse
  if (e <= 1 && !peak) return { effect: 'none', effectBeats: 4 };
  
  // Obtenir les effets adaptés à cette énergie
  const possibleEffects = ENERGY_EFFECTS[e as 0 | 1 | 2 | 3 | 4 | 5] ?? ENERGY_EFFECTS[3];
  
  // Filtrer selon la stratégie
  const stratEffects: Record<ArtisticStrategy, ShowSectionPlan['effect'][]> = {
    cinematic: ['wave', 'dimmerWave', 'glow', 'gradient', 'colorChase'],
    choreographic: ['chase', 'colorChase', 'gradient', 'rainbow', 'wave'],
    rhythmic: ['pulse', 'chase', 'snap', 'flicker', 'pulseSlow'],
    minimalist: ['wave', 'dimmerWave', 'glow', 'pulse', 'none'],
    balanced: [...possibleEffects],
  };
  
  // Filtrer selon le genre
  const genreEffects: Record<string, ShowSectionPlan['effect'][]> = {
    electronic: ['chase', 'colorChase', 'gradient', 'rainbow', 'snap', 'flicker', 'strobe'],
    edm: ['strobe', 'chase', 'colorChase', 'gradient', 'snap', 'flicker'],
    house: ['chase', 'colorChase', 'wave', 'dimmerWave', 'gradient'],
    techno: ['strobe', 'chase', 'colorChase', 'gradient', 'snap', 'flicker'],
    trance: ['colorChase', 'gradient', 'rainbow', 'wave', 'dimmerWave', 'glow'],
    rock: ['chase', 'pulse', 'snap', 'flicker', 'dimmerWave'],
    metal: ['strobe', 'chase', 'snap', 'flicker', 'pulse'],
    pop: ['colorChase', 'gradient', 'wave', 'dimmerWave', 'glow'],
    hiphop: ['chase', 'pulse', 'dimmerWave', 'wave', 'colorChase'],
    rnb: ['colorChase', 'gradient', 'wave', 'dimmerWave', 'glow'],
    jazz: ['wave', 'dimmerWave', 'glow', 'pulse'],
    blues: ['wave', 'dimmerWave', 'glow', 'pulse', 'colorChase'],
    classical: ['wave', 'dimmerWave', 'glow'],
    ambient: ['wave', 'dimmerWave', 'glow', 'colorChase'],
    reggae: ['wave', 'colorChase', 'dimmerWave', 'glow'],
    country: ['wave', 'dimmerWave', 'glow', 'pulse'],
    disco: ['colorChase', 'gradient', 'rainbow', 'snap', 'flicker', 'strobe'],
    funk: ['chase', 'pulse', 'snap', 'flicker', 'colorChase'],
  };
  
  // Combiner tous les filtres
  const stratEffs = stratEffects[strat as ArtisticStrategy] ?? possibleEffects;
  let candidates = possibleEffects.filter((eff: ShowSectionPlan['effect']) => stratEffs.includes(eff));
  if (genre) {
    const genreEffs = genreEffects[genre] ?? genreEffects[detectGenreFromBPM(140)] ?? possibleEffects;
    candidates = candidates.filter((eff: ShowSectionPlan['effect']) => genreEffs.includes(eff));
  }
  
  // Si pas de candidats, utiliser les effets de l'énergie
  if (candidates.length === 0) {
    candidates = possibleEffects;
  }
  
  // Respecter l'autorisation du strobe
  if (!allowStrobe) {
    candidates = candidates.filter(eff => eff !== 'strobe' && eff !== 'flicker' && eff !== 'snap');
  }
  
  // Pas de strobe/flicker/snap si voix (sauf si explicitement autorisé par l'intent)
  if (hasVocals) {
    candidates = candidates.filter(eff => eff !== 'strobe' && eff !== 'flicker');
  }
  
  // Pour les peaks, privilégier les effets plus intenses
  if (peak && e >= 4) {
    const peakEffects: ShowSectionPlan['effect'][] = ['strobe', 'snap', 'flicker', 'chase', 'colorChase'];
    candidates = [...new Set([...peakEffects.filter(eff => candidates.includes(eff)), ...candidates])];
  }
  
  // Pour les sections calmes avec forte luminosité, privilégier les effets doux
  if (e <= 2 && brightness >= 0.7) {
    const calmEffects: ShowSectionPlan['effect'][] = ['glow', 'dimmerWave', 'wave', 'colorChase'];
    candidates = [...new Set([...calmEffects.filter(eff => candidates.includes(eff)), ...candidates])];
  }
  
  // Sélectionner un effet basé sur la graine unique
  const seed = (sectionSeed + variant * 19 + index * 23) % 100;
  const idx = seed % candidates.length;
  
  const effect = candidates[idx] || possibleEffects[0] || 'wave';
  
  // Déterminer effectBeats en fonction de l'effet et de perBeat
  let effectBeats = 4;
  if (e <= 2) {
    effectBeats = strat === 'cinematic' ? 12 : 8;
  } else if (e === 3) {
    effectBeats = 2;
  } else if (e === 4) {
    effectBeats = 1;
  } else if (e >= 5) {
    effectBeats = perBeat >= 3.5 ? 0.5 : 1;
  }
  
  // Ajuster selon le type d'effet
  if (effect === 'pulseSlow' || effect === 'chaseSlow') effectBeats = 4;
  if (effect === 'dimmerWave' || effect === 'wave' || effect === 'glow') effectBeats = strat === 'cinematic' ? 12 : 8;
  if (effect === 'rainbow' || effect === 'gradient') effectBeats = 16;
  if (effect === 'colorChase') effectBeats = 4;
  if (perBeat >= 3) effectBeats = Math.max(0.5, effectBeats / 2);
  else if (perBeat < 1) effectBeats = Math.min(16, effectBeats * 2);
  
  return { effect, effectBeats };
}

const clampE = (e: number) => Math.max(0, Math.min(5, Math.round(e)));
const isPeak = (label: SectionLabel) => label === 'chorus' || label === 'drop';

/* ── escalation ─────────────────────────────────────────────────────────── */

/** Energy added to a repeated chorus / drop: each repeat goes higher, the last peak of the song the highest (max +1). */
export function escalation(analysis: SongAnalysis, i: number): number {
  const s = analysis.sections[i]!;
  if (!isPeak(s.label)) return 0;
  const k = analysis.sections.slice(0, i).filter((x) => x.label === s.label).length;
  const last = analysis.sections.findLastIndex((x) => isPeak(x.label)) === i;
  return k ? Math.min(1, 0.5 * k + (last ? 0.5 : 0)) : 0;
}

/* ── Artistic Strategies (Phase 3) ────────────────────────────────────────── */

export type ArtisticStrategy = 'balanced' | 'cinematic' | 'rhythmic' | 'choreographic' | 'minimalist';

export const ARTISTIC_STRATEGIES: Record<number, { name: ArtisticStrategy; label: string; desc: string }> = {
  0: { name: 'balanced', label: 'Équilibrée', desc: 'Progression classique et contrastes équilibrés' },
  1: { name: 'cinematic', label: 'Cinématographique', desc: 'Mouvements lents et amples, faisceaux denses et contrastes marqués' },
  2: { name: 'rhythmic', label: 'Rythmique', desc: 'Très synchronisée aux temps et percussions, accents et pulsations vives' },
  3: { name: 'choreographic', label: 'Choréographique', desc: 'Figures géométriques des lyres (fan, ballyhoo, figure8, cercles)' },
  4: { name: 'minimalist', label: 'Minimaliste', desc: 'Épurée, priorité aux wash et à la lisibilité, rares accents percutants' },
};

// Export ALL_EFFECTS and ALL_MOVEMENTS for use in other modules
export { ALL_EFFECTS, ALL_MOVEMENTS, GENRE_PATTERNS, STRATEGY_PATTERNS };

/* ── sectionPlan (local rules & strategies) ─────────────────────────────── */

function sectionPlan(
  index: number, energy: number, palette: string[], rig: RigInfo, intent: Intent,
  variant: number, label: SectionLabel, bars = 0, bassShare = 0.5, perBeat = 2, brightness = 0.5,
  hasVocals = false,
): ShowSectionPlan {
  const strat = ARTISTIC_STRATEGIES[variant % 5]?.name ?? 'balanced';
  const peak = label === 'chorus' || label === 'drop';
  // Use a more sophisticated alternation based on multiple factors for more variety
  const sectionSeed = (variant * 7 + index * 11) % 100;
  const singer = rig.moving > 0 ? singerMarker(rig.markers ?? []) : null;
  const focus: ShowSectionPlan['focus'] = !singer ? null : peak ? 'audience' : energy <= 3 ? singer.id : null;
  const me = intent.moreMovement ? Math.min(5, energy + 1) : energy;
  
  // Try to select a combined pattern first (ensures effect, movement, and beam work together)
  let movement: ShowSectionPlan['movement'], effect: ShowSectionPlan['effect'], beam: ShowSectionPlan['beam'], effectBeats: number;
  
  if (!intent.noMovement) {
    const combinedPattern = selectCombinedPattern(
      me, strat, intent.genre, index, variant, hasVocals, peak, perBeat, sectionSeed, rig.allowStrobe, brightness
    );
    
    if (combinedPattern) {
      // Use the combined pattern's values
      movement = combinedPattern.movement;
      effect = combinedPattern.effect;
      beam = combinedPattern.beam;
      effectBeats = combinedPattern.effectBeats;
    } else {
      // Fallback to separate selection for movement and effect
      movement = selectMovement(me, strat, intent.genre, index, variant, hasVocals, peak, perBeat, sectionSeed);
      const effectResult = selectEffect(me, strat, intent.genre, index, variant, hasVocals, peak, perBeat, sectionSeed, rig.allowStrobe, brightness);
      effect = effectResult.effect;
      effectBeats = effectResult.effectBeats;
      // Fallback beam selection
      const beamFrost = me <= 1 && brightness < 0.4;
      beam = peak && me >= 5 ? 'prism' : me >= 3 ? 'gobo' : beamFrost ? 'frost' : (strat === 'cinematic' && me >= 2 ? 'gobo' : 'open');
    }
  } else {
    // No movement requested
    movement = 'none';
    const effectResult = selectEffect(me, strat, intent.genre, index, variant, hasVocals, peak, perBeat, sectionSeed, rig.allowStrobe, brightness);
    effect = effectResult.effect;
    effectBeats = effectResult.effectBeats;
    const beamFrost = me <= 1 && brightness < 0.4;
    beam = peak && me >= 5 ? 'prism' : me >= 3 ? 'gobo' : beamFrost ? 'frost' : (strat === 'cinematic' && me >= 2 ? 'gobo' : 'open');
  }

  // Règles spécifiques par type de section qui remplacent les valeurs par défaut
  if (label === 'bridge' && me >= 3) {
    const bridgePattern = selectCombinedPattern(me, strat, intent.genre, index + 100, variant, hasVocals, peak, perBeat, sectionSeed + 50, rig.allowStrobe, brightness);
    if (bridgePattern) {
      movement = bridgePattern.movement;
      effect = bridgePattern.effect;
      beam = bridgePattern.beam;
      effectBeats = bridgePattern.effectBeats;
    }
  }
  if (label === 'build' && me >= 3) {
    const buildPattern = selectCombinedPattern(me, strat, intent.genre, index + 200, variant, hasVocals, peak, perBeat, sectionSeed + 25, rig.allowStrobe, brightness);
    if (buildPattern) {
      movement = buildPattern.movement;
      effect = buildPattern.effect;
      beam = buildPattern.beam;
      effectBeats = buildPattern.effectBeats;
    }
  }
  if (label === 'intro' && me >= 2) {
    const introPattern = selectCombinedPattern(me, strat, intent.genre, index + 300, variant, hasVocals, peak, perBeat, sectionSeed + 75, rig.allowStrobe, brightness);
    if (introPattern) {
      movement = introPattern.movement;
      effect = introPattern.effect;
      beam = introPattern.beam;
      effectBeats = introPattern.effectBeats;
    }
  }
  if (label === 'outro' && me >= 2) {
    const outroPattern = selectCombinedPattern(Math.max(1, me - 1), strat, intent.genre, index + 400, variant, hasVocals, peak, perBeat, sectionSeed + 10, rig.allowStrobe, brightness);
    if (outroPattern) {
      movement = outroPattern.movement;
      effect = outroPattern.effect;
      beam = outroPattern.beam;
      effectBeats = outroPattern.effectBeats;
    }
  }
  
  // Pour les peaks avec haute énergie et forte luminosité, privilégier les patterns spectaculaires
  if (peak && me >= 4 && brightness >= 0.7) {
    const peakPattern = selectCombinedPattern(me, strat, intent.genre, index + 500, variant, hasVocals, true, perBeat, sectionSeed + 90, rig.allowStrobe, brightness);
    if (peakPattern) {
      movement = peakPattern.movement;
      effect = peakPattern.effect;
      beam = peakPattern.beam;
      effectBeats = peakPattern.effectBeats;
    }
  }
  
  // Special overrides for specific section types and intent
  if (label === 'drop' && rig.allowStrobe && intent.strobe === 'want') {
    effect = 'strobe';
    effectBeats = perBeat >= 3.5 ? 0.5 : 1;
  }
  if (label === 'bridge' && me >= 2) {
    // Ensure bridge doesn't use strobe or flicker unless explicitly wanted
    if (effect === 'strobe' || effect === 'flicker') {
      const bridgeEffect = selectEffect(me, strat, intent.genre, index + 600, variant, hasVocals, peak, perBeat, sectionSeed + 30, rig.allowStrobe, brightness);
      effect = bridgeEffect.effect === 'strobe' || bridgeEffect.effect === 'flicker' ? 'gradient' : bridgeEffect.effect;
      effectBeats = bridgeEffect.effectBeats;
    }
  }
  if (label === 'build' && me >= 3) {
    const buildEffect = selectEffect(me, strat, intent.genre, index + 700, variant, hasVocals, peak, perBeat, sectionSeed + 60, rig.allowStrobe, brightness);
    effect = buildEffect.effect;
    effectBeats = buildEffect.effectBeats;
  }
  if (label === 'intro' && me <= 2 && brightness >= 0.6) {
    const introEffect = selectEffect(me, strat, intent.genre, index + 800, variant, hasVocals, peak, perBeat, sectionSeed + 15, rig.allowStrobe, brightness);
    effect = introEffect.effect;
    effectBeats = introEffect.effectBeats;
  }
  if (label === 'outro' && me <= 2) {
    const outroEffect = selectEffect(Math.max(1, me - 1), strat, intent.genre, index + 900, variant, hasVocals, peak, perBeat, sectionSeed + 5, rig.allowStrobe, brightness);
    effect = outroEffect.effect;
    effectBeats = outroEffect.effectBeats;
  }
  
  // A sung section keeps the heads readable: no erratic movement over the voice (same rule as the quality report).
  if (hasVocals && (movement === 'ballyhoo' || movement === 'random')) movement = 'sweep';
  if (focus && focus !== 'audience') movement = 'none';

  // Final adjustment of effectBeats based on perBeat
  if (perBeat >= 3) effectBeats = Math.max(0.5, effectBeats / 2);
  else if (perBeat < 1) effectBeats = Math.min(16, effectBeats * 2);

  const layers = {
    wash: rig.wash > 0 || (rig.bars === 0 && rig.moving === 0),
    moving: rig.moving > 0 && (energy >= 2 || peak || !!focus || (strat === 'choreographic' && energy >= 1)),
    bars: rig.bars > 0 && energy >= 2,
  };
  const accents = strat === 'rhythmic' ? (energy >= 3 || peak) : energy >= 4;
  const extras: ShowExtra[] = [];
  if (!peak && bars >= 8 && energy >= 1 && energy <= 4 && ['intro', 'verse', 'prechorus', 'build'].includes(label)) extras.push('ramp');
  if (label === 'drop' || (peak && energy >= 5)) extras.push('blinder');
  if (layers.moving && energy >= 1 && energy <= 2 && strat !== 'minimalist') extras.push('breathe');
  if (intent.bassFollow ? energy >= 3 : label === 'drop' || (peak && bassShare >= 0.65)) extras.push('bassFollow');
  if (intent.colorFollow ? energy >= 1 && effect !== 'rainbow' : (label === 'break' || (energy <= 2 && brightness >= 0.6)) && energy >= 1) extras.push('colorFollow');

  // Use more colors from the palette for more variety
  // The number of colors depends on energy and strategy
  const numColors = strat === 'minimalist' && energy <= 2 ? 1
    : peak ? Math.min(4, palette.length)  // Use up to 4 colors for peaks
    : energy >= 4 ? Math.min(3, palette.length)  // Use up to 3 colors for high energy
    : energy >= 2 ? 2  // Use 2 colors for medium energy
    : 1;  // Use 1 color for low energy
  const selectedPalette = palette.slice(0, numColors);

  return {
    index, energy, beam,
    palette: selectedPalette,
    layers, movement, effect, effectBeats, accents, groups: [], focus, extras, locked: false, note: '', why: '',
  };
}

/* ── explain ────────────────────────────────────────────────────────────── */

const dec = (x: number) => x.toFixed(2).replace('.', ',');
const EXTRA_WHY: Record<ShowExtra, string> = {
  ramp: 'section longue → montée progressive', blinder: "temps fort → blinder à l'entrée",
  breathe: 'passage calme → zoom qui respire', bassFollow: 'basses dominantes → suit les basses',
  colorFollow: 'couleur qui suit la brillance',
};

function explain(analysis: SongAnalysis, i: number, p: ShowSectionPlan, intent: Intent, rig: RigInfo, variant = 0): string {
  const s = analysis.sections[i]!;
  const parts: string[] = [];
  if (variant % 5 !== 0) {
    parts.push(`style ${ARTISTIC_STRATEGIES[variant % 5]?.label.toLowerCase()}`);
  }
  parts.push(`${SECTION_NAMES[s.label]}, énergie mesurée ${dec(s.energy)} → niveau ${p.energy}/5`);
  const first = analysis.sections.findIndex((x) => x.cluster === s.cluster);
  if (first < i) parts.push(`même musique que la section ${first + 1} (${SECTION_NAMES[analysis.sections[first]!.label].toLowerCase()}) → même palette`);
  const peak = s.label === 'chorus' || s.label === 'drop';
  if (intent.verseShift && ['verse', 'intro', 'outro'].includes(s.label)) parts.push('couplets sobres demandés');
  if (intent.peakShift && peak) parts.push('temps forts renforcés (intention)');
  if (escalation(analysis, i)) parts.push(`${SECTION_NAMES[s.label].toLowerCase()} répété → plus fort que le précédent`);
  if (intent.globalShift) parts.push(intent.globalShift < 0 ? 'ambiance calme demandée' : 'ambiance énergique demandée');
  if (intent.colors.length) parts.push('couleurs demandées');
  if (p.beam === 'frost' && s.brightness < 0.4) parts.push(`brillance faible (${dec(s.brightness)}) → faisceau diffus`);
  if (p.extras.includes('colorFollow') && !intent.colorFollow && s.brightness >= 0.6) parts.push(`brillance élevée (${dec(s.brightness)}) → couleur suit la brillance`);
  if (p.extras.includes('bassFollow') && !intent.bassFollow && s.bassShare >= 0.65) parts.push(`basses dominantes (${dec(s.bassShare)}) → suit les basses`);
  if (p.groups.length) parts.push(`groupes demandés : ${p.groups.map((g) => rig.groups?.find((x) => x.id === g)?.name).filter(Boolean).join(', ')}`);
  if (p.focus === 'audience') parts.push('balayage du public');
  else if (p.focus) parts.push(`douche sur ${rig.markers?.find((m) => m.id === p.focus)?.name ?? 'le repère'}`);
  if (s.confidence !== undefined && s.confidence < 0.7) parts.push(`classification estimée (confiance ${(s.confidence * 100).toFixed(0)} %)`);
  if (s.hasVocals) parts.push('chant détecté');
  for (const x of p.extras) if (!['colorFollow', 'bassFollow'].includes(x) || (x === 'colorFollow' && intent.colorFollow) || (x === 'bassFollow' && intent.bassFollow)) parts.push(EXTRA_WHY[x]);
  return parts.join(' ; ').slice(0, 300);
}

/* ── planLocally ────────────────────────────────────────────────────────── */

export function planLocally(analysis: SongAnalysis, intentText: string, rig: RigInfo, variant = 0, previous?: ShowPlan | null): ShowPlan {
  const intent = parseIntent(intentText);
  const keyConfident = analysis.key.confidence >= 0.3;
  const modeIsMajor = keyConfident
    ? analysis.key.mode === 'major'
    : analysis.sections.reduce((s, x) => s + x.brightness, 0) / Math.max(1, analysis.sections.length) >= 0.5;
  const base = intent.colors.length ? intent.colors : intent.warmth === 'cold' || (!intent.warmth && !modeIsMajor) ? COLD : WARM;
  const accent = (intent.warmth === 'cold' || (!intent.warmth && !modeIsMajor) ? WARM : COLD)[variant % 10]!;
  const byLabel = groupsBySection(intentText, rig.groups ?? []);
  const barSec = (analysis.meter ?? 4) * 60 / analysis.bpm;
  const strat = ARTISTIC_STRATEGIES[variant % 5] ?? ARTISTIC_STRATEGIES[0]!;
  // Every take is named (number + style): from the 6th the styles come round again, with the alternation and palette shifted.
  const stratDesc = variant ? ` [Variante ${variant + 1} · ${strat.label}]` : '';

  // Detect genre from BPM for color palette selection
  const detectedGenre = detectGenreFromBPM(analysis.bpm);
  const genrePalette = GENRE_PALETTES[detectedGenre] ?? (modeIsMajor ? WARM : COLD);

  const sections = analysis.sections.map((s, i): ShowSectionPlan => {
    const kept = previous?.sections[i];
    if (kept?.locked && previous!.sections.length === analysis.sections.length) return kept;
    const label = s.label;
    let e = 0.6 * LABEL_ENERGY[label] + 0.4 * s.energy * 5 + intent.globalShift;
    if (label === 'verse' || label === 'intro' || label === 'outro') e += intent.verseShift;
    if (label === 'chorus' || label === 'drop') e += intent.peakShift + escalation(analysis, i);
    
    // Enhanced color palette selection with more variety
    // Use section index, cluster, energy, and variant to create unique color combinations
    const energy = clampE(e);
    const isPeak = label === 'chorus' || label === 'drop';
    
    // For more variety, use different color selection strategies based on section type and variant
    let palette: string[];
    if (intent.colors.length) {
      // User specified colors - use them but with rotation
      const rot = (i + variant) % intent.colors.length;
      palette = [...intent.colors.slice(rot), ...intent.colors.slice(0, rot)];
    } else {
      // Auto-generated palette with enhanced variety
      // Use genre palette as base if available
      const baseColors = intent.warmth === 'cold' || (!intent.warmth && !modeIsMajor) ? COLD : WARM;
      const genreColors: string[] | undefined = intent.genre ? GENRE_PALETTES[intent.genre as keyof typeof GENRE_PALETTES] : genrePalette;
      const allColorsArr: string[] = [...(genreColors ?? baseColors), ...baseColors, ...PASTEL, ...NEUTRAL];
      const oppositeColorsArr: string[] = !modeIsMajor ? [...WARM, ...PASTEL] : [...COLD, ...PASTEL];
      
      // Create unique seed for each section based on multiple factors
      const sectionSeed = (i * 7 + s.cluster * 13 + variant * 17 + energy * 19) % allColorsArr.length;
      
      // Select 6-8 colors from the full palette for more variety
      const numColors = isPeak ? 8 : energy >= 3 ? 6 : 5;
      palette = [];
      for (let j = 0; j < numColors; j++) {
        const idx = (sectionSeed + j * (i + 1) + variant * (j + 1)) % allColorsArr.length;
        palette.push(allColorsArr[idx]!);
      }
      
      // Add accent color from opposite palette for contrast
      const accentIdx = (variant + i * 3 + energy * 5) % oppositeColorsArr.length;
      const accentColor = oppositeColorsArr[accentIdx]!;
      
      // Insert accent at different positions based on section type
      if (isPeak && !intent.colors.length) {
        palette.splice(Math.min(2, palette.length), 0, accentColor);
      } else if (energy >= 3) {
        palette.splice(Math.floor(palette.length / 2), 0, accentColor);
      }
    }
    
    const plan = sectionPlan(i, energy, palette.slice(0, isPeak ? 8 : 6), rig, intent, variant, label, (s.end - s.start) / barSec, s.bassShare, s.density / (analysis.bpm / 60), s.brightness, s.hasVocals);
    const out = { ...plan, groups: byLabel.get(label) ?? [] };
    return { ...out, why: explain(analysis, i, out, intent, rig, variant) };
  });
  const peaks = analysis.sections.filter((s) => s.label === 'chorus' || s.label === 'drop').length;
  return {
    intent: intentText.slice(0, 500), provider: 'local', model: null, variant,
    summary: `${sections.length} sections, ${peaks} temps fort(s)${stratDesc} ; palette ${intent.colors.length ? 'demandée' : (intent.warmth && { warm: 'chaude', cold: 'froide' }[intent.warmth]) ?? (!modeIsMajor ? `froide (${keyConfident ? 'tonalité mineure' : 'tonalité incertaine, brillance faible'})` : `chaude (${keyConfident ? 'tonalité majeure' : 'tonalité incertaine, brillance élevée'})`)}${intent.strobe === 'forbid' ? ', sans strobe' : ''}${intent.noMovement ? ', sans mouvement' : ''}${byLabel.size ? `, groupes : ${[...byLabel].map(([l, ids]) => `${SECTION_NAMES[l].toLowerCase()} → ${ids.map((id) => rig.groups!.find((g) => g.id === id)!.name).join(' + ')}`).join(', ')}` : ''}.`,
    sections,
  };
}

/* ── adjustSection ──────────────────────────────────────────────────────── */

/** Local edit of one section from a short instruction ("plus chaud", "plus calme", "en rouge", "sans mouvement"…). */
export function adjustSection(s: ShowSectionPlan, instruction: string, rig: RigInfo): ShowSectionPlan {
  const t = normalize(instruction);
  const out: ShowSectionPlan = { ...s, palette: [...s.palette], layers: { ...s.layers }, groups: [...s.groups], extras: [...s.extras], note: instruction.slice(0, 200), why: `Retouche « ${instruction.slice(0, 80)} »${s.why ? ` ; ${s.why}` : ''}`.slice(0, 300) };

  if (has(t, /\bplus (calme|doux|sobre)|moins (fort|energique|intense)/)) { out.energy = clampE(s.energy - 1); }
  if (has(t, /\bplus (fort|energique|intense|puissant)|moins (calme|sobre)|explos/)) { out.energy = clampE(s.energy + 1); }
  if (has(t, /\bplus chaud|chaleureu/)) { out.palette = WARM.slice(0, Math.max(1, s.palette.length)); }
  if (has(t, /\bplus froid|glacial/)) { out.palette = COLD.slice(0, Math.max(1, s.palette.length)); }
  const colors = COLORS.filter((c) => c.forms.some((f) => has(t, new RegExp(`\\b${normalize(f)}\\b`)))).map((c) => c.hex);
  if (colors.length) { out.palette = colors.slice(0, 4); }

  if (has(t, /\b(sans|pas de) mouvement/)) { out.movement = 'none'; }
  else if (has(t, /\bplus de mouvement|bouge/)) { out.movement = out.energy >= 4 ? 'fast' : 'sweep'; }
  else if (has(t, /\beventail\b/)) { out.movement = 'fan'; }
  else if (has(t, /\bballyhoo\b/)) { out.movement = 'ballyhoo'; }
  else if (has(t, /\bcercle\b|circle\b/)) { out.movement = 'circle'; }
  else if (has(t, /\bhuit\b|8\b|figure8\b|figure-8\b/)) { out.movement = 'figure8'; }
  else if (has(t, /\bpan (seul|horizontal|gauche|droite)?\b|pan\b/)) { out.movement = 'pan'; }
  else if (has(t, /\btilt (seul|vertical|haut|bas)?\b|tilt\b/)) { out.movement = 'tilt'; }
  else if (has(t, /\baléatoire\b|random\b|hasard\b/)) { out.movement = 'random'; }
  else if (has(t, /\bpendule\b|balancier\b/)) { out.movement = 'pendulum'; }
  else if (has(t, /\bzigzag\b|zig-zag\b/)) { out.movement = 'zigzag'; }

  if (has(t, /\b(sans|pas de) strobe/) && out.effect === 'strobe') { out.effect = 'chase'; }
  else if (has(t, /\bstrobe\b/) && rig.allowStrobe) { out.effect = 'strobe'; }
  else if (has(t, /\bchase (de )?couleurs?\b/)) { out.effect = 'colorChase'; }
  else if (has(t, /\bvague (dimm|er|s?)\b|dimmerWave\b/)) { out.effect = 'dimmerWave'; }
  else if (has(t, /\bpulse (lent|slow)\b/)) { out.effect = 'pulseSlow'; }
  else if (has(t, /\bchase (lent|slow)\b/)) { out.effect = 'chaseSlow'; }
  else if (has(t, /\bscintil(l|le|ement)\b|flicker\b/) && rig.allowStrobe) { out.effect = 'flicker'; }
  else if (has(t, /\bsnap\b|flash\b|éclair\b/) && rig.allowStrobe) { out.effect = 'snap'; }
  else if (has(t, /\blueur\b|glow\b/)) { out.effect = 'glow'; }
  else if (has(t, /\b(dé)?gradient\b|gradient\b/)) { out.effect = 'gradient'; }
  else if (has(t, /\barc (en )?ciel\b|rainbow\b/)) { out.effect = 'rainbow'; }

  const singer = singerMarker(rig.markers ?? []);
  if (singer && has(t, /\bdouche\b|\bsur (le |la )?(chanteu\w*|chant\w*|voix)\b/)) {
    out.focus = singer.id; out.movement = 'none'; out.layers = { ...out.layers, moving: true };
   
  } else if (has(t, /\bpublic\b/)) { out.focus = 'audience'; }

  const groups = (rig.groups ?? []).filter((g) => namePattern(g.name).test(t));
  if (groups.length) { out.groups = groups.map((g) => g.id); }
  else if (has(t, /\btout le (kit|monde)|tous les projecteurs\b/)) { out.groups = []; }

  const extra = (x: ShowExtra, on: boolean) => { out.extras = on ? [...new Set([...out.extras, x])] : out.extras.filter((e) => e !== x); };
  const toggles: [ShowExtra, string][] = [['blinder', 'blinders?'], ['ramp', 'monte\\w* (doucement|progressivement)|progressi\\w*'], ['breathe', 'zoom|iris'], ['bassFollow', 'basses?']];
  for (const [x, words] of toggles) {
    if (has(t, new RegExp(`\\b(sans|pas de)\\s+(${words})\\b`))) extra(x, false);
    else if (has(t, new RegExp(`\\b(${words})\\b`))) extra(x, true);
  }

  if (has(t, /\b(sans|pas de) (gobos?|prismes?)\b|faisceau ouvert/)) { out.beam = 'open'; }
  else if (has(t, /\bprismes?\b/)) { out.beam = 'prism'; }
  else if (has(t, /\bgobos?\b/)) { out.beam = 'gobo'; }
  else if (has(t, /\b(frost|flou|diffus\w*)\b/)) { out.beam = 'frost'; }

  return out;
}
