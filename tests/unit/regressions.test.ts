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
