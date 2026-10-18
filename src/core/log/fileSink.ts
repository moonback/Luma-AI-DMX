import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import type { LogEntry, Logger } from './logger';

export interface FileSinkOptions {
  /** Rotate once the current file exceeds this size. */
  maxBytes?: number;
  /** Rotated files kept besides the current one (luma.1.log … luma.N.log). */
  keep?: number;
}

export const LOG_FILE = 'luma.log';

/**
 * Mirrors log entries to `<dir>/luma.log` as JSON lines, rotating by size.
 * Writes are synchronous on purpose: the last lines before a crash are the ones that matter.
 */
export class FileLogSink {
  private readonly maxBytes: number;
  private readonly keep: number;
  private size = 0;
  private broken = false;

  constructor(readonly dir: string, opts: FileSinkOptions = {}) {
    this.maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
    this.keep = opts.keep ?? 4;
    mkdirSync(dir, { recursive: true });
    const file = this.file(0);
    this.size = existsSync(file) ? statSync(file).size : 0;
  }

  attach(logger: Logger): () => void {
    const onEntry = (e: LogEntry) => this.write(e);
    logger.on('entry', onEntry);
    return () => logger.off('entry', onEntry);
  }

  write(e: LogEntry): void {
    if (this.broken) return;
    const line = `${JSON.stringify({ t: e.t, level: e.level, source: e.source, message: e.message })}\n`;
    try {
      if (this.size + line.length > this.maxBytes) this.rotate();
      appendFileSync(this.file(0), line, 'utf8');
      this.size += Buffer.byteLength(line);
    } catch {
      // Logging must never take the show down (full disk, permissions): stop mirroring instead.
      this.broken = true;
    }
  }

  /** Last `n` lines across the current and rotated files, oldest first. */
  tail(n = 2000): string[] {
    const out: string[] = [];
    for (let i = 0; i <= this.keep && out.length < n; i++) {
      const file = this.file(i);
      if (!existsSync(file)) continue;
      const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
      out.unshift(...lines.slice(-(n - out.length)));
    }
    return out;
  }

  files(): string[] {
    return readdirSync(this.dir).filter((f) => /^luma(\.\d+)?\.log$/u.test(f)).sort();
  }

  private file(i: number): string {
    return path.join(this.dir, i === 0 ? LOG_FILE : `luma.${i}.log`);
  }

  private rotate(): void {
    rmSync(this.file(this.keep), { force: true });
    for (let i = this.keep - 1; i >= 0; i--) {
      if (existsSync(this.file(i))) renameSync(this.file(i), this.file(i + 1));
    }
    this.size = 0;
  }
}
