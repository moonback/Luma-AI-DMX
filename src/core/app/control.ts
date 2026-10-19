import type { OscMessage } from '../control/osc';
import type { RemoteState } from '../control/remote';
import type { Command } from '../../shared/commands';
import { UserError } from './shared';
import type { AppService } from './AppService';

/* External control: OSC server, tablet remote and its state. */

export async function applyControl(app: AppService): Promise<void> {
  await applyRemote(app);
  const o = app.settings.control.osc;
  const conf = o.enabled ? `${o.bind}:${o.port}` : '';
  if (conf === app.oscConfig) return;
  app.oscConfig = conf;
  if (!o.enabled) {
    await app.osc.stop();
    return;
  }
  try {
    await app.osc.start(o.port, o.bind);
    app.logger.info('OSC', `Écoute UDP ${o.bind}:${o.port}${o.bind === '0.0.0.0' ? ' (réseau local, sans authentification)' : ''}`);
  } catch (err) {
    app.oscConfig = '';
    app.logger.error('OSC', `Impossible d’écouter sur ${o.bind}:${o.port} : ${(err as Error).message}`);
  }
}

export async function applyRemote(app: AppService): Promise<void> {
  const r = app.settings.control.remote;
  const conf = r.enabled ? `${r.bind}|${r.port}|${r.token}` : '';
  if (conf === app.remoteConfig) return;
  app.remoteConfig = conf;
  if (!r.enabled || !r.token) {
    await app.remote.stop();
    return;
  }
  try {
    await app.remote.start(r.port, r.bind, r.token);
    app.logger.info('Télécommande', `Serveur actif sur ${r.bind}:${r.port} (accès par jeton, HTTP non chiffré : réseau privé uniquement)`);
  } catch (err) {
    app.remoteConfig = '';
    app.logger.error('Télécommande', `Impossible d’écouter sur ${r.bind}:${r.port} : ${(err as Error).message}`);
  }
}

export function remoteState(app: AppService): RemoteState {
  const snap = app.engine.snapshot();
  return {
    master: app.engine.master,
    blackout: app.engine.blackout,
    transmitting: app.outputs.transmitting,
    bpm: app.engine.bpm,
    locate: app.locate?.photo && app.locate.awaitingPhoto ? { frame: app.locate.frame, total: app.locate.seq.frames.length, label: app.locate.seq.frames[app.locate.frame]!.label } : null,
    lists: app.project.cueLists.map((l, i) => {
      const pb = snap.playbacks.find((p) => p.cueListId === l.id);
      return { index: i + 1, name: l.name, state: pb?.state ?? 'idle', cue: pb?.cueName ?? null };
    }),
  };
}

/**
 * OSC address map. Deliberately limited to show control: nothing can arm an output or resume transmission remotely.
 * Lists and cues are 1-based; the cue list defaults to the first one.
 */
export async function onOsc(app: AppService, m: OscMessage): Promise<boolean> {
  const num = (i: number) => (typeof m.args[i] === 'number' ? (m.args[i] as number) : typeof m.args[i] === 'boolean' ? Number(m.args[i]) : undefined);
  const list = (i: number) => {
    const l = app.project.cueLists[(num(i) ?? 1) - 1];
    if (!l) throw new UserError('Liste de cues introuvable');
    return l.id;
  };
  const run = async (c: Command) => (await app.handle(c) as { ok?: boolean } | undefined)?.ok !== false;
  switch (m.address) {
    case '/luma/go': return run({ type: 'cue.go', listId: list(0) });
    case '/luma/back': return run({ type: 'cue.back', listId: list(0) });
    case '/luma/pause': return run({ type: 'cue.pause', listId: list(0) });
    case '/luma/resume': return run({ type: 'cue.resume', listId: list(0) });
    case '/luma/goto': return run({ type: 'cue.goto', listId: list(1), index: Math.max(0, (num(0) ?? 1) - 1) });
    case '/luma/blackout': return run({ type: 'engine.blackout', on: num(0) === undefined ? !app.engine.blackout : num(0)! > 0 });
    case '/luma/master': return run({ type: 'engine.master', value: Math.min(1, Math.max(0, num(0) ?? 1)) });
    case '/luma/bpm': return run({ type: 'engine.bpm', bpm: Math.min(300, Math.max(20, num(0) ?? 120)) });
    case '/luma/release': return run({ type: 'programmer.release' });
    case '/luma/releaseall': return run({ type: 'engine.releaseAll' });
    case '/luma/stop': return run({ type: 'output.transmit', on: false });
    case '/luma/timecode': return (await app.handle({ type: 'timeline.timecode', seconds: Math.max(0, num(0) ?? 0) }) as { chasing: boolean }).chasing;
    default:
      app.logger.debug('OSC', `Adresse inconnue ${m.address}`);
      return false;
  }
}
