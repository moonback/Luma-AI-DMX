import type { SectionLabel } from '../../../core/model/schemas';

/** Display names of the Song-to-Show plan values (page and section editor). */
export const LABEL_COLOR: Record<SectionLabel, string> = {
  intro: '#475569', verse: '#2563eb', prechorus: '#7c3aed', build: '#a855f7', chorus: '#db2777', drop: '#e11d48', break: '#0f766e', bridge: '#ca8a04', outro: '#334155',
};
export const EFFECT_NAMES = { none: '—', wave: 'Vague', pulse: 'Pulsation', chase: 'Chase', rainbow: 'Arc-en-ciel', strobe: 'Strobe', colorChase: 'Chase couleur' } as const;
export const MOVE_NAMES = { none: 'fixe', slow: 'lent', sweep: 'balayage', fast: 'rapide', fan: 'éventail', ballyhoo: 'ballyhoo' } as const;
export const EXTRA_NAMES = { ramp: 'montée progressive', blinder: 'blinder', breathe: 'zoom qui respire', bassFollow: 'suit les basses', colorFollow: 'couleur suit la brillance' } as const;
export const EVENT_STYLE = { impact: ['Impact', '#fde047'], riser: ['Montée', '#22d3ee'], vocal: ['Voix', '#f472b6'] } as const;
export const BEAM_NAMES = { open: '', gobo: 'gobo', prism: 'gobo + prisme', frost: 'frost' } as const;
export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
