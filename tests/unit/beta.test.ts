import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { makeService } from '../helpers';

describe('programme bêta : statistiques d’usage et retours', () => {
  it('rien n’est compté tant que l’utilisateur n’a pas activé les statistiques', async () => {
    const { svc, dataDir } = makeService();
    await svc.init();
    await svc.execute({ type: 'engine.master', value: 0.5 });
    expect((await svc.execute({ type: 'usage.get' })).data.days).toEqual({});
    await svc.dispose();
    expect(existsSync(path.join(dataDir, 'usage.json'))).toBe(false);
  });

  it('une fois activées : types de commandes et erreurs seulement, persistés localement, effaçables', async () => {
    const { svc, dataDir } = makeService();
    await svc.init();
    const s = svc.getSettings();
    await svc.execute({ type: 'settings.update', settings: { ...s, telemetry: { usage: true } } });
    await svc.execute({ type: 'engine.master', value: 0.5 });
    await svc.execute({ type: 'engine.master', value: 0.6 });
    await svc.execute({ type: 'project.update', meta: { name: 'Tournée secrète' } });
    await svc.execute({ type: 'project.get' });
    svc.logger.error('Sortie Mon Nœud Perso', 'perte');
    const { data } = await svc.execute({ type: 'usage.get' });
    const today = Object.values(data.days)[0]!;
    expect(today.commands['engine.master']).toBe(2);
    expect(today.commands['project.get']).toBeUndefined(); // polling, not counted
    expect(today.errors).toEqual({ Sortie: 1 }); // output names are user text: folded
    await svc.dispose();
    const stored = readFileSync(path.join(dataDir, 'usage.json'), 'utf8');
    expect(stored).toContain('engine.master');
    expect(stored).not.toContain('Tournée secrète');
    expect(stored).not.toContain('Mon Nœud Perso');

    const { svc: again } = makeService(dataDir);
    await again.init();
    expect(Object.values((await again.execute({ type: 'usage.get' })).data.days)[0]!.commands['engine.master']).toBe(2);
    await again.execute({ type: 'usage.clear' });
    expect((await again.execute({ type: 'usage.get' })).data.days).toEqual({});
    await again.dispose();
  });

  it('le retour est un fichier : message, diagnostic sans secret, jamais le projet', async () => {
    const { svc, dataDir } = makeService();
    await svc.init();
    await svc.execute({ type: 'project.update', meta: { notes: 'NOTES PRIVÉES DU PROJET' } });
    const file = path.join(dataDir, 'retour.json');
    expect(await svc.execute({ type: 'feedback.export', kind: 'bug', message: 'Le GO ne part pas', contact: '', includeDiagnostic: true, includeUsage: true, path: file })).toEqual({ path: file });
    const text = readFileSync(file, 'utf8');
    const fb = JSON.parse(text) as { kind: string; message: string; diagnostic: { format: string } | null; usage: unknown };
    expect(fb).toMatchObject({ kind: 'bug', message: 'Le GO ne part pas', diagnostic: { format: 'luma-diagnostic' }, usage: null });
    expect(text).not.toContain('NOTES PRIVÉES');
    expect(text).not.toContain(svc.getSettings().control.remote.token!);
    await svc.dispose();
  });
});
