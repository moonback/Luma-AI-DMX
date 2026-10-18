import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Opt-in usage statistics, local first: counts of command types (« cue.go », « ai.propose »…) and of errors per
 * source, per day. Never arguments, names, prompts or project content. Nothing leaves the machine: the user can
 * look at them and attach them to a feedback file they send themselves.
 */
export interface UsageDay {
  commands: Record<string, number>;
  errors: Record<string, number>;
  sessions: number;
}

export interface UsageData {
  format: 'luma-usage';
  version: 1;
  days: Record<string, UsageDay>;
}

/** Days of history kept. */
const KEEP_DAYS = 90;
const day = (d = new Date()) => d.toISOString().slice(0, 10);
const empty = (): UsageData => ({ format: 'luma-usage', version: 1, days: {} });

export class UsageStats {
  private data: UsageData = empty();
  private dirty = false;
  enabled = false;

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8')) as UsageData;
      if (raw?.format === 'luma-usage' && raw.days && typeof raw.days === 'object') this.data = raw;
    } catch {
      this.data = empty();
    }
  }

  private today(): UsageDay {
    const k = day();
    return (this.data.days[k] ??= { commands: {}, errors: {}, sessions: 0 });
  }

  session(): void {
    if (!this.enabled) return;
    this.today().sessions++;
    this.dirty = true;
  }

  command(type: string): void {
    if (!this.enabled) return;
    const c = this.today().commands;
    c[type] = (c[type] ?? 0) + 1;
    this.dirty = true;
  }

  error(source: string): void {
    if (!this.enabled) return;
    // Sources are short labels (« Moteur », « Sortie Art-Net »); output names are user text, so they are folded.
    const key = source.startsWith('Sortie ') ? 'Sortie' : source.slice(0, 40);
    const e = this.today().errors;
    e[key] = (e[key] ?? 0) + 1;
    this.dirty = true;
  }

  snapshot(): UsageData {
    return structuredClone(this.data);
  }

  async clear(): Promise<void> {
    this.data = empty();
    this.dirty = false;
    await fs.rm(this.file, { force: true });
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    const cutoff = day(new Date(Date.now() - KEEP_DAYS * 86_400_000));
    for (const k of Object.keys(this.data.days)) if (k < cutoff) delete this.data.days[k];
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(this.data), 'utf8');
    this.dirty = false;
  }
}
