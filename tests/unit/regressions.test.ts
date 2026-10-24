import { vi } from 'vitest';
import path from 'node:path';
import { OutputManager } from '../../src/core/protocols/OutputManager';
import { onOsc } from '../../src/core/app/control';
import { validateRemoteCommand } from '../../src/core/control/remote';
import { applyShow } from '../../src/core/app/handlers/music';
import { UserError } from '../../src/core/app/AppService';
import type { MusicTrack, ShowPlan } from '../../src/core/model/schemas';
import { demoProject, makeService } from '../helpers';

/** Frames handed to a virtual output by `sendFrames` called every `step()` ms of a simulated clock, for 10 s. */
async function framesSent(maxFps: number, step: () => number): Promise<number> {
  let now = 1000;
  const om = new OutputManager(undefined, () => now);
  await om.configure([{ id: 'v', name: 'V', kind: 'virtual', enabled: true, maxFps, universes: [1] }]);
  const frames = new Map([[1, new Uint8Array(512)]]);
  const end = now + 10_000;
  while (now < end) {
    om.sendFrames(frames);
    now += step();
  }
  return om.status()[0]!.stats.framesSent;
}

describe('limiteur de cadence des sorties', () => {
  it('tient la cadence configurée malgré la gigue des ticks', async () => {
    let seed = 7;
    const jitter = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return (seed / 2 ** 31) * 6 - 3; };
    // 40 Hz ticks ± 3 ms used to drop every tick arriving more than 1 ms early.
    expect(await framesSent(40, () => 25 + jitter())).toBeGreaterThanOrEqual(380);
  });

  it('44 Hz de moteur vers 40 fps : ≈ 40 trames/s (et non 22)', async () => {
    const n = await framesSent(40, () => 1000 / 44);
    expect(n).toBeGreaterThanOrEqual(380);
    expect(n).toBeLessThanOrEqual(410);
  });

  it('ne dépasse jamais un plafond bas', async () => {
    expect(await framesSent(10, () => 25)).toBeLessThanOrEqual(105);
  });
});

describe('tout relâcher', () => {
  it('engine.releaseAll vide programmeur et couche IA ; accessible en OSC et à distance', async () => {
    const { svc } = makeService();
    await svc.init();
    svc.setProject(demoProject(), true);
    const fill = () => {
      svc.engine.setProgrammer(['par1'], { dimmer: 1 });
      svc.engine.setAiValues({ par2: { dimmer: 0.5 } }, 0);
    };
    fill();
    await svc.execute({ type: 'engine.releaseAll' });
    expect(svc.engine.snapshot()).toMatchObject({ programmerCount: 0, aiActive: false, effects: [] });

    fill();
    expect(await onOsc(svc, { address: '/luma/releaseall', args: [] })).toBe(true);
    expect(svc.engine.snapshot()).toMatchObject({ programmerCount: 0, aiActive: false });

    expect(validateRemoteCommand({ type: 'engine.releaseAll' }, () => undefined)).toEqual({ type: 'engine.releaseAll' });
    await svc.dispose();
  });
});

describe('références du projet', () => {
  it('supprimer une liste de cues désarme les réactions audio qui la visaient', async () => {
    const { svc } = makeService();
    await svc.init();
    const id = svc.project.cueLists[0]!.id;
    svc.mutate((d) => {
      d.audio.reactions.energyRiseGo.cueListId = id;
      d.audio.reactions.dropGo.cueListId = id;
    });
    await svc.execute({ type: 'cueList.remove', id });
    expect(svc.project.audio.reactions.energyRiseGo.cueListId).toBeNull();
    expect(svc.project.audio.reactions.dropGo.cueListId).toBeNull();
    await svc.dispose();
  });

  it('un show qui revient pour un morceau disparu n’est pas appliqué', async () => {
    const { svc } = makeService();
    await svc.init();
    const before = svc.revision;
    expect(() => applyShow(svc, { id: 'gone' } as MusicTrack, {} as ShowPlan, [])).toThrow(UserError);
    expect(svc.revision).toBe(before);
    await svc.dispose();
  });
});

describe('paramètres', () => {
  it('settings.update ne remet pas en arrière les projets récents ; forgetRecent les retire', async () => {
    const { svc, dataDir } = makeService();
    await svc.init();
    const stale = svc.getSettings(); // copy loaded by the Settings page
    const file = path.join(dataDir, 'show.luma.json');
    await svc.execute({ type: 'project.saveAs', path: file });
    await svc.execute({ type: 'settings.update', settings: { ...stale, logs: { level: 'debug' } } });
    expect(svc.getSettings().general.recentProjects).toEqual([file]);
    expect(svc.getSettings().logs.level).toBe('debug');

    await svc.execute({ type: 'settings.forgetRecent', paths: [file] });
    expect(svc.getSettings().general.recentProjects).toEqual([]);
    await svc.dispose();
  });
});

describe('écriture atomique', () => {
  it('des écritures concurrentes sur un même fichier se suivent sans erreur', async () => {
    const { writeFileAtomic } = await import('../../src/core/project/store');
    const { readFile } = await import('node:fs/promises');
    const file = path.join(makeService().dataDir, 'settings.json');
    await Promise.all(Array.from({ length: 50 }, (_, i) => writeFileAtomic(file, JSON.stringify({ i }), false)));
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ i: 49 });
  });
});

describe('sûreté de scène quand le rendu disparaît', () => {
  const begin = { type: 'locate.begin', confirmed: true, mode: 'sequential', level: 0.5, photo: false } as const;

  it('la perte de la fenêtre principale arrête la localisation et la mire', async () => {
    const { svc } = makeService();
    await svc.init();
    svc.setProject(demoProject(), true);
    await svc.execute(begin);
    svc.engine.testPattern = { kind: 'zero', universes: [1], startedAt: 0 };
    svc.onRendererLost('plantage');
    expect(svc.runtimeState().locate).toBeNull();
    expect(svc.engine.testPattern).toBeNull();
    expect(svc.logger.recent().some((e) => e.level === 'warn' && e.message.includes('Fenêtre principale perdue'))).toBe(true);
    await svc.dispose();
  });

  it('une séquence abandonnée s’arrête seule ; locate.apply est annulable', async () => {
    vi.useFakeTimers();
    try {
      const { svc } = makeService();
      await svc.init();
      svc.setProject(demoProject(), true);
      await svc.execute(begin);
      const { LOCATE_IDLE_MS } = await import('../../src/core/app/handlers/locate');
      vi.advanceTimersByTime(LOCATE_IDLE_MS + 1);
      expect(svc.runtimeState().locate).toBeNull();

      const before = svc.project.patch.find((f) => f.id === 'par1')!.position;
      await svc.execute({ type: 'locate.apply', updates: [{ fixtureId: 'par1', x: 9, y: 9 }] });
      await svc.execute({ type: 'scene.undo' });
      expect(svc.project.patch.find((f) => f.id === 'par1')!.position).toEqual(before);
      await svc.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('moteur en erreur', () => {
  it('une erreur répétée est journalisée une fois par 5 s et la dernière trame reste émise', async () => {
    const { svc } = makeService();
    await svc.init();
    let sends = 0;
    const sink = svc.outputs.sendFrames.bind(svc.outputs);
    svc.outputs.sendFrames = (f) => { sends++; sink(f); };
    svc.engine.onBeforeTick(() => { throw new Error('profil cassé'); });
    for (let i = 0; i < 400; i++) svc.engine.tick(25); // 10 s of failing ticks
    const lines = svc.logger.recent().filter((e) => e.source === 'Moteur');
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(sends).toBe(400);
    expect(svc.engine.metrics().errors).toBe(400);
    // Dedupe by message: a new error is reported at once.
    const { onEngineError } = await import('../../src/core/app/monitor');
    onEngineError(svc, 'autre');
    expect(svc.logger.recent().at(-1)!.message).toBe('autre');
    await svc.dispose();
  });
});

describe('secrets et audio', () => {
  it('l’état runtime utilise has() sans déchiffrer la clé', async () => {
    const { svc } = makeService();
    const get = vi.fn(() => 'k');
    Object.assign(svc.opts.secrets, { has: () => true, get });
    expect(svc.runtimeState().ai.hasKey).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });

  it('une source audio interrompue est signalée, un arrêt volontaire non', async () => {
    const { svc } = makeService();
    await svc.init();
    const f = { t: 0, level: 0.5, levelDb: -6, energy: 0.5, onset: false, onsetStrength: 0, bpm: null, bpmConfidence: 0, energyRise: false, beat: false, barPosition: null, tempoLocked: false, bass: 0, brightness: 0, onsetDensity: 0, prediction: null };
    let now = 0;
    Object.assign(svc.audio, { now: () => now });
    const stale = vi.fn();
    svc.audio.onStale = stale;
    svc.audio.push(f, 'live');
    svc.engine.tick(25);
    now = 2000;
    svc.engine.tick(25);
    expect(stale).toHaveBeenCalledTimes(1);
    svc.audio.push(f, 'live');
    svc.engine.tick(25);
    await svc.execute({ type: 'audio.release' });
    now = 5000;
    svc.engine.tick(25);
    expect(stale).toHaveBeenCalledTimes(1);
    await svc.dispose();
  });
});

describe('paramètres invalides', () => {
  it('seules les sections invalides sont réinitialisées', async () => {
    const { salvageSettings, defaultSettings } = await import('../../src/core/settings/settings');
    const good = defaultSettings();
    const outputs = [{ id: 'an', name: 'Nœud', kind: 'artnet', enabled: true, maxFps: 40, host: '10.0.0.5', bindAddress: '', broadcast: false, universeMap: [{ local: 1, remote: 0 }] }];
    const r = salvageSettings({ ...good, outputs, engine: { ...good.engine, rateHz: 999 } });
    expect(r.reset).toEqual(['engine']);
    expect(r.settings.outputs).toEqual(outputs);
    expect(r.settings.engine.rateHz).toBe(40);
  });
});

describe('IA : application, annulation, effets éphémères', () => {
  const setup = async () => {
    const { svc } = makeService();
    await svc.init();
    svc.setProject(demoProject(), true);
    return svc;
  };

  it('un effet IA démarré en direct disparaît du projet au relâchement, sauf s’il est conservé', async () => {
    const svc = await setup();
    const p = await svc.execute({ type: 'ai.propose', prompt: 'Lance un chase sur les pars' });
    expect(p.actions.some((a) => a.action?.type === 'startEffect' && a.status !== 'rejected')).toBe(true);
    await svc.execute({ type: 'ai.apply', proposalId: p.id });
    const fx = svc.project.effects.filter((x) => x.origin === 'ai');
    expect(fx).toHaveLength(1);
    expect(fx[0]!.transient).toBe(true);
    expect(svc.engine.snapshot().effects.some((x) => x.owner === 'ai')).toBe(true);
    await svc.execute({ type: 'ai.release' });
    expect(svc.project.effects.filter((x) => x.origin === 'ai')).toHaveLength(0);

    const p2 = await svc.execute({ type: 'ai.propose', prompt: 'Lance un chase sur les pars' });
    await new Promise((r) => setTimeout(r, 310)); // anti-loop guard between applications
    await svc.execute({ type: 'ai.apply', proposalId: p2.id });
    const kept = svc.project.effects.find((x) => x.origin === 'ai')!;
    await svc.execute({ type: 'effect.upsert', effect: { ...kept, transient: false } });
    await svc.execute({ type: 'ai.release' });
    expect(svc.project.effects.some((x) => x.id === kept.id)).toBe(true);
    await svc.dispose();
  });

  it('ai.undoApply rétablit le projet et relâche la couche IA', async () => {
    const svc = await setup();
    const before = structuredClone(svc.project);
    const p = await svc.execute({ type: 'ai.propose', prompt: 'Crée une scène bleue nommée Océan' });
    await svc.execute({ type: 'ai.apply', proposalId: p.id });
    expect(svc.project.scenes.length).toBeGreaterThan(before.scenes.length);
    await svc.execute({ type: 'ai.undoApply' });
    expect(svc.project.scenes).toEqual(before.scenes);
    expect(svc.engine.snapshot().aiActive).toBe(false);
    await expect(svc.execute({ type: 'ai.undoApply' })).rejects.toThrow(UserError);
    await svc.dispose();
  });

  it('une proposition périmée (patch modifié) est refusée', async () => {
    const svc = await setup();
    const p = await svc.execute({ type: 'ai.propose', prompt: 'Mets les pars en rouge' });
    await svc.execute({ type: 'fixture.remove', ids: ['par2'] });
    await expect(svc.execute({ type: 'ai.apply', proposalId: p.id })).rejects.toThrow(/périmée/);
    await svc.dispose();
  });

  it('une simple requête IA ne rend pas le projet « modifié »', async () => {
    const svc = await setup();
    expect(svc.dirty).toBe(false);
    await svc.execute({ type: 'ai.propose', prompt: 'Mets les pars en rouge' });
    expect(svc.dirty).toBe(false);
    expect(svc.project.ai.recentPrompts[0]).toBe('Mets les pars en rouge');
    await svc.dispose();
  });

  it('ai.cancel interrompt une génération de show OpenRouter sans rien appliquer', async () => {
    const { svc, secrets } = makeService();
    await svc.init();
    svc.setProject(demoProject(), true);
    const { analyzeAudio } = await import('../../src/core/music/analyze');
    const { demoSong } = await import('../music-synth');
    const song = demoSong(120);
    const analysis = await analyzeAudio(song.samples, song.sr);
    const { id } = await svc.execute({ type: 'music.addTrack', name: 'Démo', hash: 'a'.repeat(64), analysis });
    secrets.set('openrouter-api-key', 'sk-test-key-000');
    const s = svc.getSettings();
    await svc.execute({ type: 'settings.update', settings: { ...s, ai: { ...s.ai, provider: 'openrouter', fallbackToLocal: true } } });
    // Model list answers, the completion hangs until aborted.
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      if (url.endsWith('/models')) return Promise.resolve(new Response(JSON.stringify({ data: [] })));
      return new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    });
    const steps: string[] = [];
    svc.on('progress', (p) => steps.push(p.step));
    try {
      const revision = svc.revision;
      const run = svc.execute({ type: 'music.generate', trackId: id, intent: '', nextVariant: false });
      await vi.waitFor(() => expect(steps).toContain('request'));
      await svc.execute({ type: 'ai.cancel' });
      await expect(run).rejects.toThrow(/annulée/);
      expect(svc.revision).toBe(revision);
      expect(svc.aiBusy).toBe(false);
      expect(steps[0]).toBe('plan');
    } finally {
      vi.unstubAllGlobals();
      await svc.dispose();
    }
  });
});

describe('enregistrement', () => {
  it('une modification faite pendant l’écriture du fichier reste non enregistrée', async () => {
    const { svc, dataDir } = makeService();
    await svc.init();
    svc.setProject(demoProject(), true);
    await svc.execute({ type: 'project.saveAs', path: path.join(dataDir, 'show.luma.json') });
    const saving = svc.execute({ type: 'project.save' });
    await svc.execute({ type: 'project.update', meta: { notes: 'pendant l’écriture' } });
    await saving;
    expect(svc.dirty).toBe(true);
    await svc.dispose();
  });
});

describe('récupération au démarrage', () => {
  it('une autosauvegarde plus récente que le fichier est proposée et se réenregistre au même endroit', async () => {
    const { svc, dataDir } = makeService();
    await svc.init();
    svc.setProject(demoProject(), true);
    const file = path.join(dataDir, 'gala.luma.json');
    await svc.execute({ type: 'project.saveAs', path: file });
    expect(await svc.execute({ type: 'project.recoveryCandidates' })).toEqual([]);
    await new Promise((r) => setTimeout(r, 20)); // distinct mtimes
    await svc.execute({ type: 'project.update', meta: { notes: 'travail non enregistré' } });
    const { autosave } = await import('../../src/core/app/files');
    await autosave(svc, true);
    await svc.dispose();

    // « Crash »: a new instance on the same data folder.
    const { svc: next } = makeService(dataDir);
    await next.init();
    const [c] = await next.execute({ type: 'project.recoveryCandidates' });
    expect(c).toMatchObject({ kind: 'autosave', source: file, project: 'Test' });
    expect((await next.execute({ type: 'project.openRecovery', file: c!.file })).opened).toBe(true);
    expect(next.project.meta.notes).toBe('travail non enregistré');
    expect(next.dirty).toBe(true);
    expect((await next.execute({ type: 'project.save' })).path).toBe(file);
    expect(await next.execute({ type: 'project.recoveryCandidates' })).toEqual([]);
    await next.dispose();
  });
});

describe('saut de timeline', () => {
  it('seek et timecode replacent les listes de cues sur le cue atteint', async () => {
    const { cueListSchema, timelineSchema } = await import('../../src/core/model/schemas');
    const { svc } = makeService();
    await svc.init();
    svc.setProject(demoProject(), true);
    const list = cueListSchema.parse({ id: 'l1', name: 'Show', priority: 50, loop: false, cues: [
      { id: 'c1', number: 1, name: 'A', sceneId: null, fade: 2, delay: 0, curve: 'linear', trigger: { type: 'manual' }, effectIds: [] },
      { id: 'c2', number: 2, name: 'B', sceneId: null, fade: 2, delay: 0, curve: 'linear', trigger: { type: 'manual' }, effectIds: [] },
    ] });
    const tl = timelineSchema.parse({ id: 't1', name: 'T', duration: 60, loop: false, events: [
      { id: 'e1', kind: 'cue', start: 10, refId: 'l1', cueIndex: 0 },
      { id: 'e2', kind: 'cue', start: 20, refId: 'l1', cueIndex: 1 },
    ] });
    svc.mutate((d) => { d.cueLists.push(list); d.timelines.push(tl); });
    const pb = () => svc.engine.snapshot().playbacks.find((p) => p.cueListId === 'l1');
    await svc.execute({ type: 'timeline.play', id: 't1' });
    await svc.execute({ type: 'timeline.seek', seconds: 25 });
    expect(pb()).toMatchObject({ index: 1, state: 'holding' }); // landed, no fade
    await svc.execute({ type: 'timeline.seek', seconds: 15 });
    expect(pb()?.index).toBe(0);
    await svc.execute({ type: 'timeline.seek', seconds: 5 });
    expect(pb()?.state).toBe('idle');
    await svc.execute({ type: 'timeline.timecode', seconds: 30, timelineId: 't1' });
    expect(pb()?.index).toBe(1);
    await svc.dispose();
  });
});

describe('stockage local', () => {
  it('le cache IA est borné ; la purge ne touche pas à l’audio référencé', async () => {
    const { mkdir, writeFile, readdir, utimes } = await import('node:fs/promises');
    const { ResponseCache } = await import('../../src/core/ai/responseCache');
    const { svc, dataDir } = makeService();
    await svc.init();
    const cache = new ResponseCache(path.join(dataDir, 'ai-cache'), 2500);
    for (let i = 0; i < 5; i++) await cache.set(`k${i}`, { pad: 'x'.repeat(1000), i });
    expect((await readdir(path.join(dataDir, 'ai-cache'))).length).toBe(2); // oldest evicted

    const { svc: s2 } = { svc };
    const music = path.join(dataDir, 'music');
    await mkdir(music, { recursive: true });
    const used = 'b'.repeat(64), orphan = 'c'.repeat(64);
    await writeFile(path.join(music, used), 'audio');
    await writeFile(path.join(music, orphan), 'audio');
    // Referenced by a recent project (not open): its audio must survive the purge.
    const recent = path.join(dataDir, 'other.luma.json');
    await writeFile(recent, JSON.stringify({ music: { tracks: [{ hash: used }] } }));
    s2.settings.general.recentProjects = [recent];
    await mkdir(s2.autosaveDir, { recursive: true });
    const old = path.join(s2.autosaveDir, 'old.luma.json');
    await writeFile(old, '{}');
    const past = new Date(Date.now() - 40 * 86_400_000);
    await utimes(old, past, past);

    const r = await s2.execute({ type: 'storage.report' });
    expect(r.music).toMatchObject({ files: 2, orphans: 1 });
    expect(r.autosave.stale).toBe(1);
    expect((await s2.execute({ type: 'storage.purge', music: true, autosave: true, aiCache: true })).removed).toBe(4);
    expect(await readdir(music)).toEqual([used]);
    await s2.dispose();
  });
});

describe('timelines et playbacks', () => {
  it('supprimer une timeline inactive laisse jouer la timeline en cours', async () => {
    const { timelineSchema } = await import('../../src/core/model/schemas');
    const { svc } = makeService();
    await svc.init();
    svc.mutate((d) => { d.timelines.push(timelineSchema.parse({ id: 'ta', name: 'A', duration: 60, events: [] }), timelineSchema.parse({ id: 'tb', name: 'B', duration: 60, events: [] })); });
    await svc.execute({ type: 'timeline.play', id: 'ta' });
    await svc.execute({ type: 'timeline.remove', id: 'tb' });
    expect(svc.engine.snapshot().timeline).toMatchObject({ timelineId: 'ta', state: 'playing' });
    await svc.dispose();
  });

  it('ouvrir un autre projet retire les playbacks de ses listes disparues', async () => {
    const { svc } = makeService();
    await svc.init();
    const id = svc.project.cueLists[0]!.id;
    svc.engine.cueGo(id); // empty list: the playback entry is still created
    expect(svc.engine.snapshot().playbacks.some((p) => p.cueListId === id)).toBe(true);
    await svc.execute({ type: 'project.new', name: 'Autre' });
    expect(svc.engine.snapshot().playbacks.some((p) => p.cueListId === id)).toBe(false);
    await svc.dispose();
  });
});

describe('phase 2 — robustesse', () => {
  it('OSC : débit limité par émetteur, paquets invalides résumés, accusé désactivable', async () => {
    const dgram = await import('node:dgram');
    const { OscServer, encodeOsc } = await import('../../src/core/control/osc');
    const osc = new OscServer(() => 1000); // frozen clock: the bucket never refills
    const errors: string[] = [];
    osc.on('error', (e) => errors.push(e.message));
    let handled = 0;
    osc.on('message', (_m, ack) => { handled++; ack(true); });
    await osc.start(0, '127.0.0.1');
    const port = osc.port!;
    const client = dgram.createSocket('udp4');
    await new Promise<void>((r) => client.bind(0, '127.0.0.1', () => r()));
    let acks = 0;
    client.on('message', () => acks++);
    const send = (b: Buffer) => new Promise<void>((r) => client.send(b, port, '127.0.0.1', () => r()));
    for (let i = 0; i < 3; i++) await send(encodeOsc('/luma/go'));
    await new Promise((r) => setTimeout(r, 100));
    expect(acks).toBe(3);
    osc.ack = false;
    await send(encodeOsc('/luma/go'));
    for (let i = 0; i < 1000; i++) await send(Buffer.from('pas de l’OSC'));
    await new Promise((r) => setTimeout(r, 300));
    expect(acks).toBe(3);
    expect(handled).toBe(4);
    expect(errors).toHaveLength(1); // one report, the rest summed up later
    expect(osc.dropped).toBeGreaterThan(0); // 400-packet burst exhausted
    client.close();
    await osc.stop();
  });

  it('écriture atomique : renommage repris quand Windows tient le fichier', async () => {
    const fsMod = await import('node:fs');
    const { writeFileAtomic } = await import('../../src/core/project/store');
    const real = fsMod.promises.rename.bind(fsMod.promises);
    let fails = 2;
    const spy = vi.spyOn(fsMod.promises, 'rename').mockImplementation(async (a, b) => {
      if (fails-- > 0) throw Object.assign(new Error('busy'), { code: 'EPERM' });
      return real(a, b);
    });
    try {
      const file = path.join(makeService().dataDir, 'p.json');
      await writeFileAtomic(file, '{"ok":1}', false);
      expect(JSON.parse(fsMod.readFileSync(file, 'utf8'))).toEqual({ ok: 1 });
      expect(spy).toHaveBeenCalledTimes(3);
    } finally {
      spy.mockRestore();
    }
  });

  it('ZIP corrompu : erreur ZipError et non RangeError', async () => {
    const { readZip, writeZip, ZipError } = await import('../../src/core/util/zip');
    const zip = Buffer.from(writeZip([{ name: 'a.xml', data: new Uint8Array(100) }]));
    const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    zip.writeUInt32LE(0xffffff, central + 42); // local header offset far past the end
    expect(() => readZip(zip).read('a.xml')).toThrow(ZipError);
  });

  it('diagnostic : le dossier personnel est masqué', async () => {
    const os = await import('node:os');
    const { maskHome } = await import('../../src/core/log/diagnostic');
    const home = os.homedir();
    const BS = String.fromCharCode(92); // backslash
    expect(maskHome(`${home}${BS}Shows${BS}gala.json`)).toBe(`~${BS}Shows${BS}gala.json`);
    expect(maskHome(`${home.toUpperCase().split(BS).join('/')}/x`)).toBe('~/x');
  });

  it('commande bloquante journalisée', async () => {
    const { svc } = makeService();
    const now = vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(300);
    try {
      await svc.execute({ type: 'project.get' });
    } finally {
      now.mockRestore();
    }
    expect(svc.logger.recent().some((e) => e.source === 'Commandes' && e.message.includes('project.get a bloqué 300 ms'))).toBe(true);
  });

  it('télécommande : mémoire des limiteurs bornée', async () => {
    const { RemoteLimiter } = await import('../../src/core/control/remote');
    let t = 0;
    const lim = new RemoteLimiter(() => t);
    for (let i = 0; i < 100_000; i++) { t += 1; lim.takeCommand(`10.${i >> 16}.${(i >> 8) & 255}.${i & 255}`); lim.fail(`f${i}`); }
    expect(lim.size).toBeLessThanOrEqual(4096);
  });

  it('CSP de production sans ws://localhost', async () => {
    const config = (await import('../../electron.vite.config')).default as { renderer: { plugins: { name?: string; transformIndexHtml?: (h: string) => string }[] } };
    const plugin = config.renderer.plugins.find((p) => p.name === 'luma-csp-prod')!;
    const fs = await import('node:fs');
    const html = fs.readFileSync('src/renderer/index.html', 'utf8');
    expect(html).toContain('ws://localhost');
    expect(plugin.transformIndexHtml!(html)).not.toContain('ws://localhost');
  });
});

describe('OpenRouter : reprise et réparation', () => {
  const ok = (content: unknown) => new Response(JSON.stringify({ model: 'm/x', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }] }));
  const opts = (fetchImpl: typeof fetch) => ({ apiKey: 'k', model: 'm/x', effort: 'low' as const, timeoutMs: 10_000, fetchImpl, capabilities: { structuredOutputs: true, jsonMode: true, reasoning: false } });

  it('reprend sur 503 avec Retry-After, jamais sur 401', async () => {
    const { proposeWithOpenRouter } = await import('../../src/core/ai/providers/openrouter');
    const calls: number[] = [];
    const flaky = (async () => {
      calls.push(Date.now());
      return calls.length === 1 ? new Response('busy', { status: 503, headers: { 'retry-after': '0' } }) : ok({ understanding: 'ok', actions: [] });
    }) as unknown as typeof fetch;
    const r = await proposeWithOpenRouter('bleu', 'rig', opts(flaky));
    expect(calls).toHaveLength(2);
    expect(r.notices.some((n) => n.includes('2 tentatives'))).toBe(true);

    let n401 = 0;
    const refused = (async () => { n401++; return new Response('{}', { status: 401 }); }) as unknown as typeof fetch;
    await expect(proposeWithOpenRouter('bleu', 'rig', opts(refused))).rejects.toThrow(/Clé API refusée/);
    expect(n401).toBe(1);
  });

  it('une réponse hors schéma est corrigée par une seconde requête', async () => {
    const { proposeWithOpenRouter } = await import('../../src/core/ai/providers/openrouter');
    const bodies: string[] = [];
    const answers = [{ actions: [] }, { understanding: 'corrigé', actions: [] }]; // first one misses `understanding`
    const f = (async (_u: string, init: RequestInit) => { bodies.push(String(init.body)); return ok(answers[bodies.length - 1]); }) as unknown as typeof fetch;
    const r = await proposeWithOpenRouter('bleu', 'rig', opts(f));
    expect(r.understanding).toBe('corrigé');
    expect(bodies[1]).toContain('did not match the required JSON schema');
    expect(r.notices.some((x) => x.includes('seconde requête'))).toBe(true);
  });
});

describe('annulation globale (LUMA-053)', () => {
  it('propriété : une suite aléatoire d’éditions, tout annuler redonne l’état initial, tout rétablir l’état final', async () => {
    const { svc } = makeService();
    await svc.init();
    svc.setProject(demoProject(), true);
    const strip = (p: unknown) => { const c = structuredClone(p) as { meta: { modifiedAt?: string } }; delete c.meta.modifiedAt; return c; };
    const initial = strip(svc.project);
    let seed = 3;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
    const ops = [
      () => svc.execute({ type: 'group.upsert', group: { id: `g${rnd(3)}`, name: `G${rnd(9)}`, color: '#123456', fixtureIds: ['par1'] } }),
      () => svc.execute({ type: 'project.update', meta: { notes: `n${rnd(99)}` } }),
      () => svc.execute({ type: 'fixture.duplicate', ids: ['par1'] }),
      () => svc.execute({ type: 'palette.upsert', palette: { id: `p${rnd(3)}`, name: 'P', kind: 'intensity', values: { dimmer: rnd(10) / 10 } } }),
    ];
    let steps = 0;
    for (let i = 0; i < 12; i++) {
      await ops[rnd(ops.length)]!();
      await new Promise((r) => setTimeout(r, 650)); // past the coalescing window: one step per edit
      steps++;
    }
    const final = strip(svc.project);
    expect(svc.projectState().history!.undo).toBe(steps);
    for (let i = 0; i < steps; i++) expect((await svc.execute({ type: 'project.undo' })).label).not.toBeNull();
    expect(strip(svc.project)).toEqual(initial);
    expect((await svc.execute({ type: 'project.undo' })).label).toBeNull();
    for (let i = 0; i < steps; i++) await svc.execute({ type: 'project.redo' });
    expect(strip(svc.project)).toEqual(final);
    await svc.dispose();
  }, 30_000);

  it('gestes rapprochés regroupés, prompts IA hors historique, nouvelle édition efface le rétablissement, nouveau projet repart à zéro', async () => {
    const { svc } = makeService();
    await svc.init();
    svc.setProject(demoProject(), true);
    for (const x of [1, 2, 3]) await svc.execute({ type: 'fixture.update', id: 'par1', patch: { position: { x, y: 0 } } });
    expect(svc.projectState().history).toMatchObject({ undo: 1, undoLabel: 'modification d’un projecteur' });
    await svc.execute({ type: 'ai.propose', prompt: 'Mets les pars en rouge' });
    expect(svc.projectState().history!.undo).toBe(1);
    await svc.execute({ type: 'project.undo' });
    expect(svc.project.patch.find((f) => f.id === 'par1')!.position).toEqual({ x: -2, y: 1 });
    expect(svc.projectState().history!.redo).toBe(1);
    await svc.execute({ type: 'project.update', meta: { notes: 'autre' } });
    expect(svc.projectState().history!.redo).toBe(0);
    await svc.execute({ type: 'project.new', name: 'Neuf' });
    expect(svc.projectState().history).toMatchObject({ undo: 0, redo: 0 });
    await svc.dispose();
  });
});

describe('contrôle externe (LUMA-061, 063, 067)', () => {
  it('liste d’adresses autorisées : IPv4 et CIDR', async () => {
    const { allowList } = await import('../../src/core/control/osc');
    const ok = allowList(['192.168.1.0/24', '10.0.0.5']);
    expect(ok('192.168.1.77')).toBe(true);
    expect(ok('::ffff:192.168.1.3')).toBe(true);
    expect(ok('192.168.2.1')).toBe(false);
    expect(ok('10.0.0.5')).toBe(true);
    expect(ok('10.0.0.6')).toBe(false);
    expect(allowList(['0.0.0.0/0'])('8.8.8.8')).toBe(true);
  });

  it('retour d’état OSC : seulement les changements, vers chaque destination', async () => {
    const dgram = await import('node:dgram');
    const { parseOsc } = await import('../../src/core/control/osc');
    const { oscFeedback } = await import('../../src/core/app/control');
    const rx = dgram.createSocket('udp4');
    await new Promise<void>((r) => rx.bind(0, '127.0.0.1', () => r()));
    const got: string[] = [];
    rx.on('message', (b) => got.push(...parseOsc(b).map((m) => `${m.address}=${m.args.join(',')}`)));
    const { svc } = makeService();
    await svc.init();
    const s = svc.getSettings();
    await svc.execute({ type: 'settings.update', settings: { ...s, control: { ...s.control, osc: { ...s.control.osc, enabled: true, port: 0, feedback: [{ host: '127.0.0.1', port: rx.address().port }] } } } });
    expect(svc.osc.port).not.toBeNull();
    oscFeedback(svc);
    await new Promise((r) => setTimeout(r, 150));
    expect(got).toContain('/luma/state/blackout=0');
    const n = got.length;
    oscFeedback(svc); // nothing changed
    await svc.execute({ type: 'engine.blackout', on: true });
    oscFeedback(svc);
    await new Promise((r) => setTimeout(r, 150));
    expect(got.slice(n)).toEqual(['/luma/state/blackout=1']);
    rx.close();
    await svc.dispose();
  });

  it('la télécommande reçoit l’état des sorties réelles et du garde-fou', async () => {
    const { remoteState } = await import('../../src/core/app/control');
    const { svc } = makeService();
    await svc.init();
    await svc.execute({ type: 'output.configure', outputs: [{ id: 'an', name: 'Nœud', kind: 'artnet', enabled: true, maxFps: 40, host: '127.0.0.1', bindAddress: '', broadcast: false, universeMap: [{ local: 1, remote: 0 }] }] });
    expect(remoteState(svc).outputs).toEqual([{ name: 'Nœud', state: 'disarmed' }]);
    expect(remoteState(svc).safety).toBeNull();
    await svc.dispose();
  });
});

describe('IA phase 3 (LUMA-058, 059, 070)', () => {
  const answer = (understanding: string, usage = { prompt_tokens: 1000, completion_tokens: 200, cost: 0.004 }) =>
    new Response(JSON.stringify({ model: 'm/x', usage, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ understanding, actions: [] }) } }] }));

  async function openrouterService(fetchImpl: (url: string, init: RequestInit) => Response) {
    const { svc, secrets } = makeService();
    await svc.init();
    svc.setProject(demoProject(), true);
    secrets.set('openrouter-api-key', 'sk-test-key-000');
    const s = svc.getSettings();
    await svc.execute({ type: 'settings.update', settings: { ...s, ai: { ...s.ai, provider: 'openrouter', fallbackToLocal: true } } });
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => (url.endsWith('/models') ? new Response(JSON.stringify({ data: [] })) : fetchImpl(url, init)));
    return svc;
  }

  it('coût enregistré par appel ; budget mensuel atteint → repli local signalé', async () => {
    const svc = await openrouterService(() => answer('ok'));
    try {
      await svc.execute({ type: 'ai.propose', prompt: 'bleu' });
      await new Promise((r) => setTimeout(r, 50));
      const u = await svc.execute({ type: 'ai.usage' });
      expect(u.month).toMatchObject({ calls: 1, promptTokens: 1000, completionTokens: 200 });
      expect(u.month.cost).toBeCloseTo(0.004);
      const s = svc.getSettings();
      await svc.execute({ type: 'settings.update', settings: { ...s, ai: { ...s.ai, monthlyBudget: 0.001 } } });
      const p = await svc.execute({ type: 'ai.propose', prompt: 'rouge' });
      expect(p.provider).toBe('local');
      expect(p.notices.join(' ')).toMatch(/Budget IA mensuel atteint/);
    } finally {
      vi.unstubAllGlobals();
      await svc.dispose();
    }
  });

  it('continueThread envoie les échanges précédents ; sans lui ou après reset, rien', async () => {
    const bodies: { messages: { role: string; content: string }[] }[] = [];
    const svc = await openrouterService((_u, init) => { bodies.push(JSON.parse(String(init.body))); return answer(`réponse ${bodies.length}`); });
    try {
      await svc.execute({ type: 'ai.propose', prompt: 'ambiance bleue' });
      await svc.execute({ type: 'ai.propose', prompt: 'plutôt l’inverse', continueThread: true });
      const roles = bodies[1]!.messages.map((m) => m.role);
      expect(roles).toEqual(['system', 'user', 'assistant', 'user']);
      expect(bodies[1]!.messages[1]!.content).toBe('ambiance bleue');
      expect(bodies[1]!.messages[2]!.content).toContain('réponse 1');
      await svc.execute({ type: 'ai.resetThread' });
      await svc.execute({ type: 'ai.propose', prompt: 'autre chose', continueThread: true });
      expect(bodies[2]!.messages.map((m) => m.role)).toEqual(['system', 'user']);
    } finally {
      vi.unstubAllGlobals();
      await svc.dispose();
    }
  });

  it('contrat v2 : éventail accepté sur les lyres, refusé sans pan/tilt', async () => {
    const { validateActions } = await import('../../src/core/ai/director');
    const { ProjectIndex } = await import('../../src/core/engine/resolve');
    const ctx = { index: new ProjectIndex(demoProject()), allowStrobe: false, maxStrobeHz: 10 };
    const fan = (target: object) => ({ type: 'startEffect', effect: { name: 'Éventail', effectType: 'fan', target } });
    const [ok, ko] = validateActions([fan({ fixtureNames: ['Spot 1', 'Spot 2'] }), fan({ fixtureNames: ['PAR 1'] })], ctx);
    expect(ok!.status).not.toBe('rejected');
    expect(ko!.status).toBe('rejected');
  });
});
