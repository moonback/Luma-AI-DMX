import path from 'node:path';
import { promises as fs } from 'node:fs';
import { gunzipSync } from 'node:zlib';

/**
 * The MA Fixture Share library installed with grandMA2 onPC (`%ProgramData%\MA Lighting Technologies\grandma\gma2_V_x\library`):
 * one file per mode, named `manufacturer@fixture@mode.xmlp` (gzip of a small binary header + the usual grandMA2 XML).
 */

/** Newest `gma2_V_*` library folder, or null when grandMA2 onPC is not installed. */
export async function findMa2LibraryDir(programData = process.env.ProgramData ?? 'C:\\ProgramData'): Promise<string | null> {
  const root = path.join(programData, 'MA Lighting Technologies', 'grandma');
  const versions = (await fs.readdir(root).catch(() => [] as string[])).filter((d) => /^gma2_V_/i.test(d));
  versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const v of versions) {
    const dir = path.join(root, v, 'library');
    if (await fs.stat(dir).then((s) => s.isDirectory(), () => false)) return dir;
  }
  return null;
}

/** manufacturer → fixture → mode file names. */
export type Ma2LibraryIndex = Map<string, Map<string, string[]>>;

export async function indexMa2Library(dir: string): Promise<Ma2LibraryIndex> {
  const index: Ma2LibraryIndex = new Map();
  for (const file of await fs.readdir(dir)) {
    if (!/\.xmlp?$/i.test(file)) continue;
    const parts = file.replace(/\.xmlp?$/i, '').split('@');
    if (parts.length < 3) continue;
    const [man, fixture] = parts as [string, string];
    let fixtures = index.get(man);
    if (!fixtures) index.set(man, (fixtures = new Map()));
    fixtures.set(fixture, [...(fixtures.get(fixture) ?? []), file]);
  }
  return index;
}

let cache: Promise<{ dir: string; index: Ma2LibraryIndex } | null> | undefined;
/** Library folder and index, read once per session (≈ 37 000 files). */
export function loadMa2Library(): Promise<{ dir: string; index: Ma2LibraryIndex } | null> {
  cache ??= findMa2LibraryDir()
    .then(async (dir) => (dir ? { dir, index: await indexMa2Library(dir) } : null))
    .catch((err: unknown) => { cache = undefined; throw err; });
  return cache;
}

/** grandMA2 XML text from a library `.xmlp` (gzipped, binary header) or a plain `.xml` export. */
export function decodeMa2File(bytes: Buffer): string {
  const raw = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  const text = raw.toString('utf8');
  const start = text.indexOf('<?xml');
  return start >= 0 ? text.slice(start) : text.slice(Math.max(0, text.indexOf('<')));
}
