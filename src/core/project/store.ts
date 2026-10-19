import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Project } from '../model/schemas';
import { parseProject, ProjectLoadError, serializeProject } from './format';

/**
 * Atomic write: data goes to `<file>.tmp`, the previous file is kept as `<file>.bak` (recovery copy),
 * then the temp file is renamed over the target. A crash mid-write never leaves a truncated project.
 */
export function writeFileAtomic(file: string, data: string, keepBackup = true): Promise<void> {
  // Writes to one path run one at a time: concurrent writers would share `<file>.tmp` (rename ENOENT, truncated file).
  const key = path.resolve(file);
  const next = (writes.get(key) ?? Promise.resolve()).then(() => writeNow(file, data, keepBackup));
  const tail = next.catch(() => undefined);
  writes.set(key, tail);
  void tail.then(() => { if (writes.get(key) === tail) writes.delete(key); });
  return next;
}

const writes = new Map<string, Promise<void>>();

async function writeNow(file: string, data: string, keepBackup: boolean): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  // Flushed to disk before the rename: after a power cut the file is the old or the new version, never empty.
  const h = await fs.open(tmp, 'w');
  try {
    await h.writeFile(data, 'utf8');
    await h.sync();
  } finally {
    await h.close();
  }
  if (keepBackup) {
    try {
      await fs.copyFile(file, `${file}.bak`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  await renameRetrying(tmp, file);
}

/** Windows refuses a rename while an antivirus or the indexer holds the file: retry a few times (≈ 1.5 s in all). */
async function renameRetrying(from: string, to: string, attempts = 5): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (i >= attempts - 1 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw err;
      await new Promise((r) => setTimeout(r, 50 * 2 ** i));
    }
  }
}

export async function saveProjectFile(file: string, project: Project): Promise<void> {
  await writeFileAtomic(file, serializeProject(project));
}

export async function loadProjectFile(file: string): Promise<{ project: Project; migratedFrom: number | null }> {
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (err) {
    throw new ProjectLoadError(`Lecture impossible : ${(err as Error).message}`, 'io');
  }
  return parseProject(text);
}

export interface RecoveryEntry {
  file: string;
  name: string;
  modifiedAt: string;
  kind: 'autosave' | 'backup';
  /** Autosaves: file the project was saved to when the copy was written (null: never saved), and its name. */
  source?: string | null;
  project?: string;
}

/** Side file of an autosave: where the project lives, so a restored copy can be saved back over it. */
export interface AutosaveMeta {
  source: string | null;
  name: string;
}

export const autosaveMetaFile = (autosave: string) => autosave.replace(/\.luma\.json$/u, '.meta.json');

export async function readAutosaveMeta(autosave: string): Promise<AutosaveMeta | null> {
  try {
    const m = JSON.parse(await fs.readFile(autosaveMetaFile(autosave), 'utf8')) as Partial<AutosaveMeta>;
    return { source: typeof m.source === 'string' ? m.source : null, name: typeof m.name === 'string' ? m.name : '' };
  } catch {
    return null;
  }
}

/** Autosaves newer than the file they belong to: work that a crash or a power cut kept from being saved. */
export async function recoveryCandidates(autosaveDir: string): Promise<RecoveryEntry[]> {
  const out: RecoveryEntry[] = [];
  for (const r of await listRecovery(autosaveDir, null)) {
    if (r.kind !== 'autosave') continue;
    const savedAt = r.source ? await fs.stat(r.source).then((s) => s.mtime.toISOString(), () => '') : '';
    if (r.modifiedAt > savedAt) out.push(r);
  }
  return out;
}

export async function listRecovery(autosaveDir: string, currentPath: string | null): Promise<RecoveryEntry[]> {
  const out: RecoveryEntry[] = [];
  try {
    for (const f of await fs.readdir(autosaveDir)) {
      if (!f.endsWith('.luma.json')) continue;
      const full = path.join(autosaveDir, f);
      const st = await fs.stat(full);
      const meta = await readAutosaveMeta(full);
      out.push({ file: full, name: f, modifiedAt: st.mtime.toISOString(), kind: 'autosave', ...(meta ? { source: meta.source, project: meta.name } : {}) });
    }
  } catch {
    // no autosave dir yet
  }
  if (currentPath) {
    try {
      const st = await fs.stat(`${currentPath}.bak`);
      out.push({ file: `${currentPath}.bak`, name: path.basename(`${currentPath}.bak`), modifiedAt: st.mtime.toISOString(), kind: 'backup' });
    } catch {
      // no backup
    }
  }
  return out.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}
