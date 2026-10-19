import { AppService } from '../../src/core/app/AppService';
import { DISABLED_UPDATES, type UpdateStatus, type Updater } from '../../src/core/app/updates';
import { makeService, tempDir } from '../helpers';

function fakeUpdater() {
  const calls: { channel: string; auto: boolean }[] = [];
  let status: UpdateStatus = { state: 'idle', version: null, progress: null, detail: null, checkedAt: null };
  const updater: Updater = {
    status: () => status,
    configure: (o) => { calls.push(o); },
    check: async () => (status = { ...status, state: 'up-to-date', checkedAt: '2026-10-18T00:00:00.000Z' }),
  };
  return { updater, calls };
}

describe('mises à jour', () => {
  it('sans updater (dev, tests) : état « disabled », la recherche ne fait rien', async () => {
    const { svc } = makeService();
    await svc.init();
    expect((await svc.execute({ type: 'app.info' })).updates).toEqual(DISABLED_UPDATES);
    expect(await svc.execute({ type: 'app.checkUpdates' })).toEqual(DISABLED_UPDATES);
    await svc.dispose();
  });

  it('applique canal et téléchargement automatique au démarrage puis à chaque enregistrement des paramètres', async () => {
    const { updater, calls } = fakeUpdater();
    const svc = new AppService({
      dataDir: tempDir(), autoStart: false, updater,
      appInfo: { name: 'Luma AI DMX', version: '1.5.0', platform: 'win32', arch: 'x64', versions: {} },
      dialogs: { openProject: async () => null, saveProject: async () => null, openProfile: async () => null },
      secrets: { get: () => null, set: () => undefined },
    });
    await svc.init();
    expect(calls).toEqual([{ channel: 'stable', auto: true }]);
    const s = svc.getSettings();
    await svc.execute({ type: 'settings.update', settings: { ...s, general: { ...s.general, updateChannel: 'beta', autoUpdate: false } } });
    expect(calls.at(-1)).toEqual({ channel: 'beta', auto: false });
    expect(await svc.execute({ type: 'app.info' })).toMatchObject({ version: '1.5.0', updates: { state: 'idle' } });
    expect(await svc.execute({ type: 'app.checkUpdates' })).toMatchObject({ state: 'up-to-date' });
    await svc.dispose();
  });
});
