import { ProjectIndex } from '../../src/core/engine/resolve';
import { buildProposal, interpreterContext } from '../../src/core/ai/director';
import { enforceConstraints, promptConstraints } from '../../src/core/ai/guards';
import { actionFamilies, keptFamilies } from '../../src/core/ai/plan';
import { demoProject, makeEngine, makeService, run } from '../helpers';

/* AI Director pipeline: request constraints on remote plans, AI layer fades, stale relative plans, conversation, timings. */

/** Demo rig: Spot 1 at x = -3 (left), Spot 2 at x = 3 (right). */
function remote(prompt: string, rawActions: unknown[]) {
  const p0 = demoProject();
  const { engine } = makeEngine(p0);
  engine.tick(25);
  const index = new ProjectIndex(p0);
  const p = buildProposal({ prompt, provider: 'openrouter', model: 'm', understanding: '', notices: [], rawActions, ctx: { index, allowStrobe: false, maxStrobeHz: 10 } });
  enforceConstraints(p, promptConstraints(prompt, interpreterContext(index, engine, false)), index);
  return p;
}
const lyresBlue = { type: 'setColor', target: { fixtureTypes: ['moving-head-spot'] }, color: '#0040FF', fade: 2 };

describe('contraintes de la demande sur un plan distant', () => {
  it('« sauf celle de gauche » protège la lyre la plus à gauche', () => {
    const p = remote('Mets les lyres en bleu sauf celle de gauche', [lyresBlue, { type: 'setColor', target: { fixtureNames: ['Spot 2'] }, color: '#0040FF', fade: 2 }]);
    expect(p.actions.map((a) => a.status)).toEqual(['rejected', 'ok']);
    expect(p.actions[0]!.messages.join(' ')).toMatch(/protégés.*Spot 1/);
  });

  it('« sauf celle du centre » sur deux lyres : question posée et rien d’applicable', () => {
    const p = remote('Mets les lyres en bleu sauf celle du centre', [lyresBlue]);
    expect(p.question).toMatch(/aucun n’est seul au centre/);
    expect(p.actions.every((a) => a.status === 'rejected')).toBe(true);
  });

  it('« sans changer l’intensité » refuse une action d’intensité, garde la couleur', () => {
    const p = remote('Mets tout en rouge sans changer l’intensité', [{ type: 'setColor', target: { all: true }, color: '#FF0000' }, { type: 'setIntensity', target: { all: true }, level: 1 }]);
    expect(p.actions.map((a) => a.status)).toEqual(['ok', 'rejected']);
    expect(p.actions[1]!.messages.join(' ')).toMatch(/interdit de changer : intensité/);
  });
});

describe('familles de paramètres d’un plan', () => {
  it('modifié / conservé', () => {
    expect(actionFamilies({ type: 'setColor', target: { all: true }, color: '#FF0000', fade: 0 })).toEqual(['color']);
    expect(actionFamilies({ type: 'createScene', name: 'S', look: [{ target: { all: true }, level: 1 }], apply: false, fade: 0 })).toEqual([]);
    expect(actionFamilies({ type: 'releaseAi' })).toBeNull();
    expect(keptFamilies([{ type: 'setIntensity', target: { all: true }, level: 0.5, fade: 0 }])).toEqual(['color', 'position', 'beam', 'effects', 'tempo']);
    expect(keptFamilies([{ type: 'releaseAi' }])).toEqual([]);
  });
});

describe('couche IA', () => {
  it('un fondu progressif part de la valeur actuellement sortie, pas du noir', () => {
    const { engine } = makeEngine();
    engine.setExternal('test', { layer: { id: 'test', label: 'Test', kind: 'playback', priority: 50, order: 1, values: { rgbw: { dimmer: 0.6 } } } });
    engine.tick(25);
    engine.setAiValues({ rgbw: { dimmer: 1 } }, 8);
    engine.tick(25);
    const level = engine.compute().values.rgbw!.dimmer!;
    expect(level).toBeGreaterThan(0.59);
    expect(level).toBeLessThan(0.62);
  });

  it('sans fondu, la valeur est atteinte immédiatement', () => {
    const { engine } = makeEngine();
    engine.setAiValues({ rgbw: { dimmer: 0.3 } }, 0);
    expect(engine.compute().values.rgbw!.dimmer).toBeCloseTo(0.3);
  });
});

async function service() {
  const { svc } = makeService();
  await svc.init();
  await svc.execute({ type: 'project.new', name: 'Flux IA' });
  const { ids } = await svc.execute({ type: 'fixture.add', profileId: 'demo-par-rgbw', mode: '6ch DRGBW+Strobe', universe: 1, address: null, count: 4, namePrefix: 'PAR', tags: [] });
  await svc.execute({ type: 'group.upsert', group: { id: 'g1', name: 'Faces', color: '#FFFFFF', fixtureIds: ids.slice(0, 2) } });
  return { svc, ids };
}

describe('service : chemin complet', () => {
  it('une proposition relative est refusée si les niveaux ont changé depuis l’aperçu', async () => {
    const { svc } = await service();
    const full = await svc.execute({ type: 'ai.propose', prompt: 'Mets tout à 80 %' });
    await svc.execute({ type: 'ai.apply', proposalId: full.id });
    run(svc.engine, 2100); // end of the 2 s fade
    const rel = await svc.execute({ type: 'ai.propose', prompt: 'Baisse l’intensité de 20 %' });
    expect(rel.relative).toBe(true);
    expect(rel.actions[0]!.action).toMatchObject({ type: 'setIntensity', level: 0.64 });
    svc.engine.setAiValues(Object.fromEntries(svc.project.patch.map((f) => [f.id, { dimmer: 0.3 }])), 0);
    svc.engine.tick(25);
    await new Promise((r) => setTimeout(r, 310)); // anti-loop delay between two applications
    await expect(svc.execute({ type: 'ai.apply', proposalId: rel.id })).rejects.toThrow(/périmée.*relative/);
  });

  it('« Plutôt en vert » corrige la proposition précédente du fil, même non appliquée', async () => {
    const { svc, ids } = await service();
    await svc.execute({ type: 'ai.propose', prompt: 'Mets les faces en violet' });
    const fix = await svc.execute({ type: 'ai.propose', prompt: 'Plutôt en vert', continueThread: true });
    expect(fix.actions[0]!.action).toMatchObject({ type: 'setColor', color: '#00FF40' });
    expect(fix.actions[0]!.fixtureIds.sort()).toEqual(ids.slice(0, 2).sort());
  });

  it('« Annule la dernière modification » propose « Défaire » sans action', async () => {
    const { svc } = await service();
    const p = await svc.execute({ type: 'ai.propose', prompt: 'Annule la dernière modification' });
    expect(p.actions).toEqual([]);
    expect(p.offer).toBe('undo');
  });

  it('ralentir un effet qui ne tourne pas est refusé avant exécution', async () => {
    const { svc } = await service();
    const p = await svc.execute({ type: 'ai.propose', prompt: 'Ralentis le chase' });
    expect(p.actions[0]).toMatchObject({ status: 'rejected', messages: ['Aucun effet IA en cours'] });
  });

  it('les temps de compréhension, validation et exécution sont mesurés', async () => {
    const { svc } = await service();
    const p = await svc.execute({ type: 'ai.propose', prompt: 'Tout en bleu' });
    expect(p.timings!.understandMs).toBeGreaterThanOrEqual(0);
    expect(p.timings!.validateMs).toBeGreaterThanOrEqual(0);
    const report = await svc.execute({ type: 'ai.apply', proposalId: p.id });
    expect(report.executeMs).toBeGreaterThanOrEqual(0);
    expect(report.verification.checked).toBeGreaterThan(0);
  });
});
