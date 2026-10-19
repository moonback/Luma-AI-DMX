import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { z } from 'zod';
import { writeFileAtomic } from '../project/store';

/**
 * LLM answers kept on this machine, keyed by a hash of everything that shaped the request (song, intent, rig,
 * variant, model…): asking the same thing again costs nothing and gives the same result. Entries are re-validated on
 * read; an unreadable or invalid entry is a miss. The folder is capped at `maxBytes`: the least recently written entries go.
 */
export class ResponseCache {
  constructor(private readonly dir: string, private readonly maxBytes = 50 * 1024 * 1024) {}

  key(parts: unknown): string {
    return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  }

  async get<T>(key: string, schema: z.ZodType<T>): Promise<T | null> {
    try {
      const r = schema.safeParse(JSON.parse(await fs.readFile(this.file(key), 'utf8')));
      return r.success ? r.data : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    await writeFileAtomic(this.file(key), JSON.stringify(value), false);
    await this.prune();
  }

  /** Deletes the oldest entries until the folder fits in `maxBytes`. */
  async prune(): Promise<void> {
    const entries = [];
    for (const name of await fs.readdir(this.dir).catch(() => [] as string[])) {
      if (!name.endsWith('.json')) continue;
      const st = await fs.stat(path.join(this.dir, name)).catch(() => null);
      if (st) entries.push({ name, size: st.size, mtime: st.mtimeMs });
    }
    let total = entries.reduce((s, e) => s + e.size, 0);
    for (const e of entries.sort((a, b) => a.mtime - b.mtime)) {
      if (total <= this.maxBytes) break;
      await fs.rm(path.join(this.dir, e.name), { force: true });
      total -= e.size;
    }
  }

  private file(key: string): string {
    return path.join(this.dir, `${key}.json`);
  }
}
