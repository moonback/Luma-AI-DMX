import { ProjectIndex } from '../../src/core/engine/resolve';
import { interpreterContext, proposeLocally, type ValidationContext } from '../../src/core/ai/director';
import { keptFamilies } from '../../src/core/ai/plan';
import type { AiAction, AiProposal } from '../../src/core/ai/actions';
import { demoProject, makeEngine } from '../helpers';

/**
 * Intent precision bench (local deterministic mode): beyond « an action of the right type », each case checks the
 * resolved fixtures, the exclusions, the values, the fade and what the plan leaves untouched. Simulated rig, no hardware.
 */

/** Demo rig + 3 spots: 5 lyres placed left to right Spot 1 (-3), Spot 3 (-1), Spot 5 (0), Spot 4 (1), Spot 2 (3). */
function rig(lyres: 4 | 5 = 5) {
  const p = demoProject();
  const base = p.patch.find((f) => f.id === 'spot1')!;
  p.patch.push({ ...base, id: 'spot3', name: 'Spot 3', address: 60, position: { x: -1, y: 5 } }, { ...base, id: 'spot4', name: 'Spot 4', address: 80, position: { x: 1, y: 5 } });
  if (lyres === 5) p.patch.push({ ...base, id: 'spot5', name: 'Spot 5', address: 100, position: { x: 0, y: 5 } });
  const { engine } = makeEngine(p);
  // Lit at 80 %, as during a show.
  engine.setAiValues(Object.fromEntries(p.patch.map((f) => [f.id, { dimmer: 0.8 }])), 0);
  engine.tick(25);
  const ctx: ValidationContext = { index: new ProjectIndex(p), allowStrobe: false, maxStrobeHz: 10, aiEffects: [] };
  return { engine, ctx };
}

const PARS = ['par1', 'par2', 'rgbw'];
const LYRES5 = ['spot1', 'spot2', 'spot3', 'spot4', 'spot5'];
const kept = (p: AiProposal) => p.actions.filter((a) => a.status !== 'rejected' && a.action);
const of = <T extends AiAction['type']>(p: AiProposal, type: T) => kept(p).filter((a) => a.action!.type === type) as (AiProposal['actions'][number] & { action: Extract<AiAction, { type: T }> })[];
const sorted = (ids: string[]) => [...ids].sort();

describe('banc de précision des intentions (mode local, kit simulé)', () => {
  it('« Mets tout en violet. » : couleur seule sur tout le kit, intensité et position conservées', () => {
    const { engine, ctx } = rig();
    const p = proposeLocally('Mets tout en violet.', ctx, engine);
    expect(kept(p).map((a) => a.action!.type)).toEqual(['setColor']);
    expect(sorted(of(p, 'setColor')[0]!.fixtureIds)).toEqual(sorted([...PARS, ...LYRES5]));
    expect(of(p, 'setColor')[0]!.action.color).toBe('#8B00FF');
    expect(keptFamilies(kept(p).map((a) => a.action!))).toEqual(expect.arrayContaining(['intensity', 'position', 'beam']));
  });

  it('« Tout en violet sauf les lyres. » : aucune lyre ciblée', () => {
    const { engine, ctx } = rig();
    const p = proposeLocally('Tout en violet sauf les lyres.', ctx, engine);
    expect(sorted(kept(p).flatMap((a) => a.fixtureIds))).toEqual(PARS);
  });

  it('« Mets les lyres en bleu, sauf celle du centre. » : la lyre centrale (par position) est exclue', () => {
    const { engine, ctx } = rig(5);
    const p = proposeLocally('Mets les lyres en bleu, sauf celle du centre.', ctx, engine);
    expect(of(p, 'setColor')).toHaveLength(1);
    expect(sorted(of(p, 'setColor')[0]!.fixtureIds)).toEqual(['spot1', 'spot2', 'spot3', 'spot4']);
    expect(of(p, 'setColor')[0]!.action.color).toBe('#0040FF');
  });

  it('« … sauf celle du centre » avec un nombre pair de lyres : question ciblée, aucune action', () => {
    const { engine, ctx } = rig(4);
    const p = proposeLocally('Mets les lyres en bleu, sauf celle du centre.', ctx, engine);
    expect(p.actions).toEqual([]);
    expect(p.question).toMatch(/4 projecteurs/);
  });

  it('une exclusion illisible n’est jamais ignorée en silence', () => {
    const { engine, ctx } = rig();
    const p = proposeLocally('Tout en rouge sauf les machins.', ctx, engine);
    expect(p.actions).toEqual([]);
    expect(p.question).toMatch(/exclure/);
  });

  it('« Baisse l’intensité de 20 % sans changer les couleurs. » : chaque niveau courant × 0,8, aucune couleur touchée', () => {
    const { engine, ctx } = rig();
    const current = interpreterContext(ctx.index, engine, false).current;
    const p = proposeLocally('Baisse l’intensité de 20 % sans changer les couleurs.', ctx, engine);
    expect(kept(p).every((a) => a.action!.type === 'setIntensity')).toBe(true);
    for (const a of of(p, 'setIntensity')) for (const id of a.fixtureIds) expect(a.action.level).toBeCloseTo(current[id]!.level * 0.8, 2);
    expect(sorted(of(p, 'setIntensity').flatMap((a) => a.fixtureIds))).toEqual(sorted([...PARS, ...LYRES5]));
    expect(p.relative).toBe(true);
    expect(p.notices.join(' ')).toMatch(/Conservé.*couleur/);
  });

  it('« Fais monter progressivement l’intensité pendant huit secondes. » : 100 % en 8 s', () => {
    const { engine, ctx } = rig();
    const [a] = of(proposeLocally('Fais monter progressivement l’intensité pendant huit secondes.', ctx, engine), 'setIntensity');
    expect(a!.action).toMatchObject({ level: 1, fade: 8, target: { all: true } });
  });

  it('« Crée un chase sur les quatre lyres. » : quatre lyres exactement, signalé si le patch en a moins', () => {
    const { engine, ctx } = rig(5);
    const [fx] = of(proposeLocally('Crée un chase sur les quatre lyres.', ctx, engine), 'startEffect');
    expect(fx!.action.effect.effectType).toBe('chase');
    expect(fx!.fixtureIds).toHaveLength(4);
    expect(fx!.fixtureIds.every((id) => id.startsWith('spot'))).toBe(true);
    const small = makeEngine();
    small.engine.tick(25);
    const [few] = proposeLocally('Crée un chase sur les quatre lyres.', { index: new ProjectIndex(small.project), allowStrobe: false, maxStrobeHz: 10 }, small.engine).actions;
    expect(few!.status).toBe('warning');
    expect(few!.messages.join(' ')).toMatch(/4 projecteur\(s\) demandé\(s\), 2 disponible/);
  });

  it('« Synchronise les mouvements avec le BPM actuel. » : panTilt synchronisé, lyres seulement', () => {
    const { engine, ctx } = rig();
    const [fx] = of(proposeLocally('Synchronise les mouvements avec le BPM actuel.', ctx, engine), 'startEffect');
    expect(fx!.action.effect).toMatchObject({ effectType: 'panTilt', bpmSync: true });
    expect(sorted(fx!.fixtureIds)).toEqual(LYRES5);
  });

  it('« Ralentis l’effet précédent. » : refusé sans effet IA en cours, sinon nommé et ralenti', () => {
    const { engine, ctx } = rig();
    const none = proposeLocally('Ralentis l’effet précédent.', ctx, engine);
    expect(none.actions[0]).toMatchObject({ status: 'rejected', messages: ['Aucun effet IA en cours'] });
    const p = proposeLocally('Ralentis l’effet précédent.', { ...ctx, aiEffects: [{ name: 'IA · chase', type: 'chase' }] }, engine);
    expect(of(p, 'adjustEffect')[0]!.action.speedFactor).toBeLessThan(1);
    expect(of(p, 'adjustEffect')[0]!.summary).toContain('IA · chase');
  });

  it('« Annule la dernière modification. » : aucune action, annulation proposée (bouton Défaire)', () => {
    const { engine, ctx } = rig();
    const p = proposeLocally('Annule la dernière modification.', ctx, engine);
    expect(p.actions).toEqual([]);
    expect(p.offer).toBe('undo');
  });

  it('demande composée : chaque clause garde sa cible et sa couleur', () => {
    const { engine, ctx } = rig();
    const p = proposeLocally('Mets les pars en rouge et les lyres en bleu.', ctx, engine);
    const colors = of(p, 'setColor').map((a) => ({ c: a.action.color, ids: sorted(a.fixtureIds) }));
    expect(colors).toEqual([{ c: '#FF0000', ids: PARS }, { c: '#0040FF', ids: LYRES5 }]);
  });

  it('une couleur et une teinte (« ambiance lounge violette et bleue ») ne sont pas découpées', () => {
    const { engine, ctx } = rig();
    const p = proposeLocally('Crée une ambiance lounge violette et bleue.', ctx, engine);
    expect(kept(p).map((a) => a.action!.type)).toEqual(['createScene']);
  });

  it('correction « Plutôt en vert. » : mêmes projecteurs que la proposition précédente', () => {
    const { engine, ctx } = rig();
    const p = proposeLocally('Plutôt en vert.', ctx, engine, undefined, ['Spot 1', 'Spot 2']);
    expect(of(p, 'setColor')[0]!.action.color).toBe('#00FF40');
    expect(sorted(of(p, 'setColor')[0]!.fixtureIds)).toEqual(['spot1', 'spot2']);
    expect(p.understanding).toMatch(/demande précédente/);
  });

  it('« Mets tout en vert » reste explicite même après une proposition', () => {
    const { engine, ctx } = rig();
    const p = proposeLocally('Finalement, mets tout en vert.', ctx, engine, undefined, ['Spot 1']);
    expect(of(p, 'setColor')[0]!.fixtureIds).toHaveLength(PARS.length + LYRES5.length);
  });
});
