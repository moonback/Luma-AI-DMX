import path from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { vi } from 'vitest';
import { UserError } from '../../src/core/app/AppService';
import { cueListSchema, effectSchema, timelineSchema, type AudioConfig } from '../../src/core/model/schemas';
import { OutputManager } from '../../src/core/protocols/OutputManager';
import { VirtualOutput } from '../../src/core/protocols/virtual';
import { EnttecProOutput, buildEnttecProPacket, type SerialLike } from '../../src/core/protocols/enttec';
import type { OutputConfig } from '../../src/core/protocols/config';
import { AudioReactive } from '../../src/core/audio/reactive';
import { ProjectIndex } from '../../src/core/engine/resolve';
import { addRecent, autosave, autosaveFile } from '../../src/core/app/files';
import { LtcDecoder, encodeLtc, ltcFrameBits } from '../../src/core/control/timecode';
import { demoProject, makeEngine, makeService } from '../helpers';

async function service() {
  const { svc, dataDir } = makeService();
  await svc.init();
  svc.setProject(demoProject(), true);
  return { svc, dataDir };
}

const fx = (id: string, extra: Record<string, unknown> = {}) => effectSchema.parse({ id, name: `FX ${id}`, type: 'pulse', targets: { groupIds: ['g-pars'] }, params: {}, ...extra });

describe('handler de programmation (LUMA-031)', () => {
  it('groupes : création, filtrage des inconnus, réordonnancement, suppression avec nettoyage des effets', async () => {
    const { svc } = await service();
    await svc.execute({ type: 'group.upsert', group: { id: 'g2', name: 'Spots', color: '#fff000', fixtureIds: ['spot1', 'ghost'] } });
    expect(svc.project.groups.find((g) => g.id === 'g2')!.fixtureIds).toEqual(['spot1']);
    await svc.execute({ type: 'group.upsert', group: { id: 'g2', name: 'Spots 2', color: '#fff000', fixtureIds: ['spot1', 'spot2'] } });
    expect(svc.project.groups.find((g) => g.id === 'g2')!.name).toBe('Spots 2');
    await svc.execute({ type: 'group.reorder', ids: ['g2', 'g-pars'] });
    expect(svc.project.groups.map((g) => g.id)).toEqual(['g2', 'g-pars']);
    await svc.execute({ type: 'effect.upsert', effect: fx('e1') });
    await svc.execute({ type: 'group.remove', id: 'g-pars' });
    expect(svc.project.effects[0]!.targets.groupIds).toEqual([]);
    await svc.dispose();
  });

  it('palettes : application, enregistrement depuis le programmeur, refus', async () => {
    const { svc } = await service();
    await svc.execute({ type: 'palette.upsert', palette: { id: 'p1', name: 'Rouge', kind: 'color', color: '#ff0000', values: {} } });
    await svc.execute({ type: 'palette.upsert', palette: { id: 'p1', name: 'Rouge vif', kind: 'color', color: '#ff0000', values: {} } });
    expect((await svc.execute({ type: 'palette.apply', id: 'p1', fixtureIds: ['par1', 'ghost'] })).applied).toBeGreaterThan(0);
    await expect(svc.execute({ type: 'palette.apply', id: 'nope', fixtureIds: ['par1'] })).rejects.toThrow(UserError);
    await expect(svc.execute({ type: 'palette.recordFromProgrammer', name: 'X', kind: 'color', fixtureId: 'par2' })).rejects.toThrow(/aucune valeur/);
    await expect(svc.execute({ type: 'palette.recordFromProgrammer', name: 'X', kind: 'position', fixtureId: 'par1' })).rejects.toThrow(/Aucune valeur de ce type/);
    const { id } = await svc.execute({ type: 'palette.recordFromProgrammer', name: 'Copie', kind: 'color', fixtureId: 'par1' });
    expect(svc.project.palettes.some((p) => p.id === id)).toBe(true);
    await svc.execute({ type: 'palette.remove', id: 'p1' });
    expect(svc.project.palettes.some((p) => p.id === 'p1')).toBe(false);
    await svc.dispose();
  });

  it('programmeur : couleur par module, relâche par attribut', async () => {
    const { svc } = await service();
    expect((await svc.execute({ type: 'programmer.setColor', fixtureIds: ['par1', 'ghost'], color: '#00ff00' })).applied).toBeGreaterThan(0);
    expect((await svc.execute({ type: 'programmer.setColor', fixtureIds: ['par1'], color: '#00ff00', module: 'inexistant' })).applied).toBe(0);
    await svc.execute({ type: 'programmer.set', fixtureIds: ['par1'], values: { dimmer: 0.5 }, confirmSpecial: false });
    await svc.execute({ type: 'programmer.release', fixtureIds: ['par1'], attributes: ['dimmer'] });
    expect(svc.engine.getProgrammer().par1?.dimmer).toBeUndefined();
    await svc.dispose();
  });

  it('scènes : enregistrement, aperçu, chargement, duplication, suppression avec nettoyage', async () => {
    const { svc } = await service();
    await expect(svc.execute({ type: 'scene.record', name: 'Vide' })).rejects.toThrow(/programmeur est vide/);
    await svc.execute({ type: 'programmer.set', fixtureIds: ['par1', 'par2'], values: { dimmer: 1 }, confirmSpecial: false });
    const { id } = await svc.execute({ type: 'scene.record', name: 'Pleins feux', fixtureIds: ['par1'] });
    expect(Object.keys(svc.project.scenes.find((s) => s.id === id)!.values)).toEqual(['par1']);
    expect((await svc.execute({ type: 'scene.preview', id })).values.par1).toBeDefined();
    await svc.execute({ type: 'programmer.release' });
    await svc.execute({ type: 'scene.load', id });
    expect(svc.engine.getProgrammer().par1?.dimmer).toBe(1);
    const dup = await svc.execute({ type: 'scene.duplicate', id });
    await svc.execute({ type: 'scene.upsert', scene: { ...svc.project.scenes.find((s) => s.id === dup.id)!, name: 'Renommée' } });
    for (const t of ['scene.load', 'scene.preview', 'scene.duplicate'] as const) await expect(svc.execute({ type: t, id: 'nope' })).rejects.toThrow(UserError);
    const list = cueListSchema.parse({ id: 'l1', name: 'L', cues: [{ id: 'c1', number: 1, name: 'A', sceneId: id, effectIds: [] }] });
    await svc.execute({ type: 'cueList.upsert', cueList: list });
    await svc.execute({ type: 'timeline.upsert', timeline: timelineSchema.parse({ id: 't1', name: 'T', duration: 30, events: [{ id: 'e', kind: 'scene', start: 0, duration: 5, refId: id }] }) });
    await svc.execute({ type: 'scene.remove', id });
    expect(svc.project.cueLists.find((l) => l.id === 'l1')!.cues[0]!.sceneId).toBeNull();
    expect(svc.project.timelines.find((t) => t.id === 't1')!.events).toEqual([]);
    await svc.dispose();
  });

  it('listes de cues : références vérifiées, transport GO/BACK/GOTO/pause/reprise/stop', async () => {
    const { svc } = await service();
    const bad = cueListSchema.parse({ id: 'l1', name: 'L', cues: [{ id: 'c1', number: 1, name: 'A', sceneId: 'ghost', effectIds: [] }] });
    await expect(svc.execute({ type: 'cueList.upsert', cueList: bad })).rejects.toThrow(/scène inconnue/);
    const badFx = cueListSchema.parse({ id: 'l1', name: 'L', cues: [{ id: 'c1', number: 1, name: 'A', sceneId: null, effectIds: ['ghost'] }] });
    await expect(svc.execute({ type: 'cueList.upsert', cueList: badFx })).rejects.toThrow(/effet inconnu/);
    const list = cueListSchema.parse({ id: 'l1', name: 'L', cues: [1, 2, 3].map((n) => ({ id: `c${n}`, number: n, name: `C${n}`, sceneId: null, fade: 0, effectIds: [] })) });
    await svc.execute({ type: 'cueList.upsert', cueList: list });
    await svc.execute({ type: 'cueList.upsert', cueList: { ...list, name: 'Renommée' } });
    const pb = () => svc.engine.snapshot().playbacks.find((p) => p.cueListId === 'l1')!;
    expect((await svc.execute({ type: 'cue.go', listId: 'l1' })).ok).toBe(true);
    await svc.execute({ type: 'cue.go', listId: 'l1' });
    expect(pb().index).toBe(1);
    await svc.execute({ type: 'cue.back', listId: 'l1' });
    expect(pb().index).toBe(0);
    await svc.execute({ type: 'cue.goto', listId: 'l1', index: 2 });
    expect(pb().index).toBe(2);
    await svc.execute({ type: 'cue.pause', listId: 'l1' });
    expect(pb().state).toBe('paused');
    await svc.execute({ type: 'cue.resume', listId: 'l1' });
    await svc.execute({ type: 'cue.stop', listId: 'l1' });
    expect(pb().state).toBe('idle');
    await svc.execute({ type: 'cueList.remove', id: 'l1' });
    expect(svc.project.cueLists.some((l) => l.id === 'l1')).toBe(false);
    await svc.dispose();
  });

  it('effets : démarrage, pause, arrêt, suppression nettoyant cues et timelines', async () => {
    const { svc } = await service();
    await svc.execute({ type: 'effect.upsert', effect: fx('e1') });
    await svc.execute({ type: 'effect.upsert', effect: fx('e1', { name: 'Renommé' }) });
    await expect(svc.execute({ type: 'effect.start', id: 'nope' })).rejects.toThrow(/Effet introuvable/);
    const { instanceId } = await svc.execute({ type: 'effect.start', id: 'e1' });
    await svc.execute({ type: 'effect.pause', instanceId, paused: true });
    expect(svc.engine.snapshot().effects[0]!.paused).toBe(true);
    await svc.execute({ type: 'effect.stop', instanceId });
    await svc.execute({ type: 'effect.start', id: 'e1' });
    await svc.execute({ type: 'effect.stopAll' });
    expect(svc.engine.snapshot().effects).toEqual([]);
    await svc.execute({ type: 'cueList.upsert', cueList: cueListSchema.parse({ id: 'l1', name: 'L', cues: [{ id: 'c1', number: 1, name: 'A', sceneId: null, effectIds: ['e1'] }] }) });
    await svc.execute({ type: 'timeline.upsert', timeline: timelineSchema.parse({ id: 't1', name: 'T', duration: 30, events: [{ id: 'e', kind: 'effect', start: 0, duration: 5, refId: 'e1' }] }) });
    await svc.execute({ type: 'effect.remove', id: 'e1' });
    expect(svc.project.cueLists.find((l) => l.id === 'l1')!.cues[0]!.effectIds).toEqual([]);
    expect(svc.project.timelines[0]!.events).toEqual([]);
    await svc.dispose();
  });

  it('timelines : référence inconnue refusée, transport et timecode', async () => {
    const { svc } = await service();
    await expect(svc.execute({ type: 'timeline.upsert', timeline: timelineSchema.parse({ id: 't1', name: 'T', duration: 30, events: [{ id: 'e', kind: 'cue', start: 0, refId: 'ghost' }] }) })).rejects.toThrow(/référence inconnue/);
    await svc.execute({ type: 'timeline.upsert', timeline: timelineSchema.parse({ id: 't1', name: 'T', duration: 30, events: [{ id: 'm', kind: 'marker', start: 1 }] }) });
    await svc.execute({ type: 'timeline.upsert', timeline: timelineSchema.parse({ id: 't1', name: 'T bis', duration: 30, events: [] }) });
    await expect(svc.execute({ type: 'timeline.play', id: 'nope' })).rejects.toThrow(/Timeline introuvable/);
    await svc.execute({ type: 'timeline.play', id: 't1' });
    await svc.execute({ type: 'timeline.seek', seconds: 10 });
    await svc.execute({ type: 'timeline.pause' });
    expect(svc.engine.snapshot().timeline).toMatchObject({ state: 'paused', time: 10 });
    await svc.execute({ type: 'timeline.stop' });
    expect((await svc.execute({ type: 'timeline.timecode', seconds: 3 })).chasing).toBe(true); // first timeline by default
    await svc.execute({ type: 'timeline.remove', id: 't1' });
    expect((await svc.execute({ type: 'timeline.timecode', seconds: 3 })).chasing).toBe(false);
    await svc.dispose();
  });

  it('historique de scène : annuler puis rétablir', async () => {
    const { svc } = await service();
    await svc.execute({ type: 'scene.undo' }); // empty history: no-op
    await svc.execute({ type: 'fixture.update', id: 'par1', patch: { position: { x: 7, y: 7 } } });
    await svc.execute({ type: 'scene.undo' });
    expect(svc.project.patch.find((f) => f.id === 'par1')!.position).toEqual({ x: -2, y: 1 });
    await svc.execute({ type: 'scene.redo' });
    expect(svc.project.patch.find((f) => f.id === 'par1')!.position).toEqual({ x: 7, y: 7 });
    await svc.dispose();
  });
});

describe('autosauvegarde et projets récents (LUMA-033)', () => {
  it('écrit seulement si modifié et à l’échéance ; 0 = désactivée sauf forcée ; erreur journalisée', async () => {
    const { svc, dataDir } = await service();
    await autosave(svc, true);
    expect(existsSync(autosaveFile(svc))).toBe(false); // clean project
    svc.mutate((d) => { d.meta.notes = 'x'; });
    svc.lastAutosave = Date.now();
    await autosave(svc);
    expect(existsSync(autosaveFile(svc))).toBe(false); // interval not reached
    svc.lastAutosave = 0;
    await autosave(svc);
    expect(existsSync(autosaveFile(svc))).toBe(true);
    svc.settings.general.autosaveMinutes = 0;
    svc.lastAutosave = 0;
    svc.mutate((d) => { d.meta.notes = 'y'; });
    const before = svc.logger.recent().length;
    await autosave(svc);
    expect(svc.logger.recent().length).toBe(before); // disabled
    // Write failure: the autosave folder is a file.
    svc.opts.dataDir = path.join(dataDir, 'blocked');
    writeFileSync(svc.opts.dataDir, 'not a folder');
    await autosave(svc, true);
    expect(svc.logger.recent().some((e) => e.level === 'error' && e.message.includes('Sauvegarde automatique impossible'))).toBe(true);
    await svc.dispose();
  });

  it('projets récents : le plus récent en tête, sans doublon, 10 au plus', async () => {
    const { svc } = await service();
    for (let i = 0; i < 12; i++) addRecent(svc, `p${i}`);
    addRecent(svc, 'p5');
    const r = svc.settings.general.recentProjects;
    expect(r[0]).toBe('p5');
    expect(r).toHaveLength(10);
    expect(new Set(r).size).toBe(10);
    await svc.dispose();
  });
});

describe('réactions audio (LUMA-034)', () => {
  const features = (over: Record<string, unknown> = {}) => ({ t: 0, level: 0.8, levelDb: -2, energy: 0.6, onset: false, onsetStrength: 0, bpm: null, bpmConfidence: 0, energyRise: false, beat: false, barPosition: null, tempoLocked: false, bass: 0.5, brightness: 0.5, onsetDensity: 0.5, prediction: null, ...over });

  function rig(config: (c: AudioConfig) => void) {
    const { engine, project } = makeEngine();
    const index = new ProjectIndex(project);
    const cfg = structuredClone(project.audio);
    const all = { fixtureIds: ['par1', 'par2', 'spot1'], groupIds: [] };
    for (const r of [cfg.reactions.beatFlash, cfg.reactions.energyToColor, cfg.reactions.levelToIntensity, cfg.reactions.followers.intensityFromBass, cfg.reactions.followers.colorFromBrightness, cfg.reactions.followers.moveFromOnsets]) r.targets = all;
    config(cfg);
    let now = 0;
    const audio = new AudioReactive(engine, () => index, () => cfg, () => 55, () => now);
    return { engine, audio, cfg, at: (t: number) => { now = t; } };
  }

  it('flash sur attaque, couleur selon l’énergie, intensité selon le niveau et les basses, mouvement', () => {
    const { engine, audio } = rig((c) => {
      c.reactions.beatFlash.enabled = true;
      c.reactions.energyToColor.enabled = true;
      c.reactions.levelToIntensity.enabled = true;
      c.reactions.followers.intensityFromBass.enabled = true;
      c.reactions.followers.colorFromBrightness.enabled = true;
      c.reactions.followers.moveFromOnsets.enabled = true;
    });
    audio.push(features({ onset: true }), 'live');
    engine.tick(25);
    const src = engine.sources;
    expect(src.par1?.dimmer).toMatch(/Audio/);
    expect(src.spot1?.pan).toBe('Audio');
    expect(audio.status()).toMatchObject({ active: true, source: 'live' });
  });

  it('suivi du BPM, GO sur montée d’énergie, GO sur drop prédit armé une seule fois', () => {
    const { engine, audio, cfg, at } = rig(() => undefined);
    const list = cueListSchema.parse({ id: 'l1', name: 'L', cues: [{ id: 'c1', number: 1, name: 'A', sceneId: null, effectIds: [] }, { id: 'c2', number: 2, name: 'B', sceneId: null, effectIds: [] }] });
    const project = demoProject();
    project.cueLists.push(list);
    engine.setIndex(new ProjectIndex(project));
    cfg.reactions.bpmFollow = { enabled: true, minConfidence: 0.5 };
    audio.push(features({ bpm: 128, bpmConfidence: 0.9 }), 'track');
    expect(engine.bpm).toBe(128);
    cfg.reactions.energyRiseGo = { enabled: true, cueListId: 'l1', ratio: 1.8 };
    audio.push(features({ energyRise: true }), 'live');
    expect(engine.snapshot().playbacks.find((p) => p.cueListId === 'l1')?.index).toBe(0);

    cfg.reactions.dropGo = { enabled: true, cueListId: 'l1', minConfidence: 0.8, kinds: ['drop'] };
    audio.armDrop(true);
    const prediction = { kind: 'drop' as const, confidence: 0.9, at: 2, inBeats: 4, source: 'track' as const };
    at(1000);
    audio.push(features({ t: 1, prediction }), 'track'); // drop due 1 s later
    expect(audio.status().dropFiresInMs).toBe(1000);
    at(2100);
    engine.tick(25);
    expect(engine.snapshot().playbacks.find((p) => p.cueListId === 'l1')?.index).toBe(1);
    expect(audio.status().dropArmed).toBe(false); // one shot
    // A withdrawn prediction long before its time cancels the GO.
    audio.armDrop(true);
    at(3000);
    audio.push(features({ t: 3, prediction: { ...prediction, at: 6 } }), 'track');
    at(3100);
    audio.push(features({ t: 3.1, prediction: null }), 'track');
    expect(audio.status().dropFiresInMs).toBeNull();
    audio.armDrop(false);
  });

  it('sans données fraîches, les contributions audio sont relâchées', () => {
    const { engine, audio, at } = rig((c) => { c.reactions.levelToIntensity.enabled = true; });
    audio.push(features(), 'simulated');
    engine.tick(25);
    at(5000);
    engine.tick(25);
    expect(audio.status()).toMatchObject({ active: false, source: 'none' });
    expect(Object.values(engine.sources).some((s) => Object.values(s).some((v) => v.includes('Audio')))).toBe(false);
  });
});

describe('machine d’états des sorties (LUMA-036)', () => {
  const artnet = (id: string, enabled = true): OutputConfig => ({ id, name: id, kind: 'artnet', enabled, maxFps: 40, host: '127.0.0.1', bindAddress: '', broadcast: false, universeMap: [{ local: 1, remote: 0 }] });

  it('erreur, reconnexion avec backoff, fermeture pendant la reconnexion', async () => {
    vi.useFakeTimers();
    try {
      const v = new VirtualOutput({ id: 'v', name: 'v', kind: 'virtual', enabled: true, maxFps: 40, universes: [1] });
      await v.open();
      v.inject({ type: 'disconnect' });
      expect(v.state).toBe('error');
      await vi.advanceTimersByTimeAsync(1000); // first retry fails: still disconnected
      expect(v.state).toBe('error');
      v.inject({ type: 'reconnect' });
      await vi.advanceTimersByTimeAsync(2000); // backoff doubled
      expect(v.state).toBe('ready');
      v.inject({ type: 'fail-next', count: 1 });
      v.send(1, new Uint8Array(512));
      expect(v.state).toBe('error');
      await v.close();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(v.state).toBe('disarmed'); // closed: no reconnection
    } finally {
      vi.useRealTimers();
    }
  });

  it('propriété : une sortie réelle n’est jamais ouverte sans arm()', async () => {
    let seed = 42;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
    for (let run = 0; run < 200; run++) {
      // A virtual adapter behind a real (Art-Net) config: same safety rules, no network.
      const om = new OutputManager((c) => new VirtualOutput(c));
      let armed = false;
      for (let step = 0; step < 15; step++) {
        const op = rnd(4);
        if (op === 0) await om.configure([artnet('a', rnd(2) === 0)]);
        else if (op === 1) await om.arm('a').then(() => { armed = true; }, () => undefined);
        else if (op === 2) { await om.disarm('a'); armed = false; }
        else await om.configure([]).then(() => { armed = false; });
        const s = om.status().find((x) => x.id === 'a');
        if (s?.state === 'ready') expect(armed).toBe(true);
      }
    }
  });
});

describe('Enttec DMX USB Pro (LUMA-037)', () => {
  function fakePort() {
    const listeners: Record<string, ((e?: Error) => void)[]> = {};
    const writes: Buffer[] = [];
    let pending: ((err: Error | null) => void) | null = null;
    const port: SerialLike = {
      isOpen: true,
      write: (data, cb) => { writes.push(data); pending = cb; },
      close: (cb) => { port.isOpen = false; cb(null); },
      on: (ev, cb) => { (listeners[ev] ??= []).push(cb); },
    };
    return { port, writes, finish: (err: Error | null = null) => { const p = pending; pending = null; p?.(err); }, emit: (ev: string, e?: Error) => listeners[ev]?.forEach((l) => l(e)) };
  }
  const cfg = { id: 'u', name: 'USB', kind: 'enttec-pro' as const, enabled: true, maxFps: 40, path: 'COM3', universe: 1 };

  it('cadrage, trame abandonnée tant que l’écriture précédente n’est pas finie, erreurs', async () => {
    const f = fakePort();
    const out = new EnttecProOutput(cfg, async () => f.port);
    await out.open();
    expect(out.state).toBe('ready');
    const data = new Uint8Array(512).fill(7);
    out.send(1, data);
    out.send(1, data); // previous write still pending
    expect(f.writes).toHaveLength(1);
    expect(out.dropped).toBe(1);
    expect([...f.writes[0]!.subarray(0, 5)]).toEqual([0x7e, 6, 0x01, 0x02, 0x00]);
    expect(f.writes[0]!.at(-1)).toBe(0xe7);
    expect(buildEnttecProPacket(data)).toEqual(f.writes[0]);
    f.finish(new Error('écriture refusée'));
    expect(out.state).toBe('error');
    await out.close();
    const g = fakePort();
    const out2 = new EnttecProOutput(cfg, async () => g.port);
    await out2.open();
    g.emit('close');
    expect(out2.detail).toMatch(/déconnecté/);
    await out2.close();
  });

  it('reconnexion : une écriture perdue avec l’ancien port ne rend pas le nouveau muet', async () => {
    const f = fakePort(), g = fakePort();
    let opened = 0;
    const out = new EnttecProOutput(cfg, async () => (opened++ ? g.port : f.port));
    await out.open();
    out.send(1, new Uint8Array(512)); // never acknowledged: the port goes away first
    await out.close();
    await out.open();
    out.send(1, new Uint8Array(512));
    expect(g.writes).toHaveLength(1);
    await out.close();
  });

  it('ouverture impossible : état d’erreur', async () => {
    const out = new EnttecProOutput(cfg, async () => { throw new Error('port occupé'); });
    await out.open();
    expect(out.state).toBe('error');
    await out.close();
  });
});

describe('chaîne timecode (LUMA-052)', () => {
  it('LTC synthétique décodé, poursuivi, puis pause après 500 ms sans signal', async () => {
    const tc = { hours: 0, minutes: 1, seconds: 2, frames: 10, fps: 25 };
    const sr = 48000;
    const bits = [0, 1, 2].flatMap((i) => ltcFrameBits({ ...tc, frames: tc.frames + i }));
    const { samples } = encodeLtc(bits, sr, 25);
    const decoded = new LtcDecoder(sr).push(samples);
    expect(decoded.length).toBeGreaterThan(0);
    expect(decoded[0]).toMatchObject({ minutes: 1, seconds: 2 });

    vi.useFakeTimers();
    try {
      vi.setSystemTime(10_000);
      const { svc } = await service();
      svc.mutate((d) => { d.timelines.push(timelineSchema.parse({ id: 't1', name: 'T', duration: 600, events: [] })); });
      expect((await svc.execute({ type: 'timeline.timecode', seconds: 62.4 })).chasing).toBe(true);
      expect(svc.engine.snapshot().timeline).toMatchObject({ state: 'playing' });
      vi.setSystemTime(10_600);
      svc.engine.tick(25);
      expect(svc.engine.snapshot().timeline.state).toBe('paused');
      await svc.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('observabilité (LUMA-048, 038)', () => {
  it('échantillons de métriques en écart depuis le précédent, inclus dans le diagnostic ; rapport matériel JSON', async () => {
    const { sampleMetrics, metricsHistory } = await import('../../src/core/app/monitor');
    const { diagnostic } = await import('../../src/core/app/handlers/system');
    const { svc } = await service();
    svc.engine.onBeforeTick(() => { throw new Error('x'); });
    svc.engine.tick(25);
    svc.engine.tick(25);
    expect(sampleMetrics(svc).errors).toBe(2);
    svc.engine.tick(25);
    expect(sampleMetrics(svc).errors).toBe(1);
    expect(metricsHistory(svc)).toHaveLength(2);
    expect(diagnostic(svc).metrics).toHaveLength(2);
    const r = await svc.execute({ type: 'hardware.report' });
    expect(r.json).toMatchObject({ format: 'luma-hardware-session', version: 1 });
    expect(r.json.outputs[0]).toMatchObject({ kind: 'virtual', real: false });
    expect(r.markdown).toContain('Session matériel');
    await svc.dispose();
  });
});
