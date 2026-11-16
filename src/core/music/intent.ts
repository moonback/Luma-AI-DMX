import type { Mood } from '../model/schemas';
import { COLORS, normalize } from '../ai/local/interpreter';

export interface Intent {
  verseShift: number;
  peakShift: number;
  globalShift: number;
  strobe: 'forbid' | 'want' | 'auto';
  noMovement: boolean;
  moreMovement: boolean;
  colors: string[];
  warmth: 'warm' | 'cold' | null;
  genre: string | null;
  noHaze: boolean;
  noFollow: boolean;
  /** Band followers asked for: dimmer on the bass, colour on the brightness. */
  bassFollow: boolean;
  colorFollow: boolean;
}

export const has = (t: string, re: RegExp) => re.test(t);

const MOOD_WORDS: Record<keyof Mood, [string, string]> = {
  energy: ['ambiance calme', 'ambiance énergique'],
  colors: ['couleurs froides', 'couleurs chaudes'],
  movement: ['sans mouvement', 'beaucoup de mouvement'],
  strobe: ['pas de strobe', 'avec strobe'],
};
/** The intent as planned: the operator's text plus the ambience sliders, in words both the rules and the LLM read. */
export function withMood(intent: string, mood?: Mood): string {
  const words = mood ? (Object.keys(MOOD_WORDS) as (keyof Mood)[]).filter((k) => mood[k]).map((k) => MOOD_WORDS[k][mood[k] < 0 ? 0 : 1]) : [];
  return [intent.trim(), ...words].filter(Boolean).join(', ');
}

export function parseIntent(text: string): Intent {
  const t = normalize(text);
  const calm = /\b(sobre|sobres|calme|calmes|doux|douce|intime|discret|discrete|leger|legere)\b/;
  const big = /\b(explos\w*|energique\w*|puissant\w*|intense\w*|enorme\w*|fort|forte|pechu\w*|massif\w*)\b/;
  const verseCalm = has(t, new RegExp(`couplets?\\b[^,.;]*${calm.source}`)) || has(t, new RegExp(`${calm.source}[^,.;]*couplets?`));
  const peakBig = has(t, new RegExp(`(refrains?|drops?)\\b[^,.;]*${big.source}`)) || has(t, new RegExp(`${big.source}[^,.;]*(refrains?|drops?)`));
  const noStrobe = has(t, /\b(pas de|sans|aucun|no)\s+strobe/);
  const colors: string[] = [];
  for (const c of COLORS) if (c.forms.some((f) => has(t, new RegExp(`\\b${normalize(f)}\\b`)))) colors.push(c.hex);
  // Detect genre from text
  let genre: string | null = null;
  const genrePatterns: Record<string, RegExp> = {
    electronic: /\b(electro|electro\w*|house|techno|trance|edm|dance|raves?)\b/i,
    rock: /\b(rock|metal|heavy|hard)\b/i,
    pop: /\b(pop|variete|chanson)\b/i,
    hiphop: /\b(hip\s*hop|rap|trap)\b/i,
    rnb: /\b(r\s*&\s*b|rnb|soul)\b/i,
    jazz: /\b(jazz|blues)\b/i,
    classical: /\b(classique|classi\w*|symphonique|orchestre)\b/i,
    ambient: /\b(ambient|chill|atmospherique)\b/i,
    reggae: /\b(reggae|ska)\b/i,
    country: /\b(country|folk)\b/i,
    disco: /\b(disco|funk)\b/i,
  };
  for (const [g, pattern] of Object.entries(genrePatterns)) {
    if (has(t, pattern)) {
      genre = g;
      break;
    }
  }

  return {
    verseShift: verseCalm ? -1 : 0,
    peakShift: peakBig ? 1 : 0,
    globalShift: !verseCalm && !peakBig ? (has(t, calm) ? -1 : has(t, big) ? 1 : 0) : 0,
    strobe: noStrobe ? 'forbid' : has(t, /\bstrobe\b/) ? 'want' : 'auto',
    noMovement: has(t, /\b(sans|pas de|aucun)\s+mouvements?\b|\bfixes?\b/),
    moreMovement: has(t, /\bbeaucoup de mouvements?\b|\btres mobiles?\b/),
    colors,
    warmth: has(t, /\b(chauds?|chaudes?|chaleureu\w*|warm)\b/) ? 'warm' : has(t, /\b(froids?|froides?|glacial\w*|cold)\b/) ? 'cold' : null,
    genre,
    noHaze: has(t, /\b(sans|pas de|aucune?)\s+(fumee|haze|brouillard)\b/),
    noFollow: has(t, /\b(sans|pas de|aucune?)\s+poursuites?\b/),
    bassFollow: has(t, /\b(suit|suivent|sur|calee?s? sur) (les |la )?basses?\b/),
    colorFollow: has(t, /\bcouleurs? (qui )?sui\w* (la )?(brillance|musique|son)\b/),
  };
}
