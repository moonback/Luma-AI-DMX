import { readFileSync } from 'node:fs';
import path from 'node:path';

// Contraste WCAG 2.2 des tokens du thème « Régie » (docs/plans/refonte-ma.md, § 2.2 et 2.6).
const css = readFileSync(path.resolve('src/renderer/styles/tokens.css'), 'utf8');
const hexes = (block: string) => Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6});/giu)].map((m) => [m[1]!, m[2]!]));
const block = (selector: string) => css.slice(css.indexOf(`${selector} {`)).split('}')[0]!;
const dark = hexes(block(':root'));
/** Le thème clair hérite des tokens sombres qu'il ne redéfinit pas. */
const THEMES = { sombre: dark, clair: { ...dark, ...hexes(block(":root[data-theme='light']")) } };

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (tokens: Record<string, string>, fg: string, bg: string) => {
  const [a, b] = [luminance(tokens[fg]!), luminance(tokens[bg]!)].sort((x, y) => y - x);
  return (a! + 0.05) / (b! + 0.05);
};

const SURFACES = ['bg', 'panel', 'panel-2', 'panel-3'];
/** [texte, fonds, ratio minimal] : 4,5 pour du texte, 3 pour des repères graphiques (WCAG 1.4.11). */
const PAIRS: [string, string[], number][] = [
  ['text', SURFACES, 4.5],
  ['text-2', SURFACES, 4.5],
  ['text-3', SURFACES, 4.5],
  ['sel', SURFACES, 4.5],
  ['prog', SURFACES, 4.5],
  ['next', SURFACES, 4.5],
  ['run', SURFACES, 4.5],
  ['warn', SURFACES, 4.5],
  ['err-text', SURFACES, 4.5],
  ['on-accent', ['sel', 'prog', 'run', 'next'], 4.5],
  ['on-live', ['live'], 4.5],
  ['live', SURFACES, 3],
  ['border-strong', ['bg', 'panel'], 1.5],
  ...['fam-intensity', 'fam-position', 'fam-color', 'fam-beam', 'fam-focus', 'fam-control'].map((f): [string, string[], number] => [f, SURFACES, 3]),
];

describe.each(Object.entries(THEMES))('tokens du thème Régie %s', (_, tokens) => {
  it('chaque token cité est défini en hex dans tokens.css', () => {
    for (const name of new Set(PAIRS.flatMap(([fg, bgs]) => [fg, ...bgs]))) expect(tokens[name], name).toMatch(/^#[0-9a-f]{6}$/iu);
  });

  it.each(PAIRS.flatMap(([fg, bgs, min]) => bgs.map((bg) => [fg, bg, min] as const)))('%s sur %s ≥ %s:1', (fg, bg, min) => {
    expect(ratio(tokens, fg, bg)).toBeGreaterThanOrEqual(min);
  });
});

it('le thème clair redéfinit toutes les surfaces et tous les textes', () => {
  for (const name of [...SURFACES, 'text', 'text-2', 'text-3', 'on-accent']) expect(THEMES.clair[name], name).not.toBe(dark[name]);
});
