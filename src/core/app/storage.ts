import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppService } from './AppService';

/* Local data that grows without the user seeing it: imported audio, the AI answer cache and old recovery copies. */

export interface StorageReport {
  music: { files: number; bytes: number; orphans: number; orphanBytes: number };
  aiCache: { files: number; bytes: number };
  autosave: { files: number; bytes: number; stale: number };
}

export interface PurgeRequest {
  /** Audio files referenced by neither the open project nor a recent project. */
  music: boolean;
  aiCache: boolean;
  /** Recovery copies older than `STALE_AUTOSAVE_DAYS`. */
  autosave: boolean;
}

export const STALE_AUTOSAVE_DAYS = 30;

async function listFiles(dir: string): Promise<{ file: string; name: string; bytes: number; mtime: number }[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    const file = path.join(dir, name);
    const st = await fs.stat(file).catch(() => null);
    if (st?.isFile()) out.push({ file, name, bytes: st.size, mtime: st.mtimeMs });
  }
  return out;
}

/** Audio hashes still in use: the open project and every recent project file that can be read. */
async function usedAudio(app: AppService): Promise<Set<string>> {
  const used = new Set(app.project.music.tracks.map((t) => t.hash));
  for (const file of app.settings.general.recentProjects) {
    try {
      const p = JSON.parse(await fs.readFile(file, 'utf8')) as { music?: { tracks?: { hash?: unknown }[] } };
      for (const t of p.music?.tracks ?? []) if (typeof t.hash === 'string') used.add(t.hash);
    } catch {
      // unreadable or moved: its audio is kept only if another project references it
    }
  }
  return used;
}

const sum = (xs: { bytes: number }[]) => xs.reduce((s, x) => s + x.bytes, 0);

async function scan(app: AppService, now: number) {
  const music = await listFiles(path.join(app.opts.dataDir, 'music'));
  const used = await usedAudio(app);
  const orphans = music.filter((f) => !used.has(f.name));
  const aiCache = await listFiles(path.join(app.opts.dataDir, 'ai-cache'));
  const autosave = await listFiles(app.autosaveDir);
  const stale = autosave.filter((f) => now - f.mtime > STALE_AUTOSAVE_DAYS * 86_400_000);
  return { music, orphans, aiCache, autosave, stale };
}

export async function storageReport(app: AppService, now = Date.now()): Promise<StorageReport> {
  const s = await scan(app, now);
  return {
    music: { files: s.music.length, bytes: sum(s.music), orphans: s.orphans.length, orphanBytes: sum(s.orphans) },
    aiCache: { files: s.aiCache.length, bytes: sum(s.aiCache) },
    autosave: { files: s.autosave.length, bytes: sum(s.autosave), stale: s.stale.length },
  };
}

/** Deletes what the user asked for; never an audio file still referenced. Returns the number of files removed. */
export async function purgeStorage(app: AppService, req: PurgeRequest, now = Date.now()): Promise<number> {
  const s = await scan(app, now);
  const targets = [...(req.music ? s.orphans : []), ...(req.aiCache ? s.aiCache : []), ...(req.autosave ? s.stale : [])];
  let removed = 0;
  for (const t of targets) {
    try {
      await fs.rm(t.file, { force: true });
      removed++;
    } catch (err) {
      app.logger.warn('Stockage', `${t.name} non supprimé : ${(err as Error).message}`);
    }
  }
  app.logger.info('Stockage', `${removed} fichier(s) supprimé(s), ${Math.round(sum(targets) / 1e6)} Mo libérés`);
  return removed;
}
