import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { z } from 'zod';
import { writeFileAtomic } from '../project/store';

/**
 * LLM answers kept on this machine, keyed by a hash of everything that shaped the request (song, intent, rig,
 * variant, model…): asking the same thing again costs nothing and gives the same result. Entries are re-validated on
 * read; an unreadable or invalid entry is a miss.
 * shortcut: no eviction (an entry is a few kB), add a size cap if the folder ever grows large.
 */
export class ResponseCache {
  constructor(private readonly dir: string) {}

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

  set(key: string, value: unknown): Promise<void> {
    return writeFileAtomic(this.file(key), JSON.stringify(value), false);
  }

  private file(key: string): string {
    return path.join(this.dir, `${key}.json`);
  }
}
