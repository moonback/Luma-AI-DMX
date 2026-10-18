import { localIpv4Addresses } from '../../protocols/artnet';
import { listSerialPorts } from '../../protocols/enttec';
import { VirtualOutput } from '../../protocols/virtual';
import { ArtNetRdm } from '../../protocols/rdm';
import type { UniverseView } from '../../../shared/commands';
import { UserError } from '../shared';
import type { AppService, CommandIn } from '../AppService';

/* Engine master/blackout/BPM, DMX outputs and RDM. */
export async function handleOutput(app: AppService, cmd: CommandIn<'engine' | 'output' | 'rdm' | 'hardware'>): Promise<unknown> {
  const ok = { ok: true } as const;
  const e = app.engine;
  switch (cmd.type) {
    case 'engine.master': e.master = cmd.value; return ok;
    case 'engine.blackout':
      e.blackout = cmd.on;
      app.logger.info('Moteur', cmd.on ? `Blackout activé (politique : ${app.settings.engine.blackoutPolicy})` : 'Blackout désactivé');
      return ok;
    case 'engine.bpm':
      e.bpm = cmd.bpm;
      e.bpmSource = 'manual';
      return ok;
    case 'engine.releaseAll':
      e.releaseProgrammer();
      e.releaseAi();
      e.stopAllEffects();
      e.stopAllPlaybacks();
      e.timelineStop();
      app.logger.info('Moteur', 'Tout relâché (programmeur, IA, effets, playbacks, timeline)');
      return ok;
    case 'output.configure':
      app.settings.outputs = cmd.outputs;
      await app.persistSettings();
      await app.outputs.configure(cmd.outputs);
      app.logger.info('Sorties', 'Configuration des sorties mise à jour');
      return ok;
    case 'output.arm':
      await app.outputs.arm(cmd.id);
      return ok;
    case 'output.disarm':
      await app.outputs.disarm(cmd.id);
      return ok;
    case 'output.transmit':
      app.outputs.setTransmitting(cmd.on);
      if (!cmd.on) app.logger.warn('Sorties', 'STOP OUTPUT : émissions réelles arrêtées. Les projecteurs appliquent leur propre comportement de perte de signal (maintien ou extinction selon le modèle).');
      else app.logger.info('Sorties', 'Émissions reprises');
      return ok;
    case 'output.universe': {
      const view: UniverseView = { universe: cmd.universe, computed: Array.from(e.universes.get(cmd.universe) ?? new Uint8Array(512)), transmitted: [] };
      for (const s of app.outputs.status()) {
        const fr = app.outputs.transmitted.get(s.id)?.get(cmd.universe);
        if (fr) view.transmitted.push({ outputId: s.id, outputName: s.name, at: fr.at, data: Array.from(fr.data) });
      }
      return view;
    }
    case 'output.virtualHistory':
      return (app.outputs.virtual()?.history ?? []).slice(-cmd.limit);
    case 'output.inject': {
      let v: VirtualOutput | undefined;
      for (const s of app.outputs.status()) {
        const a = app.outputs.get(s.id);
        if (a instanceof VirtualOutput) v = a;
      }
      if (!v) throw new UserError('Aucune sortie virtuelle configurée');
      v.inject(cmd.injection);
      if (cmd.injection.type === 'reconnect') await v.open();
      app.logger.warn('Diagnostic', `Injection de test sur la sortie virtuelle : ${cmd.injection.type}`);
      return ok;
    }
    case 'output.listSerial': return listSerialPorts();
    case 'rdm.discover':
      return withRdm(app, cmd.outputId, cmd.universe, async (rdm) => {
        const uids = await rdm.discover();
        const devices = [];
        for (const uid of uids) devices.push(await rdm.readDevice(uid));
        app.logger.info('RDM', `${devices.length} appareil(s) découvert(s) sur l’univers ${cmd.universe}`);
        return { devices };
      });
    case 'rdm.identify':
      return withRdm(app, cmd.outputId, cmd.universe, async (rdm) => { await rdm.identify(cmd.uid, cmd.on); return ok; });
    case 'rdm.setAddress':
      return withRdm(app, cmd.outputId, cmd.universe, async (rdm) => {
        await rdm.setStartAddress(cmd.uid, cmd.address);
        app.logger.warn('RDM', `Adresse DMX de ${cmd.uid} changée à ${cmd.address} (univers ${cmd.universe})`);
        return ok;
      });
    case 'output.interfaces': return localIpv4Addresses();
    case 'output.testPattern': {
      if (cmd.pattern === null) {
        if (e.testPattern) app.logger.info('Mire', 'Mire de test arrêtée : retour au show');
        e.testPattern = null;
        return ok;
      }
      if (!cmd.confirmed) throw new UserError('Confirmation requise : la mire pilote tous les canaux, reset et lampe compris.');
      e.testPattern = { kind: cmd.pattern, universes: [...new Set(cmd.universes)].sort((a, b) => a - b), startedAt: e.time };
      app.hardware.notePattern(e.testPattern);
      app.logger.warn('Mire', `Mire « ${cmd.pattern} » sur l’univers ${e.testPattern.universes.join(', ')} : le show est remplacé par des valeurs brutes`);
      return ok;
    }
    case 'hardware.report':
      return { markdown: app.hardware.report({ app: app.opts.appInfo ?? { name: 'Luma AI DMX', version: 'dev', platform: process.platform, arch: process.arch, versions: {} }, metrics: e.metrics(), outputs: app.outputs.status(), testPattern: e.testPattern }) };
  }
}

/** Opens an RDM session on an Art-Net output for one local universe, runs `fn`, always closes the socket. */
export async function withRdm<T>(app: AppService, outputId: string, universe: number, fn: (rdm: ArtNetRdm) => Promise<T>): Promise<T> {
  const o = app.settings.outputs.find((x) => x.id === outputId);
  if (!o) throw new UserError('Sortie introuvable');
  if (o.kind !== 'artnet') throw new UserError('RDM disponible uniquement via Art-Net pour l’instant (RDM Enttec non implémenté)');
  const map = o.universeMap.find((m) => m.local === universe);
  if (!map) throw new UserError(`L’univers ${universe} n’est pas routé vers cette sortie`);
  const rdm = new ArtNetRdm({ host: o.host, portAddress: map.remote, bindAddress: o.bindAddress, listenPort: app.opts.rdm?.listenPort, nodePort: app.opts.rdm?.nodePort, timeoutMs: app.opts.rdm?.timeoutMs });
  try {
    await rdm.open();
  } catch (err) {
    throw new UserError(`Port Art-Net 6454 indisponible pour les réponses RDM : ${(err as Error).message}`);
  }
  try {
    return await fn(rdm);
  } catch (err) {
    throw new UserError(`RDM : ${(err as Error).message}`);
  } finally {
    await rdm.close();
  }
}
