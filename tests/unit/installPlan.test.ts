import { cableMeters, installPlanHtml, mountOf } from '../../src/core/fixtures/installPlan';
import { demoProject } from '../helpers';

describe('plan d’installation', () => {
  it('accroche : absent ou « auto » = suspendu sauf sol sous 1 m, mount explicite prioritaire', () => {
    const [f] = demoProject().patch;
    expect(mountOf({ ...f!, height: 4 })).toBe('hanging');
    expect(mountOf({ ...f!, height: 0.5 })).toBe('floor');
    expect(mountOf({ ...f!, height: 4, mount: 'floor' })).toBe('floor');
    expect(mountOf({ ...f!, height: 0.5, mount: 'auto' })).toBe('floor');
    expect(mountOf({ ...f!, height: 4, mount: 'wall' })).toBe('wall');
  });

  it('câble DMX : trajet en 3D dans l’ordre des adresses, +10 % de marge', () => {
    const [a, b] = demoProject().patch;
    // Adresse 1 en (-2, 1, 4) puis adresse 4 en (2, 1, 4) : 4 m, plus la marge.
    expect(cableMeters([b!, a!])).toBeCloseTo(4.4);
    expect(cableMeters([a!])).toBe(0);
  });

  it('HTML : contenu échappé, profil inconnu signalé, sorties et sections présentes', () => {
    const p = demoProject();
    p.meta.name = '<b>Tournée</b>';
    p.patch[0]!.profileId = 'profil-disparu';
    const html = installPlanHtml(p, [{ name: 'Sortie', kind: 'artnet', enabled: true }], new Date(2026, 9, 19));
    expect(html).toContain('&lt;b&gt;Tournée');
    expect(html).not.toContain('<b>Tournée');
    expect(html).toContain('profil inconnu (profil-disparu)');
    expect(html).toContain('Art-Net (Ethernet)');
    expect(html).toContain('Switch Ethernet non géré');
    expect(html).toContain('Procédure de mise en service');
  });
});
