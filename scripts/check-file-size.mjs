// Fails when a source file grows past the size limit (report level 2: no source file over 600 lines).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const MAX_LINES = 600;
/** Tighter limit where god files used to grow (docs/adr/0005). */
const LIMITS = [{ dir: path.join('src', 'core', 'app'), max: 400 }];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/u.test(name)) yield full;
  }
}

const over = [];
for (const file of walk('src')) {
  const lines = readFileSync(file, 'utf8').split('\n').length;
  const max = LIMITS.find((l) => file.startsWith(l.dir + path.sep))?.max ?? MAX_LINES;
  if (lines > max) over.push(`  ${file} : ${lines} lignes (max ${max})`);
}
if (over.length) {
  console.error('Fichiers trop longs, à découper :');
  console.error(over.join('\n'));
  process.exit(1);
}
console.log('Taille des fichiers source conforme.');
