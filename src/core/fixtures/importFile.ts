import type { FixtureProfile } from '../model/schemas';
import { convertMa2Fixture, mergeProfileModes } from './ma2';
import { convertGdtf } from './gdtf';
import { decodeMa2File } from './ma2Library';
import { parseProfileFile } from './profiles';
import { readZip, ZipError } from '../util/zip';

/**
 * One fixture file → library profiles, whatever its origin: grandMA2 export (.xml, one file per mode, as downloaded
 * from the MA Fixture Share), GDTF (.gdtf), Luma JSON, or a .zip collection holding any of these (a Fixture Share
 * "download all"). Modes of the same fixture spread over several files are merged into one profile, also with the
 * profile already in the library (`existing`). Never throws: problems come back as `errors` / `warnings`.
 */
export interface FileImport { profiles: FixtureProfile[]; errors: string[]; warnings: string[] }

/** Files of an archive beyond this are ignored (a collection, not a whole library dump). */
export const MAX_ARCHIVE_FILES = 500;

const extOf = (name: string) => (/\.[^./\\]+$/u.exec(name)?.[0] ?? '').toLowerCase();
const base = (name: string) => name.split(/[\\/]/u).pop() ?? name;

/** Adds `p` to `out`, merging its modes into a profile of the same id found there or in the library. */
function collect(out: FixtureProfile[], p: FixtureProfile, existing: (id: string) => FixtureProfile | undefined): void {
  const i = out.findIndex((x) => x.id === p.id);
  if (i >= 0) out[i] = mergeProfileModes(out[i]!, p);
  else { const before = existing(p.id); out.push(before ? mergeProfileModes(before, p) : p); }
}

function convertOne(name: string, bytes: Uint8Array, existing: (id: string) => FixtureProfile | undefined, into: FileImport, depth: number): void {
  const ext = extOf(name);
  const label = base(name);
  const prefix = (m: string) => `${label} : ${m}`;
  if (ext === '.zip') {
    if (depth > 0) { into.warnings.push(prefix('archive imbriquée ignorée')); return; }
    let zip: ReturnType<typeof readZip>;
    try { zip = readZip(bytes); } catch (err) { into.errors.push(prefix(err instanceof ZipError ? err.message : 'archive illisible')); return; }
    const files = zip.names.filter((n) => !n.endsWith('/') && !/(^|\/)(__MACOSX|\.)/u.test(n) && ['.xml', '.xmlp', '.gdtf', '.json', '.zip'].includes(extOf(n)));
    if (!files.length) { into.errors.push(prefix('aucun fichier de profil (.xml grandMA2, .gdtf, .json) dans l’archive')); return; }
    if (files.length > MAX_ARCHIVE_FILES) into.warnings.push(prefix(`${files.length} fichiers : seuls les ${MAX_ARCHIVE_FILES} premiers sont importés`));
    for (const n of files.slice(0, MAX_ARCHIVE_FILES)) {
      let data: Uint8Array | null = null;
      try { data = zip.read(n); } catch (err) { into.errors.push(`${base(n)} : ${(err as Error).message}`); continue; }
      if (data) convertOne(n, data, existing, into, depth + 1);
    }
    return;
  }
  if (ext === '.gdtf') {
    const r = convertGdtf(bytes);
    into.errors.push(...r.errors.map(prefix));
    into.warnings.push(...r.warnings.map(prefix));
    if (r.profile) collect(into.profiles, r.profile, existing);
    return;
  }
  let text: string;
  try {
    text = ext === '.xmlp' ? decodeMa2File(Buffer.from(bytes)) : Buffer.from(bytes).toString('utf8').replace(/^﻿/u, '');
  } catch (err) { into.errors.push(prefix(`fichier grandMA2 illisible : ${(err as Error).message}`)); return; }
  if (ext === '.xml' || ext === '.xmlp' || text.trimStart().startsWith('<')) {
    if (/<GMA3[\s>]/u.test(text.slice(0, 2000))) {
      into.errors.push(prefix('fiche grandMA3 non prise en charge : téléchargez la version grandMA2 (.xml) ou GDTF de la machine'));
      return;
    }
    const r = convertMa2Fixture(text);
    into.errors.push(...r.errors.map(prefix));
    into.warnings.push(...r.warnings.map(prefix));
    if (r.profile) collect(into.profiles, r.profile, existing);
    return;
  }
  let json: unknown;
  try { json = JSON.parse(text); } catch (err) { into.errors.push(prefix(`fichier de profil illisible : ${(err as Error).message}`)); return; }
  const j = json as Record<string, unknown> | null;
  if (j && typeof j === 'object' && 'availableChannels' in j && !('profiles' in j)) {
    into.errors.push(prefix('fichier Open Fixture Library : utilisez « Open Fixture Library › Importer un fichier » pour préciser le fabricant'));
    return;
  }
  const r = parseProfileFile(json);
  into.errors.push(...r.errors.map(prefix));
  for (const p of r.profiles) collect(into.profiles, p, existing);
}

/** Converts several files at once (multiple selection, archive, downloads of the MA Fixture Share window). */
export function convertFixtureFiles(files: readonly { name: string; bytes: Uint8Array }[], existing: (id: string) => FixtureProfile | undefined = () => undefined): FileImport {
  const out: FileImport = { profiles: [], errors: [], warnings: [] };
  for (const f of files) {
    if (extOf(f.name) === '.qxf') { out.errors.push(`${base(f.name)} : format QLC+ (.qxf) pas encore pris en charge : importez l’export grandMA2 (.xml), GDTF ou un profil Luma (.json)`); continue; }
    convertOne(f.name, f.bytes, existing, out, 0);
  }
  return out;
}
