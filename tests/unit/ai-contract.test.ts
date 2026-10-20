import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { AI_ACTIONS_VERSION, aiActionSchema, migrateAiActions } from '../../src/core/ai/actions';
import { buildProposal, validateActions } from '../../src/core/ai/director';
import { ProjectIndex } from '../../src/core/engine/resolve';
import { demoProject } from '../helpers';

const DIR = path.resolve('tests/fixtures/ai-contract');
const schemaFile = path.join(DIR, `v${AI_ACTIONS_VERSION}.schema.json`);
const ctx = () => ({ index: new ProjectIndex(demoProject()), allowStrobe: false, maxStrobeHz: 10 });

describe('contrat d’actions IA versionné', () => {
  it('le schéma correspond à la version déclarée (sinon : AI_ACTIONS_VERSION + 1, migration, échantillons)', () => {
    const current = JSON.stringify(z.toJSONSchema(aiActionSchema, { io: 'input' }), null, 2);
    // UPDATE_AI_CONTRACT=1 writes the snapshot of a NEW version; an existing version is never rewritten.
    if (process.env.UPDATE_AI_CONTRACT && !existsSync(schemaFile)) writeFileSync(schemaFile, `${current}\n`);
    expect(existsSync(schemaFile), `${schemaFile} manquant : lancez UPDATE_AI_CONTRACT=1 npx vitest run tests/unit/ai-contract.test.ts`).toBe(true);
    // core.autocrlf may check the snapshot out with CRLF: compare line endings normalised.
    expect(current, `aiActionSchema a changé sans changer AI_ACTIONS_VERSION (${AI_ACTIONS_VERSION})`).toBe(readFileSync(schemaFile, 'utf8').replace(/\r\n/gu, '\n').trimEnd());
  });

  it('les échantillons de la version courante couvrent tous les types d’action', () => {
    const samples = JSON.parse(readFileSync(path.join(DIR, `v${AI_ACTIONS_VERSION}.samples.json`), 'utf8')) as { type: string }[];
    const types = aiActionSchema.options.map((o) => o.shape.type.value);
    expect(new Set(samples.map((s) => s.type))).toEqual(new Set(types));
  });

  it('les échantillons de chaque version passée valident encore une fois migrés', () => {
    const files = readdirSync(DIR).filter((f) => /^v\d+\.samples\.json$/u.test(f));
    expect(files.length).toBeGreaterThanOrEqual(1);
    for (const f of files) {
      const v = Number(f.slice(1, f.indexOf('.')));
      const { actions, error } = migrateAiActions(JSON.parse(readFileSync(path.join(DIR, f), 'utf8')) as unknown[], v);
      expect(error).toBeNull();
      for (const a of actions) expect(aiActionSchema.safeParse(a).success, `${f} : ${JSON.stringify(a)}`).toBe(true);
    }
  });

  it('refuse un contrat plus récent que l’application et le signale dans la proposition', () => {
    expect(migrateAiActions([{ type: 'releaseAi' }], AI_ACTIONS_VERSION + 1).error).toMatch(/plus récent/);
    const p = buildProposal({ prompt: 'x', provider: 'openrouter', model: 'm', understanding: '', notices: [], rawActions: [{ type: 'releaseAi' }], ctx: ctx(), contractVersion: AI_ACTIONS_VERSION + 1 });
    expect(p.actions).toEqual([]);
    expect(p.notices.join(' ')).toMatch(/mettez l’application à jour/);
    expect(p.contractVersion).toBe(AI_ACTIONS_VERSION);
  });
});

/** Small seeded PRNG: the property test is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe('propriétés de validateActions (actions aléatoires)', () => {
  const samples = JSON.parse(readFileSync(path.join(DIR, `v${AI_ACTIONS_VERSION}.samples.json`), 'utf8')) as Record<string, unknown>[];
  const junk: unknown[] = [null, 0, -1, 1e9, NaN, '', 'x'.repeat(500), true, [], {}, { type: 'dmx', channel: 1 }, '#ZZZZZZ', [1, 2], { all: 'oui' }];

  it('ne lève jamais, rejette ce qui ne respecte pas le schéma, n’accepte que des actions valides', () => {
    const rand = rng(42);
    const pick = <T>(a: readonly T[]) => a[Math.floor(rand() * a.length)]!;
    const mutate = (v: unknown, depth = 0): unknown => {
      if (rand() < 0.15 || depth > 3) return pick(junk);
      if (Array.isArray(v)) return v.map((x) => mutate(x, depth + 1));
      if (v && typeof v === 'object') {
        const o: Record<string, unknown> = {};
        for (const [k, x] of Object.entries(v)) if (rand() > 0.1) o[k] = k === 'type' && rand() < 0.8 ? x : mutate(x, depth + 1);
        return o;
      }
      return rand() < 0.5 ? v : pick(junk);
    };
    let rejected = 0;
    for (let i = 0; i < 2000; i++) {
      const raw = mutate(structuredClone(pick(samples)));
      const [r] = validateActions([raw], ctx());
      const schemaOk = aiActionSchema.safeParse(raw).success;
      if (!schemaOk) {
        expect(r!.status).toBe('rejected');
        rejected++;
      }
      if (r!.status !== 'rejected') expect(r!.action).not.toBeNull();
    }
    expect(rejected).toBeGreaterThan(100); // the generator does produce invalid actions
  });

  it('une action de type inconnu est rejetée comme commande inconnue, jamais exécutée', () => {
    const [r] = validateActions([{ type: 'sendDmx', universe: 1, data: [255] }], ctx());
    expect(r).toMatchObject({ status: 'rejected', action: null });
    expect(r!.summary).toMatch(/inconnue/);
  });
});
