// Ratchet on hard-coded UI text in the renderer (report level 2, item 17): the count per file may only go down.
// New screens use the catalogues in src/renderer/i18n (t / useT). `--update` rewrites the baseline after an extraction.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join('src', 'renderer');
const BASELINE = path.join('scripts', 'i18n-baseline.json');
const SKIP = [path.join(ROOT, 'i18n') + path.sep];
const WORD = /[A-Za-zÀ-ÿ]{2,}/u;

/** JSX text nodes, text attributes and message-like object properties holding words. */
export function countTexts(src) {
  let n = 0;
  for (const m of src.matchAll(/(?<!=)>([^<>{}]+)<(?=[/A-Za-z])/gu)) if (WORD.test(m[1])) n++;
  for (const m of src.matchAll(/\b(?:title|placeholder|label|aria-label|hint|subtitle|confirmLabel|message|detail)\s*[=:]\s*\{?\s*(['"`])((?:(?!\1).)*)\1/gu)) if (WORD.test(m[2].replace(/\$\{[^}]*\}/gu, ''))) n++;
  return n;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.tsx?$/u.test(name) && !SKIP.some((s) => full.startsWith(s))) yield full;
  }
}

const counts = Object.fromEntries([...walk(ROOT)].map((f) => [f.split(path.sep).join('/'), countTexts(readFileSync(f, 'utf8'))]).filter(([, n]) => n > 0).sort());
if (process.argv.includes('--update')) {
  writeFileSync(BASELINE, `${JSON.stringify(counts, null, 2)}\n`);
  console.log(`Référence i18n mise à jour : ${Object.values(counts).reduce((a, b) => a + b, 0)} textes en dur.`);
  process.exit(0);
}
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const worse = Object.entries(counts).filter(([f, n]) => n > (baseline[f] ?? 0));
if (worse.length) {
  console.error('Textes d’interface en dur ajoutés : passez par src/renderer/i18n (t / useT).');
  for (const [f, n] of worse) console.error(`  ${f} : ${n} (référence ${baseline[f] ?? 0})`);
  process.exit(1);
}
const total = Object.values(counts).reduce((a, b) => a + b, 0);
const before = Object.values(baseline).reduce((a, b) => a + b, 0);
console.log(`Textes en dur : ${total}${total < before ? ` (référence ${before} : lancez node scripts/check-i18n.mjs --update)` : ''}.`);
