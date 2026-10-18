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

  it('les exemples de l’accueil donnent exactement la scène décrite', () => {
    const summary = (text: string) => {
      const { layout: l, rigs } = sceneFromText(text, profiles, ids());
      const count = <T,>(xs: T[], key: (x: T) => string) => xs.reduce<Record<string, number>>((m, x) => ({ ...m, [key(x)]: (m[key(x)] ?? 0) + 1 }), {});
      return {
        stage: [l.stageWidth, l.stageDepth],
        trusses: l.trusses.map((t) => `${t.shape} ${t.length}@${t.height}`),
        rigs: rigs.map((r) => `${r.count} ${r.profileId}${r.target === 'totem' ? ' totem' : ''}`),
        props: count(l.props, (p) => p.kind),
        people: count(l.performers, (p) => p.kind),
        screens: l.screens.map((s) => [s.width, s.height]),
      };
    };
    const grid = (w: number, d: number, h: number) => [`line ${w}@${h}`, `line ${w}@${h}`, `line ${d}@${h}`, `line ${d}@${h}`];
    const [concert, conference, club, gala, theatre] = TEXT_SCENE_EXAMPLES.map((ex) => summary(ex.text));
    expect(concert).toEqual({
      stage: [12, 8], trusses: [...grid(10, 6, 4), 'totem 0.5@2.5', 'totem 0.5@2.5'], rigs: ['2 demo-spot totem'],
      props: { riser: 1, speaker: 2, monitor: 3 }, people: {}, screens: [[6, 3.5]],
    });
    expect(conference).toEqual({
      stage: [8, 5], trusses: ['line 8@5'], rigs: ['6 demo-par-rgbw'],
      props: { table: 1, mic: 2, speaker: 2 }, people: { lectern: 1 }, screens: [[4, 2.25]],
    });
    expect(club).toEqual({
      stage: [6, 4], trusses: grid(6, 4, 4), rigs: ['4 demo-spot', '4 demo-strobe', '2 demo-led-bar-4'],
      props: { riser: 1, table: 1 }, people: {}, screens: [[5, 3]],
    });
    expect(gala).toEqual({
      stage: [10, 6], trusses: ['line 8@4', ...Array(4).fill('totem 0.5@2.5')], rigs: ['8 demo-par-rgbw', '4 demo-spot totem'],
      props: { mic: 1, drape: 1, column: 2 }, people: { lectern: 1 }, screens: [],
    });
    expect(theatre).toEqual({
      stage: [10, 8], trusses: Array(3).fill('line 10@7'), rigs: ['12 demo-par-rgbw', '4 demo-spot'],
      props: { drape: 1, stairs: 1 }, people: { standing: 2 }, screens: [],
    });
  });

  it('recherche de modèle tolérante aux fautes, chiffres exacts', () => {
    expect(matchProfile('ignite300', profiles)?.id).toBe('beamz-ignite300led');
    expect(matchProfile('ingite300', profiles)?.id).toBe('beamz-ignite300led');
    expect(matchProfile('ignite200', profiles)).toBeUndefined();
    expect(editDistance('ingite', 'ignite')).toBe(2);
  });
});
