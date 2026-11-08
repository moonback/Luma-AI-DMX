// Ratchet for user-facing errors emitted by core handlers: new messages must use a shared translation key.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join('src', 'core', 'app', 'handlers');
const BASELINE = path.join('scripts', 'core-i18n-baseline.json');
const UNKEYED_USER_ERROR = /new UserError\(\s*(?:'[^']*'|"[^"]*"|\x60[^\x60]*\x60)\s*\)/gu;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.ts$/u.test(name)) yield full;
  }
}

export function countUnkeyedUserErrors(source) {
  return [...source.matchAll(UNKEYED_USER_ERROR)].length;
}

const counts = Object.fromEntries([...walk(ROOT)].map((file) => [
  file.split(path.sep).join('/'),
  countUnkeyedUserErrors(readFileSync(file, 'utf8')),
]).filter(([, count]) => count > 0).sort(([a], [b]) => a.localeCompare(b)));

if (process.argv.includes('--update')) {
  writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + '\n');
  console.log('Référence des erreurs non traduites mise à jour : ' + Object.values(counts).reduce((a, b) => a + b, 0) + '.');
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const worse = Object.entries(counts).filter(([file, count]) => count > (baseline[file] ?? 0));
if (worse.length) {
  console.error('Nouvelles erreurs UserError sans clé i18n : utilisez une clé de src/shared/i18n.ts.');
  for (const [file, count] of worse) console.error('  ' + file + ' : ' + count + ' (référence ' + (baseline[file] ?? 0) + ')');
  process.exit(1);
}
const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log('Erreurs UserError sans clé i18n : ' + total + ' (référence ' + Object.values(baseline).reduce((a, b) => a + b, 0) + ').');
