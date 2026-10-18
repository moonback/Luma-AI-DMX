import { readFileSync } from 'node:fs';
import path from 'node:path';
import { patchRows, patchSheetCsv, patchSheetHtml } from '../../src/core/fixtures/patchSheet';
import { demoProject, makeService } from '../helpers';

describe('feuille de patch', () => {
  it('lignes triées par univers puis adresse, avec fin de plage, groupes et tags', () => {
    const p = demoProject();
    p.patch[0]!.universe = 2;
    p.patch[1]!.tags = ['face'];
    const rows = patchRows(p);
    expect(rows.map((r) => `${r.universe}.${r.address}`)).toEqual(['1.4', '1.10', '1.20', '1.40', '2.1']);
    expect(rows[0]).toMatchObject({ name: 'PAR 2', channels: 3, lastChannel: 6, groups: 'Pars', tags: 'face' });
  });

  it('CSV pour Excel français : BOM, « ; », guillemets échappés, pas d’injection de formule', () => {
    const p = demoProject();
    p.patch[0]!.name = '=HYPERLINK("x")';
    p.patch[1]!.notes = 'ligne 1; "ligne 2"';
    const csv = patchSheetCsv(p);
    expect(csv.startsWith('﻿Univers;Adresse;Fin;Canaux;Nom')).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"ligne 1; ""ligne 2"""');
    expect(csv.trimEnd().split('\r\n')).toHaveLength(1 + p.patch.length);
  });

  it('HTML imprimable : une table par univers, contenu échappé', () => {
    const p = demoProject();
    p.patch[0]!.name = '<script>x</script>';
    const html = patchSheetHtml(p, new Date(2026, 9, 18));
    expect(html).toContain('Univers 1');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>x');
  });

  it('commande patch.exportSheet : CSV écrit, PDF refusé sans moteur de rendu', async () => {
    const { svc, dataDir } = makeService();
    await svc.init();
    await svc.execute({ type: 'project.openDemo', id: (await import('../../src/core/demo/catalog')).DEMOS[0]!.id });
    const file = path.join(dataDir, 'patch.csv');
    expect(await svc.execute({ type: 'patch.exportSheet', format: 'csv', path: file })).toEqual({ path: file });
    expect(readFileSync(file, 'utf8').split('\r\n').length).toBeGreaterThan(2);
    await expect(svc.execute({ type: 'patch.exportSheet', format: 'pdf', path: path.join(dataDir, 'p.pdf') })).rejects.toThrow(/CSV/);
    expect(await svc.execute({ type: 'patch.exportSheet', format: 'csv' })).toEqual({ path: null });
    await svc.dispose();
  });
});
