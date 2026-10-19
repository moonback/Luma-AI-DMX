import { promises as fs } from 'node:fs';
import { writeFileAtomic } from '../project/store';

/* Tokens and cost of the OpenRouter calls, kept on this machine (never sent anywhere), per day. */

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  /** USD, when the provider reports it. */
  cost: number | null;
}

export interface AiUsageDay {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

const empty = (): AiUsageDay => ({ calls: 0, promptTokens: 0, completionTokens: 0, cost: 0 });

export class AiUsageLedger {
  private days: Record<string, AiUsageDay> | null = null;

  constructor(private readonly file: string, private readonly now: () => Date = () => new Date()) {}

  private async load(): Promise<Record<string, AiUsageDay>> {
    if (this.days) return this.days;
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8')) as { days?: Record<string, AiUsageDay> };
      this.days = raw.days && typeof raw.days === 'object' ? raw.days : {};
    } catch {
      this.days = {};
    }
    return this.days;
  }

  async record(u: AiUsage): Promise<void> {
    const days = await this.load();
    const d = (days[this.now().toISOString().slice(0, 10)] ??= empty());
    d.calls++;
    d.promptTokens += u.promptTokens;
    d.completionTokens += u.completionTokens;
    d.cost += u.cost ?? 0;
    await writeFileAtomic(this.file, JSON.stringify({ version: 1, days }), false);
  }

  /** Today and the current calendar month (UTC). */
  async totals(): Promise<{ today: AiUsageDay; month: AiUsageDay }> {
    const days = await this.load();
    const today = this.now().toISOString().slice(0, 10);
    const month = empty();
    for (const [day, d] of Object.entries(days)) {
      if (!day.startsWith(today.slice(0, 7))) continue;
      month.calls += d.calls;
      month.promptTokens += d.promptTokens;
      month.completionTokens += d.completionTokens;
      month.cost += d.cost;
    }
    return { today: days[today] ?? empty(), month };
  }
}
