import path from 'node:path';
import { makeService, tempDir } from '../helpers';

const PROFILE = path.resolve('tests/fixtures/profiles/beamz-mhl1940.json');
const ID = 'test-beamz-mhl1940';

describe('bibliothèque utilisateur de profils', () => {
  it('garde un profil importé dans les nouveaux projets et après redémarrage', async () => {
    const dataDir = tempDir();
    const { svc } = makeService(dataDir);
    await svc.init();
    expect((await svc.execute({ type: 'profile.import', path: PROFILE })).imported).toHaveLength(1);
    await svc.execute({ type: 'profile.import', path: PROFILE }); // ré-import : mise à jour, pas de doublon
    expect(svc.projectState().library.map((p) => p.id)).toEqual([ID]);
    await svc.execute({ type: 'project.new', name: 'Autre projet' });
    expect(svc.getProject().profiles).toEqual([]);
    expect(svc.index.lib.get(ID)).toBeDefined();
    await svc.dispose();

    const second = makeService(dataDir).svc;
    await second.init();
    expect(second.projectState().library.map((p) => p.id)).toEqual([ID]);
    // Le projet qui l'utilise l'embarque, pour rester portable.
    await second.execute({ type: 'fixture.add', profileId: ID, mode: '26Channels', universe: 1, address: null, count: 1, namePrefix: 'Lyre', tags: [] });
    expect(second.getProject().profiles.map((p) => p.id)).toEqual([ID]);
    await expect(second.execute({ type: 'profile.remove', id: ID })).rejects.toThrow(/utilisé/);
    await second.execute({ type: 'project.new', name: 'Vide' });
    await second.execute({ type: 'profile.remove', id: ID });
    expect(second.projectState().library).toEqual([]);
    await second.dispose();

    const third = makeService(dataDir).svc;
    await third.init();
    expect(third.projectState().library).toEqual([]);
    await third.dispose();
  });
});
