import { stageLight } from '../safety/flashGuard';
import { buildVisualModel } from '../visualizer/model';
import type { ValuesFrame } from '../../shared/commands';
import type { AppService } from './AppService';

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
