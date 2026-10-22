import { vi } from 'vitest';
import { ProjectIndex } from '../../src/core/engine/resolve';
import { buildProposal, interpreterContext, resolveAiTarget } from '../../src/core/ai/director';
import { enforceConstraints, expandRelativeIntensity, promptConstraints } from '../../src/core/ai/guards';
import { proposeWithOpenRouter } from '../../src/core/ai/providers/openrouter';
import { voicePrompt } from '../../src/core/ai/prompts';
import { demoProject, makeEngine, makeService } from '../helpers';

/* Deterministic checks around the model (constraints, exclusions, relative intensity) and automatic application. */

function rig() {
  const p = demoProject();
  const { engine } = makeEngine(p);
  engine.setProgrammer(['spot1', 'spot2'], { dimmer: 0.5 });
  engine.tick(25);
  const index = new ProjectIndex(p);
  return { engine, index, ictx: interpreterContext(index, engine, true), vctx: { index, allowStrobe: true, maxStrobeHz: 10 } };
}

/** A proposal as the remote model would send it, checked against the constraints of its prompt. */
function remote(prompt: string, rawActions: unknown[]) {
  const { index, ictx, vctx } = rig();
  const p = buildProposal({ prompt, provider: 'openrouter', model: 'm', understanding: '', notices: [], rawActions, ctx: vctx });
  const rejected = enforceConstraints(p, promptConstraints(prompt, ictx), index);
  return { p, rejected, status: p.actions.map((a) => a.status) };
}

const blue = (target: object) => ({ type: 'setColor', target, color: '#0040FF', fade: 2 });

describe('contraintes de la demande appliquées au modèle', () => {
  it('« sans strobe » refuse le strobe du modèle, même autorisé dans les réglages', () => {
    const { status, rejected, p } = remote('Mets les pars en bleu sans strobe', [blue({ fixtureTypes: ['par'] }), { type: 'startEffect', effect: { name: 'S', effectType: 'strobe', target: { all: true }, speed: 5 } }]);
    expect(status).toEqual(['ok', 'rejected']);
    expect(rejected).toBe(1);
    expect(p.actions[1]!.messages.join(' ')).toMatch(/Contrainte non respectée : effet strobe/);
  });

  it('« pas de rouge » refuse une teinte rouge proche, pas les autres couleurs', () => {
    expect(remote('Pas de rouge, mets du bleu', [{ type: 'setColor', target: { all: true }, color: '#FF1010' }, blue({ all: true })]).status).toEqual(['rejected', 'ok']);
  });

  it('« sauf les spots » refuse une action qui les touche, accepte target.exclude', () => {
    const { status, p } = remote('Tout en bleu sauf les spots', [blue({ all: true }), blue({ all: true, exclude: { fixtureNames: ['Spot 1', 'Spot 2'] } })]);
    expect(status).toEqual(['rejected', 'ok']);
    expect(p.actions[1]!.fixtureIds).toEqual(['par1', 'par2', 'rgbw']);
    expect(Object.keys(p.preview).sort()).toEqual(['par1', 'par2', 'rgbw']); // the preview no longer shows the refused action
  });

  it('« ne touche pas aux couleurs » refuse les changements de couleur, garde l’arrêt des effets', () => {
    expect(remote('Arrête les effets mais ne touche pas aux couleurs', [{ type: 'stopEffect', all: true }, blue({ all: true })]).status).toEqual(['ok', 'rejected']);
  });
});

describe('contrat v3 et intensité relative', () => {
  it('une exclusion inconnue est signalée', () => {
    expect(resolveAiTarget(rig().index, { all: true, exclude: { groupNames: ['Faces'] } }).problems).toEqual(['Exclusion : Groupe inconnu « Faces »']);
  });

  it('adjustIntensity devient un niveau réel par projecteur', () => {
    const { index, engine } = rig();
    const current = interpreterContext(index, engine, false).current;
    expect(expandRelativeIntensity([{ type: 'adjustIntensity', target: { fixtureTypes: ['moving-head-spot'] }, factor: 0.8 }], index, current))
      .toEqual([{ type: 'setIntensity', target: { fixtureNames: ['Spot 1', 'Spot 2'] }, level: 0.4, fade: 2 }]);
    expect(expandRelativeIntensity([{ type: 'adjustIntensity', target: { groupNames: ['Inconnu'] }, factor: 0.8 }], index, current)[0]).toMatchObject({ type: 'setIntensity', level: 0 });
  });

  it('OpenRouter peut renvoyer une question de clarification', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"understanding":"?","question":"Quels projecteurs ?","actions":[]}' } }] }), { status: 200 }));
    const r = await proposeWithOpenRouter('passe-les en rouge', '{}', { apiKey: 'k', model: 'a/b', effort: 'low', timeoutMs: 5000, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toMatchObject({ question: 'Quels projecteurs ?', actions: [] });
  });
});

describe('application automatique (Paramètres › Assistant)', () => {
  async function service(autoApply: boolean, allowStrobe = false) {
    const { svc } = makeService();
    await svc.init();
    await svc.execute({ type: 'project.new', name: 'Auto' });
    await svc.execute({ type: 'fixture.add', profileId: 'demo-par-rgbw', mode: '6ch DRGBW+Strobe', universe: 1, address: null, count: 2, namePrefix: 'PAR', tags: [] });
    const s = await svc.execute({ type: 'settings.get' });
    await svc.execute({ type: 'settings.update', settings: { ...s, assistant: { ...s.assistant, autoApply }, ai: { ...s.ai, allowStrobe } } });
    return svc;
  }

  it('applique la proposition sans confirmation, et « Défaire » l’annule', async () => {
    const svc = await service(true);
    const p = await svc.execute({ type: 'ai.propose', prompt: 'Mets les pars en bleu' });
    expect(p.autoApplied?.executed.length).toBeGreaterThan(0);
    expect(svc.engine.snapshot().aiActive).toBe(true);
    await expect(svc.execute({ type: 'ai.apply', proposalId: p.id })).rejects.toThrow(/expirée/); // applied once only
    await svc.execute({ type: 'ai.undoApply' });
  });

  it('désactivée par défaut : rien n’est appliqué', async () => {
    const svc = await service(false);
    const p = await svc.execute({ type: 'ai.propose', prompt: 'Mets les pars en bleu' });
    expect(p.autoApplied).toBeUndefined();
  });

  it('une révision ne réactive pas une action refusée par une contrainte', async () => {
    const svc = await service(false, true);
    const p = await svc.execute({ type: 'ai.propose', prompt: 'Mets les pars en bleu sans strobe' });
    const revised = await svc.execute({ type: 'ai.revise', proposalId: p.id, actions: [...p.actions.map((a) => a.action), { type: 'startEffect', effect: { name: 'S', effectType: 'strobe', target: { all: true } } }] });
    expect(revised.actions.at(-1)!.status).toBe('rejected');
  });

  it('le prompt vocal annonce l’application automatique', () => {
    expect(voicePrompt('Luma', null, true)).toMatch(/n'appelle pas apply_proposal/);
    expect(voicePrompt('Luma', null)).not.toMatch(/Application automatique/);
  });
});
