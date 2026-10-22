import type { ParamFamily } from '../plan';

/*
 * Reading helpers of the local interpreter for the parts of a request that are not a target or a value: parameter
 * families a request protects, fixtures designated by their place on stage, and compound requests. Text is normalized.
 */

/** Explicit « everything » (as opposed to a request that names no target at all). */
export const ALL_WORDS = /\b(tout|tous|toutes|partout|ensemble|everything|all)\b/;

/** « annule la dernière modification » : the operator wants the last application undone (not the AI layer released). */
export const UNDO_WORDS = /\b(annule\w*|defai\w*|undo)\b.*\b(derniere?|precedente?|last)\b/;

/** « plutôt en vert », « finalement… » : a correction of the previous request. */
export const CORRECTION_WORDS = /\b(plutot|finalement|en fait|instead|rather)\b|^\s*non\b/;

const FAMILY_WORDS: [ParamFamily, RegExp][] = [
  ['color', /\b(couleurs?|teintes?|colou?rs?)\b/],
  ['intensity', /\b(intensites?|luminosites?|dimmers?|niveaux?|brightness)\b/],
  ['position', /\b(positions?|orientations?|pan|tilt)\b/],
  ['beam', /\b(gobos?|prismes?|zoom|faisceaux?|beam)\b/],
  ['effects', /\b(effets?|effects?)\b/],
];

/** Parameter families an exclusion clause names (« sans changer les couleurs » → color). */
export const familiesIn = (clause: string): ParamFamily[] => FAMILY_WORDS.filter(([, re]) => re.test(clause)).map(([f]) => f);

/**
 * Fixtures of `pool` designated by their place on stage (« celle du centre », « celles de gauche »), left to right by x.
 * `null` when the clause is not spatial; a question when the place does not single out the fixtures.
 */
export function spatialPick(clause: string, pool: { name: string; x?: number }[]): { names: string[] } | { question: string } | null {
  const center = /\b(centre|center|milieu|centrale?s?|middle)\b/.test(clause);
  const left = /\b(gauche|left)\b/.test(clause), right = /\b(droite|right)\b/.test(clause);
  if (!center && !left && !right) return null;
  const plural = /\b(celles|ceux|les|those)\b/.test(clause);
  const placed = pool.filter((f): f is { name: string; x: number } => typeof f.x === 'number').sort((a, b) => a.x - b.x);
  if (placed.length < pool.length || placed.length < 2) return { question: 'Les projecteurs visés n’ont pas tous une position sur scène : précisez lesquels exclure par leur nom.' };
  const names = placed.map((f) => f.name);
  const n = names.length;
  if (center) {
    if (n % 2 === 0) return { question: `Il y a ${n} projecteurs visés : aucun n’est seul au centre. Précisez lesquels exclure (${names.join(', ')}).` };
    return { names: [names[(n - 1) / 2]!] };
  }
  const half = plural ? Math.floor(n / 2) : 1;
  if (placed[half - 1]!.x === placed[half]?.x || (n > 1 && placed[n - half]!.x === placed[n - half - 1]!.x)) {
    return { question: `Plusieurs projecteurs sont à la même place : précisez lesquels exclure (${names.join(', ')}).` };
  }
  return { names: left ? names.slice(0, half) : names.slice(n - half) };
}

/** Candidate clauses of a compound request (« les pars en rouge et les lyres en bleu »); the caller keeps the split only if each clause stands alone. */
export function splitClauses(text: string): string[] {
  return text.split(/\s*(?:[,;]|\bet\b|\bpuis\b|\bensuite\b|\bthen\b|\band\b)\s+/).map((c) => c.trim()).filter(Boolean);
}
