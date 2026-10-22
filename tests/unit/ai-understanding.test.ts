import { ProjectIndex } from '../../src/core/engine/resolve';
import { interpretLocally, type InterpreterContext } from '../../src/core/ai/local/interpreter';
import { buildProposal, executeProposal, interpreterContext, resolveAiTarget } from '../../src/core/ai/director';
import type { AiAction } from '../../src/core/ai/actions';
import { demoProject, makeEngine, makeService } from '../helpers';

/* Regression tests of the AI assistant audit (docs/AI-ASSISTANT-AUDIT.md): negations, relative changes, context. */

function rig(allowStrobe = false) {
  const p = demoProject();
  p.groups.push({ id: 'g-faces', name: 'Faces', color: '#fff', fixtureIds: ['par1', 'par2'] }, { id: 'g-ch', name: 'Chanteur', color: '#fff', fixtureIds: ['spot1'] });
  const { engine } = makeEngine(p);
  engine.setProgrammer(['spot1', 'spot2'], { dimmer: 0.5 });
  engine.tick(25);
  const index = new ProjectIndex(p);
  return { engine, index, ictx: interpreterContext(index, engine, allowStrobe) };
}
const say = (prompt: string, ictx: InterpreterContext) => interpretLocally(prompt, ictx);
const effectsOf = (actions: AiAction[]) => actions.flatMap((a) => (a.type === 'startEffect' ? [a.effect.effectType] : a.type === 'createSequence' ? a.cues.flatMap((c) => c.effects.map((e) => e.effectType)) : []));

describe('compréhension : négations et contraintes', () => {
  it('« sans strobe » n’ajoute jamais de strobe, même autorisé', () => {
    const { ictx } = rig(true);
    expect(effectsOf(say('Mets les pars en bleu sans strobe', ictx).actions)).toEqual([]);
    const r = say('Fais quelque chose de plus énergique sans utiliser de strobe.', ictx);
    expect(r.recognized).toBe(true);
    expect(effectsOf(r.actions)).not.toContain('strobe');
  });

  it('« pas de rouge » retire la couleur niée', () => {
    const { ictx } = rig();
    expect(say('Pas de rouge, mets du bleu.', ictx).actions).toEqual([expect.objectContaining({ type: 'setColor', color: '#0040FF' })]);
  });

  it('« pas les pars » et « garde les faces » excluent ces projecteurs de la cible', () => {
    const { ictx } = rig();
    expect(say('Mets les lyres en rouge pas les pars.', ictx).actions).toEqual([expect.objectContaining({ type: 'setColor', color: '#FF0000', target: { fixtureNames: ['Spot 1', 'Spot 2'] } })]);
    const keep = say('Passe tout en bleu, mais garde les faces blanches.', ictx).actions;
    expect(keep).toEqual([expect.objectContaining({ type: 'setColor', color: '#0040FF', target: { fixtureNames: ['PAR W', 'Spot 1', 'Spot 2'] } })]);
  });

  it('« ne change rien » ne produit aucune action', () => {
    expect(say('Ne change rien pour l’instant.', rig().ictx)).toMatchObject({ recognized: true, actions: [] });
  });

  it('« annule la dernière modification » ne relâche pas toute la couche IA', () => {
    const r = say('Annule uniquement la dernière modification de l’assistant.', rig().ictx);
    expect(r.actions).toEqual([]);
    expect(r.notices.join(' ')).toMatch(/Annuler/);
  });
});

describe('compréhension : valeurs relatives et faux positifs', () => {
  it('« baisse … de 20 % » est relatif à l’intensité actuelle, « à 20 % » est absolu', () => {
    const { ictx } = rig();
    expect(say('Baisse l’intensité des lyres de 20 %.', ictx).actions).toEqual([expect.objectContaining({ type: 'setIntensity', level: 0.4, target: { fixtureNames: ['Spot 1', 'Spot 2'] } })]);
    expect(say('Baisse l’intensité des lyres à 20 %.', ictx).actions).toEqual([expect.objectContaining({ type: 'setIntensity', level: 0.2 })]);
  });

  it('« divise par deux la vitesse » ralentit l’effet au lieu de viser les PAR', () => {
    expect(say('Divise par deux la vitesse de cet effet.', rig().ictx).actions).toEqual([{ type: 'adjustEffect', speedFactor: 0.5 }]);
  });

  it('les noms de groupes tolèrent le singulier/pluriel', () => {
    expect(say('Éteins la face.', rig().ictx).actions[0]).toMatchObject({ type: 'setIntensity', target: { groupNames: ['Faces'] }, level: 0 });
  });
});

describe('mémoire de travail : « leur »', () => {
  it('reprend les projecteurs de la dernière action appliquée', () => {
    const { ictx } = rig();
    expect(say('Baisse leur intensité de 20 %.', { ...ictx, lastTargets: ['Spot 1'] }).actions).toEqual([expect.objectContaining({ type: 'setIntensity', level: 0.4, target: { fixtureNames: ['Spot 1'] } })]);
  });

  it('demande une précision quand aucune cible précédente n’est connue', () => {
    expect(say('Baisse leur intensité de 20 %.', rig().ictx)).toMatchObject({ recognized: false, actions: [] });
  });

  it('le service mémorise les cibles appliquées dans le fil et les oublie hors du fil', async () => {
    const { svc } = makeService();
    await svc.init();
    await svc.execute({ type: 'project.new', name: 'Mémoire' });
    const { ids: pars } = await svc.execute({ type: 'fixture.add', profileId: 'demo-par-rgbw', mode: '6ch DRGBW+Strobe', universe: 1, address: null, count: 4, namePrefix: 'PAR', tags: [] });
    await svc.execute({ type: 'group.upsert', group: { id: 'g1', name: 'Faces', color: '#FFFFFF', fixtureIds: pars.slice(0, 2) } });
    const first = await svc.execute({ type: 'ai.propose', prompt: 'Mets les faces en violet' });
    await svc.execute({ type: 'ai.apply', proposalId: first.id });
    const follow = await svc.execute({ type: 'ai.propose', prompt: 'Baisse leur intensité de 20 %', continueThread: true });
    expect(follow.actions.length).toBeGreaterThan(0);
    expect(follow.actions.flatMap((a) => a.fixtureIds).sort()).toEqual(pars.slice(0, 2).sort());
    const fresh = await svc.execute({ type: 'ai.propose', prompt: 'Baisse leur intensité de 20 %' });
    expect(fresh.actions).toEqual([]);
  });
});

describe('fiabilité des actions', () => {
  it('un groupe inconnu ne s’élargit pas à tout un type de projecteurs', () => {
    expect(resolveAiTarget(rig().index, { groupNames: ['Inconnu'], fixtureTypes: ['moving-head-spot'] })).toEqual({ ids: [], problems: ['Groupe inconnu « Inconnu »'] });
  });

  it('un effet refusé par le moteur après validation est rapporté comme ignoré, pas exécuté', () => {
    const { engine, index } = rig();
    const p = buildProposal({ prompt: 'chase', provider: 'local', model: null, understanding: '', notices: [], rawActions: [{ type: 'startEffect', effect: { name: 'X', effectType: 'chase', target: { all: true } } }], ctx: { index, allowStrobe: false, maxStrobeHz: 10 } });
    engine.startEffect = () => null;
    const deferred: (() => void)[] = [];
    const report = executeProposal(p, { index: () => index, mutate: () => undefined, defer: (fn) => deferred.push(fn), engine, maxStrobeHz: 10 });
    deferred.forEach((fn) => fn());
    expect(report.executed).toEqual([]);
    expect(report.skipped).toEqual([expect.objectContaining({ index: 0, reason: expect.stringMatching(/refusé/) })]);
  });
});
