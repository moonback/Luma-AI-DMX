import path from 'node:path';
import { promises as fs } from 'node:fs';
import { profileSchema, type FixtureProfile, type Project } from '../model/schemas';
import { writeFileAtomic } from '../project/store';
import type { AppService } from './AppService';

/* User profile library: imported profiles kept in the data folder, available in every project. */

const libraryFile = (app: AppService) => path.join(app.opts.dataDir, 'profiles.json');

export async function loadLibrary(app: AppService): Promise<void> {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(libraryFile(app), 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') app.logger.warn('Profils', `Bibliothèque de profils illisible : ${(err as Error).message}`);
    return;
  }
  const items = Array.isArray(raw) ? raw : [];
  const valid = items.map((x) => profileSchema.safeParse(x)).filter((r) => r.success).map((r) => r.data);
  if (valid.length < items.length || !Array.isArray(raw)) app.logger.warn('Profils', `Bibliothèque de profils : ${items.length - valid.length} profil(s) invalide(s) ignoré(s)`);
  app.userProfiles = valid;
}

/** Adds or replaces profiles by id (`onlyMissing`: keeps the library's version of known ids). */
export async function saveToLibrary(app: AppService, profiles: readonly FixtureProfile[], onlyMissing = false): Promise<void> {
  const fresh = profiles.filter((p) => !onlyMissing || !app.userProfiles.some((x) => x.id === p.id));
  if (!fresh.length) return;
  await writeLibrary(app, [...app.userProfiles.filter((x) => !fresh.some((p) => p.id === x.id)), ...fresh]);
}

export async function removeFromLibrary(app: AppService, id: string): Promise<void> {
  if (app.userProfiles.some((p) => p.id === id)) await writeLibrary(app, app.userProfiles.filter((p) => p.id !== id));
}

async function writeLibrary(app: AppService, profiles: FixtureProfile[]): Promise<void> {
  app.userProfiles = profiles;
  try {
    await writeFileAtomic(libraryFile(app), JSON.stringify(profiles, null, 2), false);
  } catch (err) {
    app.logger.warn('Profils', `Bibliothèque de profils non enregistrée : ${(err as Error).message}`);
  }
}

/** Keeps projects portable: library profiles used by the patch are embedded in the project. */
export function embedUsedProfiles(draft: Project, library: readonly FixtureProfile[]): void {
  for (const f of draft.patch) {
    if (draft.profiles.some((p) => p.id === f.profileId)) continue;
    const p = library.find((x) => x.id === f.profileId);
    if (p) draft.profiles.push(structuredClone(p));
  }
}
