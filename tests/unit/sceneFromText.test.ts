import { describe, expect, it } from 'vitest';
import { BUILTIN_PROFILES } from '../../src/core/fixtures/builtinProfiles';
import { profileSchema, projectSchema } from '../../src/core/model/schemas';
import { createProject } from '../../src/core/project/format';
import { TEXT_SCENE_EXAMPLES, editDistance, matchProfile, sceneFromText } from '../../src/core/visualizer/sceneFromText';

const ignite = profileSchema.parse({
  id: 'beamz-ignite300led', name: 'Ignite300LED', manufacturer: 'BeamZ', type: 'moving-head-spot',
  modes: [{ name: '16ch', channels: [{ name: 'Pan', attribute: 'pan' }, { name: 'Tilt', attribute: 'tilt' }, { name: 'Dimmer', attribute: 'dimmer' }] }],
});
const profiles = [...BUILTIN_PROFILES, ignite];
const ids = () => { let n = 0; return () => `t${++n}`; };

describe('scène depuis une description écrite', () => {
  it('exemple complet : grille, totems avec lyre, modèles, pupitre et micros sur praticable', () => {
    const s = sceneFromText('cree un grille de 10m sur 4 sur 3m ajoutes 2 totem de 2m avec lyre poser dessu ajouter 5 ingite300 et 4 mhl1942 puprite et 2 pied micro sur 5m2 de praticable', profiles, ids());
    const grid = s.layout.trusses.filter((t) => t.name.startsWith('Grille'));
    expect(grid).toHaveLength(4);
    expect(grid.every((t) => t.height === 3)).toBe(true);
    expect(grid.find((t) => t.name === 'Grille face')!.length).toBe(10);
    expect(grid.find((t) => t.name === 'Grille jardin')!.length).toBe(4);
    const totems = s.layout.trusses.filter((t) => t.shape === 'totem');
    expect(totems.map((t) => t.height)).toEqual([2, 2]);
    expect(s.rigs).toEqual([
      expect.objectContaining({ profileId: 'demo-spot', count: 2, target: 'totem' }),
      expect.objectContaining({ profileId: 'beamz-ignite300led', count: 5, target: 'truss' }),
      expect.objectContaining({ profileId: 'demo-spot', count: 4, prefix: 'MHL1942', target: 'truss' }),
    ]);
    expect(s.notices.some((n) => n.includes('mhl1942'))).toBe(true);
    const riser = s.layout.props.find((p) => p.kind === 'riser')!;
    expect(riser.width * riser.depth).toBeCloseTo(5, 0);
    const mics = s.layout.props.filter((p) => p.kind === 'mic');
    expect(mics).toHaveLength(2);
    expect(mics.every((m) => m.elevation === riser.height)).toBe(true);
    expect(s.layout.performers).toEqual([expect.objectContaining({ kind: 'lectern' })]);
    // The layout is a valid project stage.
    const p = createProject('Texte');
    expect(() => projectSchema.parse({ ...p, visualizer: { ...p.visualizer, ...s.layout } })).not.toThrow();
  });

  it('plateau, ponts, écrans, enceintes et texte non compris', () => {
    const s = sceneFromText('plateau de 12 x 8, 2 ponts de 10 m à 6 m, un écran 6x3.5, deux enceintes, 8 par, blabla', profiles, ids());
    expect([s.layout.stageWidth, s.layout.stageDepth]).toEqual([12, 8]);
    expect(s.layout.trusses.map((t) => [t.length, t.height])).toEqual([[10, 6], [10, 6]]);
    expect(s.layout.screens[0]).toMatchObject({ width: 6, height: 3.5 });
    expect(s.layout.props.filter((p) => p.kind === 'speaker')).toHaveLength(2);
    expect(s.rigs).toEqual([expect.objectContaining({ profileId: 'demo-par-rgbw', count: 8 })]);
    expect(s.notices).toContain('Non compris : « blabla »');
  });

  it('les exemples de l’accueil sont entièrement compris et donnent une scène valide', () => {
    for (const ex of TEXT_SCENE_EXAMPLES) {
      const s = sceneFromText(ex.text, profiles, ids());
      expect(s.notices, ex.label).toEqual([]);
      expect(s.layout.trusses.length, ex.label).toBeGreaterThan(0);
      expect(s.rigs.length, ex.label).toBeGreaterThan(0);
      const p = createProject('Exemple');
      expect(() => projectSchema.parse({ ...p, visualizer: { ...p.visualizer, ...s.layout } }), ex.label).not.toThrow();
    }
  });

  it('recherche de modèle tolérante aux fautes, chiffres exacts', () => {
    expect(matchProfile('ignite300', profiles)?.id).toBe('beamz-ignite300led');
    expect(matchProfile('ingite300', profiles)?.id).toBe('beamz-ignite300led');
    expect(matchProfile('ignite200', profiles)).toBeUndefined();
    expect(editDistance('ingite', 'ignite')).toBe(2);
  });
});
