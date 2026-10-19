import { stageLight } from '../safety/flashGuard';
import { buildVisualModel } from '../visualizer/model';
import type { ValuesFrame } from '../../shared/commands';
import type { AppService } from './AppService';
import { endLocate } from './handlers/locate';

/** The main window crashed or reloaded: nothing may stay stuck on stage waiting for it (camera pattern, raw test pattern). */
export function rendererLost(app: AppService, reason: string): void {
  if (!app.locate && !app.engine.testPattern) return;
  endLocate(app);
  app.engine.testPattern = null;
  app.logger.warn('Sécurité', `Fenêtre principale perdue (${reason}) : localisation caméra et mire arrêtées`);
  app.emit('runtime', app.runtimeState());
}

export interface MetricsSample {
  t: string;
  hz: number;
  avgTickMs: number;
  maxTickMs: number;
  jitterMs: number;
  /** Since the previous sample. */
  overruns: number;
  errors: number;
  outputs: { id: string; state: string; fps: number; errors: number }[];
}

/** One sample every 10 s, 24 h kept: enough to tell, after the show, what happened at 21:14. */
export const METRICS_EVERY_MS = 10_000;
const METRICS_MAX = (24 * 3_600_000) / METRICS_EVERY_MS;
const histories = new WeakMap<AppService, { samples: MetricsSample[]; overruns: number; errors: number; out: Map<string, number> }>();

export function sampleMetrics(app: AppService, now = Date.now()): MetricsSample {
  let h = histories.get(app);
  if (!h) histories.set(app, (h = { samples: [], overruns: 0, errors: 0, out: new Map() }));
  const m = app.engine.metrics();
  const outputs = app.outputs.status().map((o) => {
    const errors = o.stats.errors - (h.out.get(o.id) ?? 0);
    h.out.set(o.id, o.stats.errors);
    return { id: o.id, state: o.state, fps: o.stats.measuredFps, errors };
  });
  const s: MetricsSample = { t: new Date(now).toISOString(), hz: m.measuredHz, avgTickMs: m.avgTickMs, maxTickMs: m.maxTickMs, jitterMs: m.jitterMs, overruns: m.overruns - h.overruns, errors: m.errors - h.errors, outputs };
  h.overruns = m.overruns;
  h.errors = m.errors;
  h.samples.push(s);
  if (h.samples.length > METRICS_MAX) h.samples.shift();
  return s;
}

export const metricsHistory = (app: AppService): MetricsSample[] => histories.get(app)?.samples ?? [];

const engineErrors = new WeakMap<AppService, Map<string, { count: number; at: number }>>();

/** Same engine error at most once per 5 s with an occurrence count (a failing tick repeats 40 times per second). */
export function onEngineError(app: AppService, message: string, now = Date.now()): void {
  let seen = engineErrors.get(app);
  if (!seen || seen.size >= 100) engineErrors.set(app, (seen = new Map()));
  const e = seen.get(message);
  if (!e) {
    seen.set(message, { count: 0, at: now });
    app.logger.error('Moteur', message);
    return;
  }
  e.count++;
  if (now - e.at >= 5000) {
    app.logger.error('Moteur', `${message} (× ${e.count} en ${Math.round((now - e.at) / 1000)} s)`);
    e.count = 0;
    e.at = now;
  }
}

/* Per-frame work (throttled events to the UI, photosensitive watch, timecode loss) and output state changes. */

export function onFrame(app: AppService): void {
  const now = Date.now();
  watchFlashes(app, now);
  // Timecode lost for 0.5 s: freewheel stops, the timeline pauses where it is.
  if (app.timecodeAt && now - app.timecodeAt > 500) {
    app.timecodeAt = 0;
    app.engine.timelinePause();
  }
  if (now - app.lastValuesEmit >= 40) {
    app.lastValuesEmit = now;
    const frame: ValuesFrame = { values: app.engine.values };
    if (now - app.lastSourcesEmit >= 200) {
      app.lastSourcesEmit = now;
      frame.sources = app.engine.sources;
    }
    app.emit('values', frame);
  }
  if (now - app.lastRuntimeEmit >= 100) {
    app.lastRuntimeEmit = now;
    app.emit('runtime', app.runtimeState());
  }
}

/** Live photosensitive monitoring of the computed state (every engine frame). */
export function watchFlashes(app: AppService, now: number): void {
  if (app.settings.engine.flashGuard === 'off') return;
  const was = app.flash.violation;
  app.flash = app.flashDetector.push(app.engine.time / 1000, stageLight(buildVisualModel([...app.index.fixtures.values()], app.engine.values)));
  if (app.flash.violation && !was && now - app.lastFlashLog > 5000) {
    app.lastFlashLog = now;
    app.logger.warn('Sécurité', `Garde-fou photosensible : ${app.flash.reason}${app.settings.engine.flashGuard === 'limit' ? ' — limitation active' : ' — passez le garde-fou en mode « Limiter » pour l’atténuer automatiquement'}`);
  }
}

export function onOutputStatus(app: AppService): void {
  for (const s of app.outputs.status()) {
    const prev = app.outputStates.get(s.id);
    if (prev === s.state) continue;
    app.outputStates.set(s.id, s.state);
    if (s.state === 'error') app.logger.error(`Sortie ${s.name}`, `${s.detail} — reconnexion automatique programmée`);
    const outage = app.hardware.onState(s, s.state, prev);
    if (s.state === 'ready' && prev === 'error') app.logger.info(`Sortie ${s.name}`, `Connexion rétablie${outage !== null ? ` après ${outage} s` : ''}`);
    else if (s.state === 'ready' && s.real) app.logger.warn(`Sortie ${s.name}`, 'Sortie réelle ARMÉE : les valeurs DMX sont émises vers le matériel');
    else if (s.state === 'disarmed' && s.real && prev === 'ready') app.logger.info(`Sortie ${s.name}`, 'Sortie réelle désarmée');
  }
}
