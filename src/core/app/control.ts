import { allowList, type OscArg, type OscMessage } from '../control/osc';
import type { RemoteState } from '../control/remote';
import type { Command } from '../../shared/commands';
import { UserError } from './shared';
import type { AppService } from './AppService';

/* External control: OSC server, tablet remote and its state. */

export async function applyControl(app: AppService): Promise<void> {
  await applyRemote(app);
  const o = app.settings.control.osc;
  app.osc.ack = o.ack;
  app.osc.allow = o.allow.length ? allowList(o.allow) : null;
  const conf = o.enabled ? `${o.bind}:${o.port}` : '';
  if (conf === app.oscConfig) return;
  app.oscConfig = conf;
  if (!o.enabled) {
    await app.osc.stop();
    return;
  }
  try {
    await app.osc.start(o.port, o.bind);
    app.logger.info('OSC', `Écoute UDP ${o.bind}:${o.port}${o.bind === '0.0.0.0' ? ` (réseau local, ${o.allow.length ? `${o.allow.length} adresse(s) autorisée(s)` : 'sans authentification'})` : ''}`);
    if (o.bind === '0.0.0.0' && !o.allow.length) app.logger.warn('OSC', 'Aucune adresse autorisée : n’importe quelle machine du réseau peut piloter le show (Paramètres › Contrôle externe)');
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

const fed = new WeakMap<AppService, Map<string, string>>();

/** State feedback: what changed since the last call, to every configured destination (called 10 times per second). */
export function oscFeedback(app: AppService): void {
  const targets = app.settings.control.osc.feedback;
  if (!targets.length || app.osc.port === null) return;
  const st = remoteState(app);
  const msgs: [string, OscArg[]][] = [
    ['/luma/state/master', [st.master]], ['/luma/state/blackout', [st.blackout ? 1 : 0]], ['/luma/state/bpm', [st.bpm]], ['/luma/state/transmitting', [st.transmitting ? 1 : 0]],
    ...st.lists.flatMap((l): [string, OscArg[]][] => [[`/luma/state/list/${l.index}/cue`, [l.cue ?? '']], [`/luma/state/list/${l.index}/state`, [l.state]]]),
  ];
  let seen = fed.get(app);
  if (!seen) fed.set(app, (seen = new Map()));
  for (const [address, args] of msgs) {
    const key = JSON.stringify(args);
    if (seen.get(address) === key) continue;
    seen.set(address, key);
    for (const t of targets) app.osc.send(address, args, t.host, t.port);
  }
}

export function remoteState(app: AppService): RemoteState {
  const snap = app.engine.snapshot();
  return {
    outputs: app.outputs.status().filter((o) => o.real).map((o) => ({ name: o.name, state: o.state })),
    safety: app.flash.violation ? app.flash.reason : null,
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
