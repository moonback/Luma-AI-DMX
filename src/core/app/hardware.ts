import type { EngineMetrics } from '../engine/Engine';
import type { OutputStatus } from '../protocols/config';
import type { TestPattern } from '../engine/testPattern';
import type { AppInfo } from '../log/diagnostic';

export interface Reconnect {
  outputId: string;
  name: string;
  at: string;
  seconds: number;
}

/** Acceptance criterion of the hardware campaign (docs/HARDWARE.md). */
export const RECONNECT_MAX_S = 10;

/**
 * What a hardware validation session needs to report: how long each output took to come back after an error, and a
 * Markdown summary to paste into docs/HARDWARE.md.
 */
export class HardwareSession {
  readonly startedAt = Date.now();
  private readonly errorSince = new Map<string, number>();
  readonly reconnects: Reconnect[] = [];
  /** Patterns run during the session, for the report. */
  readonly patterns: { kind: string; universes: number[]; at: string }[] = [];

  /** Called on every output state change; returns the outage duration when an output comes back. */
  onState(s: Pick<OutputStatus, 'id' | 'name'>, state: string, prev: string | undefined, now = Date.now()): number | null {
    if (state === 'error' && prev !== 'error') this.errorSince.set(s.id, now);
    if (state === 'ready' && prev === 'error') {
      const since = this.errorSince.get(s.id);
      this.errorSince.delete(s.id);
      if (since === undefined) return null;
      const seconds = Math.round((now - since) / 100) / 10;
      this.reconnects.push({ outputId: s.id, name: s.name, at: new Date(now).toISOString(), seconds });
      if (this.reconnects.length > 200) this.reconnects.shift();
      return seconds;
    }
    return null;
  }

  notePattern(p: TestPattern | null): void {
    if (p) this.patterns.push({ kind: p.kind, universes: p.universes, at: new Date().toISOString() });
  }

  /** Same session as `report`, structured for archiving and comparing campaigns (one file per interface tested). */
  reportJson(input: { app: AppInfo; metrics: EngineMetrics; outputs: OutputStatus[]; testPattern: TestPattern | null }, now = Date.now()) {
    const hours = (now - this.startedAt) / 3_600_000;
    const real = input.outputs.filter((o) => o.real);
    return {
      format: 'luma-hardware-session' as const,
      version: 1,
      at: new Date(now).toISOString(),
      app: input.app,
      hours: Math.round(hours * 100) / 100,
      engine: input.metrics,
      patterns: this.patterns,
      activePattern: input.testPattern?.kind ?? null,
      outputs: input.outputs.map((o) => {
        const rc = this.reconnects.filter((r) => r.outputId === o.id);
        return { name: o.name, kind: o.kind, real: o.real, state: o.state, frames: o.stats.framesSent, packets: o.stats.packetsSent, errors: o.stats.errors, fps: o.stats.measuredFps, reconnects: rc.length, maxReconnectS: rc.length ? Math.max(...rc.map((r) => r.seconds)) : null };
      }),
      criteria: {
        noSendErrors: real.length > 0 && real.every((o) => o.stats.errors === 0),
        eightHours: hours >= 8,
        reconnectUnderLimit: this.reconnects.length > 0 && this.reconnects.every((r) => r.seconds <= RECONNECT_MAX_S),
        testerChecked: null as boolean | null, // DMX tester: checked by hand
      },
    };
  }

  report(input: { app: AppInfo; metrics: EngineMetrics; outputs: OutputStatus[]; testPattern: TestPattern | null }, now = Date.now()): string {
    const hours = (now - this.startedAt) / 3_600_000;
    const m = input.metrics;
    const real = input.outputs.filter((o) => o.real);
    const lines = [
      `## Session matériel — ${new Date(now).toLocaleString('fr-FR')}`,
      '',
      `- Application : ${input.app.name} ${input.app.version} (${input.app.platform}/${input.app.arch})`,
      `- Durée de la session : ${hours.toFixed(2)} h`,
      `- Moteur : ${m.measuredHz} Hz mesurés pour ${m.rateHz} Hz configurés · gigue moyenne ${m.jitterMs} ms · tick max ${m.maxTickMs} ms · ${m.overruns} dépassement(s) · ${m.ticks} ticks`,
      `- Mires utilisées : ${this.patterns.length ? this.patterns.map((p) => `${p.kind} (U${p.universes.join(', U')})`).join(' ; ') : 'aucune'}${input.testPattern ? ` — mire « ${input.testPattern.kind} » encore active` : ''}`,
      '',
      '| Sortie | Type | État | Trames | Paquets | Erreurs | Cadence | Reconnexions (max) |',
      '|---|---|---|---|---|---|---|---|',
      ...input.outputs.map((o) => {
        const rc = this.reconnects.filter((r) => r.outputId === o.id);
        const max = rc.length ? Math.max(...rc.map((r) => r.seconds)) : null;
        const verdict = max === null ? '—' : `${rc.length} (${max} s${max > RECONNECT_MAX_S ? ' ⚠' : ''})`;
        return `| ${o.name.replace(/\|/gu, '/')} | ${o.kind}${o.real ? '' : ' (simulée)'} | ${o.state} | ${o.stats.framesSent} | ${o.stats.packetsSent} | ${o.stats.errors} | ${o.stats.measuredFps} fps | ${verdict} |`;
      }),
      '',
      '### Critères',
      `- [${real.length && real.every((o) => o.stats.errors === 0) ? 'x' : ' '}] Aucune erreur d'envoi sur les sorties réelles`,
      `- [${hours >= 8 ? 'x' : ' '}] Session d'au moins 8 h`,
      `- [${this.reconnects.length && this.reconnects.every((r) => r.seconds <= RECONNECT_MAX_S) ? 'x' : ' '}] Reconnexion < ${RECONNECT_MAX_S} s (débrancher/rebrancher au moins une fois)`,
      '- [ ] Testeur DMX : valeurs reçues = valeurs envoyées sur 100 % des canaux (mire « signature », à cocher à la main)',
    ];
    if (this.reconnects.length) lines.push('', '### Reconnexions', ...this.reconnects.map((r) => `- ${r.at} · ${r.name} : ${r.seconds} s`));
    return `${lines.join('\n')}\n`;
  }
}
