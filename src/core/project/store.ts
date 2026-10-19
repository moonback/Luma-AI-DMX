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
  await fs.writeFile(tmp, data, 'utf8');
  if (keepBackup) {
    try {
      await fs.copyFile(file, `${file}.bak`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  await fs.rename(tmp, file);
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
}

export async function listRecovery(autosaveDir: string, currentPath: string | null): Promise<RecoveryEntry[]> {
  const out: RecoveryEntry[] = [];
  try {
    for (const f of await fs.readdir(autosaveDir)) {
      if (!f.endsWith('.json')) continue;
      const full = path.join(autosaveDir, f);
      const st = await fs.stat(full);
      out.push({ file: full, name: f, modifiedAt: st.mtime.toISOString(), kind: 'autosave' });
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
