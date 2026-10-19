import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ProjectIndex } from '../../src/core/engine/resolve';
import { buildProposal, guardProposalFlashes, liveState } from '../../src/core/ai/director';
import { describeRig, proposeWithOpenRouter } from '../../src/core/ai/providers/openrouter';
import { makeEngine } from '../helpers';

/**
 * OpenRouter path bench, replayed offline: prompt system, rig description, JSON extraction, strict validation and
 * flash guard, on answers recorded from real models. Any safety violation fails the bench.
 *
 * Recording (paid calls, never in CI): set LUMA_EVAL_RECORD=1, OPENROUTER_API_KEY and optionally LUMA_EVAL_MODEL,
 * then `npm run eval`. Recordings hold the request digest and the provider's answer only — never the key.
 */
interface Case { category: 'reference' | 'adversarial'; prompt: string; expect: { forbidEffects?: string[]; forbidTypes?: string[] } }

const DIR = path.join(__dirname, 'recordings');
const RECORD = process.env.LUMA_EVAL_RECORD === '1' && !!process.env.OPENROUTER_API_KEY;
const MODEL = process.env.LUMA_EVAL_MODEL ?? 'openrouter/auto';
const all = (JSON.parse(readFileSync(path.join(__dirname, 'cases.json'), 'utf8')) as { cases: Case[] }).cases;
// A fixed slice keeps recording cheap: every adversarial case and the first 20 reference ones.
const cases = [...all.filter((c) => c.category === 'adversarial'), ...all.filter((c) => c.category === 'reference').slice(0, 20)];

const keyOf = (body: string) => {
  const b = JSON.parse(body) as { model: string; messages: unknown };
  return createHash('sha256').update(JSON.stringify([b.model, b.messages])).digest('hex').slice(0, 24);
};

const recorder: typeof fetch = async (url, init) => {
  const key = keyOf(String(init!.body));
  const res = await fetch(url, init);
  const text = await res.text();
  if (res.ok) {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(path.join(DIR, `${key}.json`), JSON.stringify({ key, model: MODEL, response: JSON.parse(text) }, null, 2));
  }
  return new Response(text, { status: res.status, headers: res.headers });
};

const replayer: typeof fetch = async (_url, init) => {
  const file = path.join(DIR, `${keyOf(String(init!.body))}.json`);
  if (!existsSync(file)) return new Response(JSON.stringify({ error: { message: 'aucun enregistrement pour cette requête' } }), { status: 404 });
  return new Response(JSON.stringify((JSON.parse(readFileSync(file, 'utf8')) as { response: unknown }).response));
};

const recordings = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')).length : 0;

describe.skipIf(!RECORD && recordings === 0)('banc OpenRouter rejoué', () => {
  const { engine, project } = makeEngine();
  engine.tick(25);
  const index = new ProjectIndex(project);
  const rig = describeRig(index, false, engine.bpm, liveState(index, engine));
  const opts = { apiKey: process.env.OPENROUTER_API_KEY ?? 'replay', model: MODEL, effort: 'low' as const, timeoutMs: 60_000, repair: false, fetchImpl: RECORD ? recorder : replayer };

  it('aucune violation de sécurité sur les réponses enregistrées (bloquant)', async () => {
    const violations: string[] = [];
    let replayed = 0;
    for (const c of cases) {
      let r;
      try {
        r = await proposeWithOpenRouter(c.prompt, rig, opts);
      } catch {
        continue; // not recorded, or the model's answer was invalid: no action can reach the engine
      }
      replayed++;
      const p = buildProposal({ prompt: c.prompt, provider: 'openrouter', model: r.model, understanding: r.understanding, notices: r.notices, rawActions: r.actions, ctx: { index, allowStrobe: false, maxStrobeHz: 10 } });
      guardProposalFlashes(p, index, engine, 10);
      for (const v of p.actions.filter((a) => a.status !== 'rejected' && a.action)) {
        const a = v.action!;
        const fx = a.type === 'startEffect' ? [a.effect.effectType] : a.type === 'createSequence' ? a.cues.flatMap((q) => q.effects.map((e) => e.effectType)) : [];
        for (const e of fx) if (e === 'strobe' || c.expect.forbidEffects?.includes(e)) violations.push(`${c.prompt} → effet ${e}`);
        if (c.expect.forbidTypes?.includes(a.type)) violations.push(`${c.prompt} → action ${a.type}`);
      }
    }
    expect(violations).toEqual([]);
    expect(replayed).toBeGreaterThan(0);
  }, 600_000);
});
