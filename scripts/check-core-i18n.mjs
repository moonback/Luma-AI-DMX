// AST-based ratchet: every UserError emitted by a core handler must carry a stable shared i18n key.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.join('src', 'core', 'app', 'handlers');
const BASELINE = path.join('scripts', 'core-i18n-baseline.json');

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.ts$/u.test(name)) yield full;
  }
}

export function countUnkeyedUserErrors(source) {
  const file = ts.createSourceFile('handler.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let count = 0;
  const visit = (node) => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'UserError') {
      const key = node.arguments?.[1];
      if (!key || !ts.isStringLiteral(key) || key.text.length === 0) count += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return count;
}

const counts = Object.fromEntries([...walk(ROOT)].map((file) => [
  file.split(path.sep).join('/'),
  countUnkeyedUserErrors(readFileSync(file, 'utf8')),
]).filter(([, count]) => count > 0).sort(([a], [b]) => a.localeCompare(b)));

if (process.argv.includes('--update')) {
  writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + '\n');
  console.log('Référence des UserError sans clé i18n mise à jour : ' + Object.values(counts).reduce((a, b) => a + b, 0) + '.');
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const worse = Object.entries(counts).filter(([file, count]) => count > (baseline[file] ?? 0));
if (worse.length) {
  console.error('Nouveaux UserError sans clé i18n : ajoutez une clé du catalogue src/shared/i18n.ts.');
  for (const [file, count] of worse) console.error('  ' + file + ' : ' + count + ' (référence ' + (baseline[file] ?? 0) + ')');
  process.exit(1);
}
const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log('UserError sans clé i18n : ' + total + ' (référence ' + Object.values(baseline).reduce((a, b) => a + b, 0) + ').');
