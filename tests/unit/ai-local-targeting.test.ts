import { ProjectIndex } from '../../src/core/engine/resolve';
import { interpretLocally, namesOf, type InterpreterContext } from '../../src/core/ai/local/interpreter';
import { interpreterContext } from '../../src/core/ai/director';
import type { AiAction } from '../../src/core/ai/actions';
import { makeEngine } from '../helpers';

/** Demo rig (PAR 1, PAR 2, PAR W in group « Pars », Spot 1, Spot 2) lit: PARs red, spots at 40 %. */
function lit(): InterpreterContext {
  const { engine, project } = makeEngine();
  engine.setProgrammer(['par1', 'par2'], { red: 0.8 });
  engine.setProgrammer(['spot1', 'spot2'], { dimmer: 0.4 });
  engine.tick(25);
  return interpreterContext(new ProjectIndex(project), engine, false);
}

/** Fixture names the actions of a plan would touch. */
const touched = (ctx: InterpreterContext, actions: AiAction[]) =>
  new Set(actions.flatMap((a) => ('target' in a && a.target ? namesOf(a.target, ctx) : [])));
const LYRES = new Set(['Spot 1', 'Spot 2']);

describe('mode local : seuls les projecteurs demandés changent', () => {
  it('« Augmente l’intensité des lyres » ne touche que les lyres', () => {
    const ctx = lit();
    const r = interpretLocally('Augmente l’intensité des lyres.', ctx);
    expect(r.actions.map((a) => a.type)).toEqual(['setIntensity']);
    expect(touched(ctx, r.actions)).toEqual(LYRES);
  });

  it('« Rends les lyres plus chaudes » ne change que les couleurs des lyres', () => {
    const ctx = lit();
    const r = interpretLocally('Rends les lyres plus chaudes.', ctx);
    expect(r.actions.length).toBeGreaterThan(0);
    expect(r.actions.every((a) => a.type === 'setColor')).toBe(true);
    expect([...touched(ctx, r.actions)].every((n) => LYRES.has(n))).toBe(true);
  });

  it('« Rends les lyres plus douces » part du niveau des lyres et n’arrête pas les effets des autres projecteurs', () => {
    const r = interpretLocally('Rends les lyres plus douces.', { ...lit(), runningEffects: ['strobe', 'chase'] });
    expect(r.actions).toEqual([{ type: 'setIntensity', target: { fixtureNames: ['Spot 1', 'Spot 2'] }, level: 0.28, fade: 3 }]);
  });

  it('« Plus lumineux » sans cible : chaque projecteur allumé part de son propre niveau', () => {
    const ctx = lit();
    const r = interpretLocally('Plus lumineux s’il te plaît.', ctx);
    const levels = Object.fromEntries(r.actions.flatMap((a) => (a.type === 'setIntensity' ? namesOf(a.target, ctx).map((n) => [n, a.level]) : [])));
    expect(levels['Spot 1']).toBe(0.52);
    expect(levels['PAR 1']).not.toBe(0.52);
    expect(levels['PAR W']).toBeUndefined(); // éteint : reste éteint
  });

  it('« Mets tout en bleu » vise explicitement tout le kit', () => {
    expect(interpretLocally('Mets tout en bleu.', lit()).actions).toEqual([{ type: 'setColor', target: { all: true }, color: '#0040FF', fade: 2 }]);
  });

  it('« Baisse de 20 % » : chaque projecteur conserve sa progression relative', () => {
    const levels = interpretLocally('Baisse de 20 %.', lit()).actions.map((a) => (a.type === 'setIntensity' ? a.level : null));
    expect(levels).toContain(0.32);
    expect(new Set(levels).size).toBeGreaterThan(1);
  });

  it('« Violet partout sauf les lyres » : les lyres gardent leur couleur', () => {
    const ctx = lit();
    const r = interpretLocally('Violet partout sauf les lyres.', ctx);
    expect(r.actions.length).toBeGreaterThan(0);
    expect([...touched(ctx, r.actions)].some((n) => LYRES.has(n))).toBe(false);
  });

  it('« Ralentis le chase » n’ajuste que la vitesse du chase', () => {
    expect(interpretLocally('Ralentis le chase.', lit()).actions).toEqual([{ type: 'adjustEffect', effectType: 'chase', speedFactor: 0.5 }]);
  });

  it('une scène inexistante ne produit aucune action', () => {
    const r = interpretLocally('Applique la scène Inexistante.', { ...lit(), scenes: ['Accueil'] });
    expect(r.actions).toEqual([]);
    expect(r.recognized).toBe(false);
  });

  it('« Fais clignoter doucement » avec le strobe désactivé ne démarre aucun strobe', () => {
    const r = interpretLocally('Fais clignoter doucement.', lit());
    expect(r.actions.some((a) => a.type === 'startEffect' && a.effect.effectType === 'strobe')).toBe(false);
  });

  it('une commande inconnue ne modifie rien', () => {
    expect(interpretLocally('Raconte-moi une blague.', lit()).actions).toEqual([]);
  });

  it('un nom proche d’un groupe sans correspondance exacte pose une question au lieu de viser tout le kit', () => {
    const ctx = lit();
    const r = interpretLocally('Mets les contrejours en bleu.', { ...ctx, groups: [...ctx.groups, { name: 'Contres', members: ['Spot 1'] }] });
    expect(r.actions).toEqual([]);
    expect(r.question).toContain('Contres');
  });
});
