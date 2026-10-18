import { vi } from 'vitest';
import { analyzeAudio } from '../../src/core/music/analyze';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { adjustSection, compileShow, escalation, parseIntent, planLocally, rigInfo } from '../../src/core/music/songToShow';
import { effectFlashViolation } from '../../src/core/safety/flashGuard';
import { ProjectIndex } from '../../src/core/engine/resolve';
import { profileSchema, type Effect, type Fixture, type SongAnalysis } from '../../src/core/model/schemas';
import * as openrouter from '../../src/core/ai/providers/openrouter';
import { defaultSettings } from '../../src/core/settings/settings';
import { demoSong } from '../music-synth';
import { demoProject, makeService } from '../helpers';

vi.mock('../../src/core/ai/providers/openrouter', async (orig) => {
  const mod = await orig<typeof import('../../src/core/ai/providers/openrouter')>();
  return { ...mod, listOpenRouterModels: vi.fn(async () => []), planShowWithOpenRouter: vi.fn(), planSectionWithOpenRouter: vi.fn() };
});

let analysis: SongAnalysis;
const song = demoSong(124);
beforeAll(async () => { analysis = await analyzeAudio(song.samples, song.sr); });

const HASH = 'a'.repeat(64);

async function setup() {
  const { svc, secrets } = makeService();
  await svc.init();
  await svc.execute({ type: 'project.new', name: 'S2S' });
  await svc.execute({ type: 'fixture.add', profileId: 'demo-par-rgbw', mode: '6ch DRGBW+Strobe', universe: 1, address: null, count: 4, namePrefix: 'PAR', tags: [] });
  await svc.execute({ type: 'fixture.add', profileId: 'demo-spot', mode: '13ch étendu', universe: 1, address: 101, count: 2, namePrefix: 'Lyre', tags: [] });
  const { id } = await svc.execute({ type: 'music.addTrack', name: 'Démo', hash: HASH, analysis });
  return { svc, secrets, id };
}

describe('Song-to-Show', () => {
  it('lit l’intention en français', () => {
    const i = parseIntent('Concert pop, sobre sur les couplets, explosion sur les refrains, pas de strobe, en violet');
    expect(i).toMatchObject({ verseShift: -1, peakShift: 1, strobe: 'forbid', colors: ['#8B00FF'] });
    expect(parseIntent('ambiance froide sans mouvement')).toMatchObject({ warmth: 'cold', noMovement: true });
  });

  it('enregistre le son importé sur la machine et le restitue', async () => {
    const { svc } = await setup();
    const data = new Uint8Array([1, 2, 3, 4]);
    const hash = createHash('sha256').update(data).digest('hex');
    expect(await svc.execute({ type: 'music.loadAudio', hash })).toBeNull();
    await svc.execute({ type: 'music.storeAudio', hash, data });
    expect(Array.from((await svc.execute({ type: 'music.loadAudio', hash }))!)).toEqual([1, 2, 3, 4]);
    await expect(svc.execute({ type: 'music.storeAudio', hash: HASH, data })).rejects.toThrow(/Empreinte/);
  });

  it('génère un show calé sur la structure, conforme à l’intention et sûr', async () => {
    const { svc, id } = await setup();
    expect(await svc.execute({ type: 'music.addTrack', name: 'Démo', hash: HASH, analysis })).toEqual({ id, cached: true });
    const t0 = performance.now();
    const r = await svc.execute({ type: 'music.generate', trackId: id, intent: 'concert pop, sobre sur les couplets, explosion sur les refrains, pas de strobe', nextVariant: false });
    expect(performance.now() - t0).toBeLessThan(30_000);
    expect(r.provider).toBe('local');
    const p = svc.getProject();
    const track = p.music.tracks[0]!;
    const plan = track.plan!;
    const by = (label: string) => plan.sections.filter((_, i) => analysis.sections[i]!.label === label);
    const verse = by('verse')[0]!, chorus = by('chorus')[0]!;
    expect(chorus.energy - verse.energy).toBeGreaterThanOrEqual(2);
    expect(plan.sections.every((s) => s.effect !== 'strobe')).toBe(true);
    // Repeats of the same music share their palette.
    expect(by('chorus')[1]!.palette).toEqual(chorus.palette);

    const tl = p.timelines.find((x) => x.id === track.created.timelineId)!;
    expect(tl.duration).toBeGreaterThanOrEqual(Math.floor(analysis.duration));
    const sceneEvents = tl.events.filter((e) => e.kind === 'scene' && e.lane === 0);
    expect(sceneEvents.map((e) => e.start)).toEqual(analysis.sections.map((s) => s.start));
    // Section starts sit on analysed downbeats (± 50 ms), except the song start.
    for (const e of sceneEvents.slice(1)) expect(analysis.downbeats.some((d) => Math.abs(d - e.start) < 0.05)).toBe(true);
    const generated = p.effects.filter((e) => track.created.effectIds.includes(e.id));
    expect(generated.length).toBeGreaterThan(0);
    for (const e of generated) expect(e.params).toMatchObject({ bpmSync: true, barSync: true });
    expect(generated.some((e) => e.type === 'panTilt')).toBe(true);

    // Flash guard: every generated effect is safe on its section's look.
    const index = new ProjectIndex(p);
    for (const e of tl.events.filter((x) => x.kind === 'effect')) {
      const def = p.effects.find((x) => x.id === e.refId)!;
      const scene = p.scenes.find((s) => tl.events.some((x) => x.kind === 'scene' && x.start === e.start && x.refId === s.id))!;
      expect(effectFlashViolation(index, scene.values, def, analysis.bpm, 10).violation).toBe(false);
    }

    // Playback: in the chorus the rig is brighter than in the verse.
    const level = async (t: number) => {
      svc.engine.timelinePlay(tl.id);
      svc.engine.timelineSeek(t);
      svc.engine.tick(25);
      const v = svc.engine.values;
      return Object.values(v).reduce((s, x) => s + (x.dimmer ?? 0), 0);
    };
    const verseSec = analysis.sections.find((s) => s.label === 'verse')!;
    const chorusSec = analysis.sections.find((s) => s.label === 'chorus')!;
    expect(await level(chorusSec.start + 4)).toBeGreaterThan(await level(verseSec.start + 4));
    await svc.dispose();
  });

  it('retouche, verrouillage, variante et suppression', async () => {
    const { svc, id } = await setup();
    await svc.execute({ type: 'music.generate', trackId: id, intent: 'ambiance froide', nextVariant: false });
    const chorusIdx = analysis.sections.findIndex((s) => s.label === 'chorus');
    await svc.execute({ type: 'music.regenerateSection', trackId: id, index: chorusIdx, instruction: 'plus chaud' });
    let plan = svc.getProject().music.tracks[0]!.plan!;
    expect(plan.sections[chorusIdx]!.palette[0]).toBe('#FFB000');
    expect(plan.sections[chorusIdx]!.note).toBe('plus chaud');
    await svc.execute({ type: 'music.setSection', trackId: id, index: chorusIdx, locked: true });
    const locked = svc.getProject().music.tracks[0]!.plan!.sections[chorusIdx]!;
    await svc.execute({ type: 'music.generate', trackId: id, intent: 'ambiance froide', nextVariant: true });
    plan = svc.getProject().music.tracks[0]!.plan!;
    expect(plan.variant).toBe(1);
    expect(plan.sections[chorusIdx]).toEqual(locked);
    // Regeneration replaces, never accumulates.
    const p = svc.getProject();
    expect(p.timelines).toHaveLength(1);
    expect(p.scenes.length).toBe(p.music.tracks[0]!.created.sceneIds.length);
    await svc.execute({ type: 'music.setSection', trackId: id, index: 0, label: 'verse' });
    expect(svc.getProject().music.tracks[0]!.analysis.sections[0]!.label).toBe('verse');
    await svc.execute({ type: 'music.removeTrack', id });
    expect(svc.getProject()).toMatchObject({ scenes: [], effects: [], timelines: [], music: { tracks: [] } });
    await svc.dispose();
  });

  it('OpenRouter : plan validé, puis repli local si le fournisseur échoue', async () => {
    const { svc, secrets, id } = await setup();
    secrets.set('openrouter-api-key', 'sk-or-v1-test');
    await svc.execute({ type: 'settings.update', settings: { ...defaultSettings(), ai: { ...defaultSettings().ai, provider: 'openrouter' } } });
    const plan = vi.mocked(openrouter.planShowWithOpenRouter);
    plan.mockResolvedValueOnce({
      summary: 'Show test', model: 'test/model', notices: [],
      sections: analysis.sections.map((_, i) => ({ index: i, energy: 3, palette: ['#00FF00'], layers: { wash: true, moving: true, bars: false }, movement: 'slow' as const, effect: 'pulse' as const, beam: 'gobo' as const, effectBeats: 2, accents: false, groups: [], focus: null, extras: [], locked: false, note: '', why: '' })),
    });
    const ok = await svc.execute({ type: 'music.generate', trackId: id, intent: 'tout en vert', nextVariant: false });
    expect(ok.provider).toBe('openrouter');
    expect(svc.getProject().music.tracks[0]!.plan!.sections[0]!.palette).toEqual(['#00FF00']);
    const structure = plan.mock.calls[0]![1];
    expect(structure).toContain('BPM');
    expect(structure).not.toMatch(/sample|audio data/i);
    // Same request again: answered from the cache, no new call, same plan.
    const before = svc.getProject().music.tracks[0]!.plan;
    const again = await svc.execute({ type: 'music.generate', trackId: id, intent: 'tout en vert', nextVariant: false });
    expect(plan).toHaveBeenCalledTimes(1);
    expect(again).toMatchObject({ provider: 'openrouter' });
    expect(again.notices.join(' ')).toMatch(/cache/);
    expect(svc.getProject().music.tracks[0]!.plan).toEqual(before);
    // A new variant is a new request, and it tells the model which variant it is.
    plan.mockRejectedValueOnce(new Error('réseau indisponible'));
    const fb = await svc.execute({ type: 'music.generate', trackId: id, intent: 'tout en vert', nextVariant: true });
    expect(plan).toHaveBeenCalledTimes(2);
    expect(plan.mock.calls[1]![1]).toMatch(/Variant 1/);
    expect(fb.provider).toBe('local');
    expect(fb.notices.join(' ')).toMatch(/OpenRouter indisponible/);
    await svc.dispose();
  });

  it('OpenRouter : une section régénérée par le LLM avec ses voisines et la consigne, repli local sinon', async () => {
    const { svc, secrets, id } = await setup();
    await svc.execute({ type: 'music.generate', trackId: id, intent: 'concert pop', nextVariant: false });
    secrets.set('openrouter-api-key', 'sk-or-v1-test');
    await svc.execute({ type: 'settings.update', settings: { ...defaultSettings(), ai: { ...defaultSettings().ai, provider: 'openrouter' } } });
    const ci = analysis.sections.findIndex((s) => s.label === 'chorus');
    await svc.execute({ type: 'music.setSection', trackId: id, index: ci, locked: true });
    const before = svc.getProject().music.tracks[0]!.plan!;
    const section = vi.mocked(openrouter.planSectionWithOpenRouter);
    section.mockResolvedValueOnce({ model: 'test/model', notices: [], section: { ...before.sections[ci]!, palette: ['#FF0000'], locked: false, note: 'en rouge', why: 'Rouge demandé' } });
    await svc.execute({ type: 'music.regenerateSection', trackId: id, index: ci, instruction: 'en rouge' });
    const req = section.mock.calls[0]![0];
    expect(req).toMatchObject({ index: ci, instruction: 'en rouge', current: before.sections[ci], prev: before.sections[ci - 1], next: before.sections[ci + 1] });
    expect(req.structure).toContain('BPM');
    const after = svc.getProject().music.tracks[0]!.plan!;
    expect(after.sections[ci]).toMatchObject({ palette: ['#FF0000'], locked: true, why: 'Rouge demandé' });
    expect(after.sections.filter((_, i) => i !== ci)).toEqual(before.sections.filter((_, i) => i !== ci));
    // Provider down: the local rules apply the instruction.
    section.mockRejectedValueOnce(new Error('réseau indisponible'));
    const fb = await svc.execute({ type: 'music.regenerateSection', trackId: id, index: ci, instruction: 'plus chaud' });
    expect(fb.notices.join(' ')).toMatch(/OpenRouter indisponible/);
    expect(svc.getProject().music.tracks[0]!.plan!.sections[ci]).toMatchObject({ palette: ['#FFB000'], note: 'plus chaud' });
    await svc.dispose();
  });

  it('modification à la main d’une section : seuls les champs donnés changent, le show est recompilé', async () => {
    const { svc, id } = await setup();
    await svc.execute({ type: 'music.generate', trackId: id, intent: '', nextVariant: false });
    const before = svc.getProject().music.tracks[0]!.plan!;
    await svc.execute({ type: 'music.updateSection', trackId: id, index: 0, patch: { energy: 5, palette: ['#FF0000'], locked: true } });
    const p = svc.getProject();
    const after = p.music.tracks[0]!.plan!.sections[0]!;
    expect(after).toMatchObject({ energy: 5, palette: ['#FF0000'], locked: true, effect: before.sections[0]!.effect, movement: before.sections[0]!.movement });
    expect(after.why).toMatch(/^Modifié à la main/);
    const scene = p.scenes.find((s) => s.id === p.music.tracks[0]!.created.sceneIds[0])!;
    expect(Object.values(scene.values).some((v) => v.dimmer === 1 && v.red === 1)).toBe(true);
    await expect(svc.execute({ type: 'music.updateSection', trackId: id, index: 99, patch: {} })).rejects.toThrow(/introuvable/);
    await svc.dispose();
  });

  it('explique chaque look : énergie mesurée, répétition, retouche', () => {
    const rig = { wash: 4, moving: 2, bars: 0, allowStrobe: false };
    const plan = planLocally(analysis, 'sobre sur les couplets', rig);
    const [c1, c2] = analysis.sections.map((s, i) => [s, i] as const).filter(([s]) => s.label === 'chorus').map(([, i]) => i);
    const s = analysis.sections[c2!]!;
    expect(plan.sections[c2!]!.why).toContain(`Refrain, énergie mesurée ${s.energy.toFixed(2).replace('.', ',')} → niveau ${plan.sections[c2!]!.energy}/5`);
    expect(plan.sections[c2!]!.why).toContain(`même musique que la section ${c1! + 1} (refrain) → même palette`);
    const verse = analysis.sections.findIndex((x) => x.label === 'verse');
    expect(plan.sections[verse]!.why).toContain('couplets sobres demandés');
    expect(adjustSection(plan.sections[verse]!, 'en rouge', rig).why).toMatch(/^Retouche « en rouge » ; Couplet/);
  });

  it('OpenRouter : un plan partiellement invalide est réparé section par section', async () => {
    const real = await vi.importActual<typeof openrouter>('../../src/core/ai/providers/openrouter');
    const fallback = planLocally(analysis, '', { wash: 4, moving: 2, bars: 0, allowStrobe: true }).sections;
    const answer = { summary: 'Show', sections: [
      { index: 0, energy: 9, palette: ['rouge', '#FF0000'], layers: { wash: true, moving: true, bars: false }, movement: 'slow', effect: 'strobe', beam: 'prism', effectBeats: 40, accents: false },
      { index: 1, energy: 2, palette: [], movement: 'tourbillon', effect: 'wave', effectBeats: 'x' },
    ] };
    const fetchImpl = (async () => new Response(JSON.stringify({ model: 'm/x', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answer) } }] }), { status: 200 })) as unknown as typeof fetch;
    const r = await real.planShowWithOpenRouter('concert pop', 'structure', { apiKey: 'k', model: 'm/x', effort: 'low', timeoutMs: 1000, fetchImpl }, fallback);
    expect(r.sections).toHaveLength(fallback.length);
    // Clamped, invalid colour dropped, strobe not asked for → chase.
    expect(r.sections[0]).toMatchObject({ index: 0, energy: 5, palette: ['#FF0000'], effect: 'chase', beam: 'prism', effectBeats: 16 });
    // Invalid / missing fields come from the local plan.
    expect(r.sections[1]).toMatchObject({ index: 1, energy: 2, effect: 'wave', palette: fallback[1]!.palette, movement: fallback[1]!.movement, layers: fallback[1]!.layers, beam: fallback[1]!.beam });
    expect(r.sections.slice(2)).toEqual(fallback.slice(2));
    const n = r.notices.join(' ');
    expect(n).toMatch(/incomplet/);
    expect(n).toMatch(/section 1 \(strobe non demandé → chase\) ; 2 \(palette, layers, movement, beam, effectBeats, accents\)/);
    const empty = (async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"summary":"x","sections":[]}' } }] }), { status: 200 })) as unknown as typeof fetch;
    await expect(real.planShowWithOpenRouter('', 's', { apiKey: 'k', model: 'm/x', effort: 'low', timeoutMs: 1000, fetchImpl: empty }, fallback)).rejects.toThrow(/non conforme/);
  });

  it('faisceau des lyres : gobo/prisme sur les temps forts, retouche « prisme »', async () => {
    const { svc, id } = await setup();
    await svc.execute({ type: 'music.generate', trackId: id, intent: 'explosion sur les refrains', nextVariant: false });
    const p = svc.getProject();
    const track = p.music.tracks[0]!;
    const ci = analysis.sections.findIndex((s) => s.label === 'chorus');
    const chorus = track.plan!.sections[ci]!;
    expect(['gobo', 'prism']).toContain(chorus.beam);
    const scene = p.scenes.find((s) => s.id === track.created.sceneIds[ci])!;
    const lyre = p.patch.find((f) => f.profileId === 'demo-spot')!;
    // Gobo slots sit in 10..49 / 255 on the demo spot (0..9 = open).
    expect(scene.values[lyre.id]!.gobo).toBeGreaterThan(9 / 255);
    if (chorus.beam === 'prism') expect(scene.values[lyre.id]!.prism).toBeGreaterThan(0.5);
    const rig = rigInfo(new ProjectIndex(p), false);
    expect(adjustSection(chorus, 'avec prisme', rig).beam).toBe('prism');
    expect(adjustSection(chorus, 'sans gobo', rig).beam).toBe('open');
    expect(adjustSection(chorus, 'plus calme, flou', rig)).toMatchObject({ beam: 'frost', energy: chorus.energy - 1 });
    await svc.dispose();
  });

  it('modules multi-têtes : l’anneau s’allume et prend une autre couleur', () => {
    const mhl = profileSchema.parse(JSON.parse(readFileSync(path.resolve('tests/fixtures/profiles/beamz-mhl1940.json'), 'utf8')));
    const p = demoProject();
    p.profiles = [mhl];
    const lyre: Fixture = { id: 'm', name: 'Lyre 1', profileId: mhl.id, mode: '26Channels', universe: 1, address: 200, tags: [], position: { x: 0, y: 0 }, rotation: 0, height: 4, notes: '' };
    p.patch = [lyre];
    const index = new ProjectIndex(p);
    const plan = planLocally(analysis, 'en rouge et bleu', rigInfo(index, false));
    const c = compileShow(index, 'T', analysis, plan, { maxStrobeHz: 10, allowStrobe: false });
    const ci = analysis.sections.findIndex((s) => s.label === 'chorus');
    const v = c.scenes[ci]!.values.m!;
    expect(v['dimmer#1']).toBeGreaterThan(0);
    expect(v['dimmer#1']).toBe(v.dimmer);
    // Ring (cell 1) takes the second palette colour (red or blue), the main head the first one.
    const second = plan.sections[ci]!.palette[1]!;
    expect(plan.sections[ci]!.palette[0]).not.toBe(second);
    expect(v).toMatchObject(second === '#FF0000' ? { 'red#1': 1, 'blue#1': 0 } : { 'red#1': 0, 'blue#1': 1 });
    const accent = c.scenes.find((s) => s.name.endsWith('accent'));
    if (accent) expect(accent.values.m!['dimmer#1']).toBe(1);
  });

  it('montées et silences : rampe d’intensité avant le temps fort, noir pendant les blancs', () => {
    const p = demoProject();
    p.patch = p.patch.slice(0, 4);
    const index = new ProjectIndex(p);
    const risers = analysis.events.filter((e) => e.kind === 'riser');
    expect(risers.length).toBeGreaterThan(0);
    const ci = analysis.sections.findIndex((s, i) => i > 0 && s.label === 'chorus');
    const gap = { t: analysis.sections[ci]!.start + 2, kind: 'silence' as const, duration: 1 };
    const a = { ...analysis, events: [...analysis.events, gap].sort((x, y) => x.t - y.t) };
    const plan = planLocally(a, '', rigInfo(index, false));
    const c = compileShow(index, 'T', a, plan, { maxStrobeHz: 10, allowStrobe: false });
    const ramps = c.timeline.events.filter((e) => e.label === 'Montée');
    expect(ramps).toHaveLength(risers.length);
    for (const r of ramps) {
      expect(r.fade).toBeCloseTo(r.duration);
      // Ends on the next section, or on the blackout one beat before it (breath before the peak).
      expect(analysis.sections.some((s) => [0, 60 / analysis.bpm].some((b) => Math.abs(s.start - b - (r.start + r.duration)) < 1e-6))).toBe(true);
      const scene = c.scenes.find((s) => s.id === r.refId)!;
      for (const attrs of Object.values(scene.values)) for (const k of Object.keys(attrs)) expect(k.split('#')[0]).toBe('dimmer');
    }
    const scenesAt = (t: number) => c.timeline.events.filter((e) => e.kind === 'scene' && t >= e.start && t < e.start + e.duration);
    expect(scenesAt(gap.t + 0.5)).toHaveLength(0);
    const after = scenesAt(gap.t + 1.01).find((e) => e.lane === 0)!;
    expect(after).toMatchObject({ start: gap.t + 1, fade: 0 });
    expect(scenesAt(gap.t - 0.5).some((e) => e.lane === 0)).toBe(true);
  });

  it('dramaturgie : refrains en escalade, noir avant le drop, effets symétriques dans l’ordre de la scène, phrases de 8 mesures', () => {
    const p = demoProject();
    p.patch = p.patch.slice(0, 4).map((f, k) => ({ ...f, position: { x: 3 - 2 * k, y: 0 } })); // patch order = right to left
    const index = new ProjectIndex(p);
    const beat = 60 / analysis.bpm;
    const choruses = analysis.sections.map((s, i) => [s, i] as const).filter(([s]) => s.label === 'chorus').map(([, i]) => i);
    expect(choruses.length).toBeGreaterThan(1);
    expect(escalation(analysis, choruses[0]!)).toBe(0);
    expect(escalation(analysis, choruses.at(-1)!)).toBe(1);
    const plain = planLocally(analysis, '', rigInfo(index, false));
    expect(plain.sections[choruses.at(-1)!]!.energy).toBeGreaterThanOrEqual(plain.sections[choruses[0]!]!.energy);
    expect(plain.sections[choruses.at(-1)!]!.why).toMatch(/plus fort que le précédent/);

    const di = choruses[0]!;
    const a = { ...analysis, sections: analysis.sections.map((s, i) => (i === di ? { ...s, label: 'drop' as const } : s)) };
    const c = compileShow(index, 'T', a, planLocally(a, '', rigInfo(index, false)), { maxStrobeHz: 10, allowStrobe: false });
    const drop = a.sections[di]!;
    const scenesAt = (t: number) => c.timeline.events.filter((e) => e.kind === 'scene' && t >= e.start && t < e.start + e.duration);
    expect(scenesAt(drop.start - beat / 2)).toHaveLength(0);
    expect(scenesAt(drop.start + 0.01).find((e) => e.lane === 0)).toMatchObject({ start: drop.start, fade: 0 });
    expect(scenesAt(drop.start - 1.5 * beat).some((e) => e.lane === 0)).toBe(true);

    // Effects run stage left → right, mirrored, and alternate with a sweep every 8 bars on the downbeats.
    const xs = (e: Effect) => e.targets.fixtureIds.map((id) => p.patch.find((f) => f.id === id)!.position.x);
    for (const e of c.effects) expect(xs(e)).toEqual([...xs(e)].sort((u, v) => u - v));
    // A 16-bar verse (verse + first chorus merged): two phrases, the second one runs the B variant from bar 9.
    const [s0, s1, s2, ...rest] = analysis.sections;
    const m = { ...analysis, sections: [s0!, { ...s1!, end: s2!.end }, ...rest] };
    const cm = compileShow(index, 'T', m, planLocally(m, '', rigInfo(index, false)), { maxStrobeHz: 10, allowStrobe: false });
    const sec = m.sections[1]!;
    const inSec = cm.timeline.events.filter((e) => e.kind === 'effect' && e.start >= sec.start && e.start < sec.end).map((e) => ({ ...e, def: cm.effects.find((x) => x.id === e.refId)! }));
    const mains = inSec.filter((e) => e.def.params.direction === 'pingpong' || (e.def.name.endsWith(' B') && e.def.params.direction === 'forward'));
    expect(mains.map((e) => e.def.name.endsWith(' B'))).toEqual([false, true]);
    const bar9 = analysis.downbeats.filter((d) => d > sec.start + 0.05)[7]!;
    expect(mains[1]!.start).toBe(bar9);
    expect(mains[0]!.start + mains[0]!.duration).toBeCloseTo(bar9);
  });
});
