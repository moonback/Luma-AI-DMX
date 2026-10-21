import { analyzeAudio } from '../../src/core/music/analyze';
import { adjustSection, compileShow, planLocally, rigInfo } from '../../src/core/music/songToShow';
import { aimAt, groupsBySection, markerPoint } from '../../src/core/music/showRig';
import { computeEffect } from '../../src/core/engine/effects';
import { ProjectIndex } from '../../src/core/engine/resolve';
import { beamDirection, type Vec3 } from '../../src/core/visualizer/beam';
import { mountOf, tiltDegrees } from '../../src/core/visualizer/model';
import { effectParamsSchema, profileSchema, type Effect, type Project, type SongAnalysis } from '../../src/core/model/schemas';
import type { ResolvedFixture } from '../../src/core/fixtures/profiles';
import { demoSong, edmSong, synthSong } from '../music-synth';
import { demoProject, makeEngine } from '../helpers';
import { planSectionWithOpenRouter, planShowWithOpenRouter } from '../../src/core/ai/providers/openrouter';

let pop: SongAnalysis, edm: SongAnalysis, sung: SongAnalysis;
const base = { kick: false, snare: false, hats: false, bass: false, chords: [57, 53, 48, 55], pad: 0, bright: false };
const sungSong = synthSong({ bpm: 120, sections: [
  { ...base, label: 'intro', bars: 8, hats: true, pad: 0.6 },
  { ...base, label: 'verse', bars: 8, kick: true, bass: true, pad: 0.8, voice: 1 },
  { ...base, label: 'chorus', bars: 8, kick: true, snare: true, hats: true, bass: true, pad: 1, bright: true, gain: 1.3 },
  { ...base, label: 'verse', bars: 8, kick: true, bass: true, pad: 0.8, voice: 1 },
  { ...base, label: 'outro', bars: 4, pad: 0.5, gain: 0.6 },
] });
beforeAll(async () => {
  const [a, b] = [demoSong(124), edmSong(128)];
  [pop, edm, sung] = await Promise.all([analyzeAudio(a.samples, a.sr), analyzeAudio(b.samples, b.sr), analyzeAudio(sungSong.samples, sungSong.sr)]);
});

const OPTS = { maxStrobeHz: 10, allowStrobe: false };
const SINGER = { id: 'm-singer', name: 'Chanteur', x: 1, y: 2, height: 1.7 };
const idx = (label: string, a = pop) => a.sections.findIndex((s) => s.label === label);

/** Angle in degrees between the fixture's beam for the given pan/tilt values and the direction to `target`. */
function aimError(rf: ResolvedFixture, v: { pan?: number; tilt?: number }, target: Vec3): number {
  const f = rf.fixture, phys = rf.profile.physical;
  const b = beamDirection({ movable: true, rotation: f.rotation, mount: mountOf(f), mountTilt: f.mountTilt ?? 0, panDeg: ((v.pan ?? 0.5) - 0.5) * phys.panRange, tiltDeg: tiltDegrees(phys, v.tilt ?? 0.5) });
  const d = { x: target.x - f.position.x, y: target.y - f.height, z: target.z + f.position.y };
  const len = Math.hypot(d.x, d.y, d.z);
  return (Math.acos(Math.min(1, (b.x * d.x + b.y * d.y + b.z * d.z) / len)) * 180) / Math.PI;
}

/** Sum of every dimmer while the generated timeline plays at `t` (optionally with band levels). */
function levelAt(p: Project, c: ReturnType<typeof compileShow>, t: number, audio: { bass: number; brightness: number } | null = null): number {
  const { engine } = makeEngine({ ...p, scenes: c.scenes, effects: c.effects, timelines: [c.timeline] });
  engine.audioBands = audio;
  engine.timelinePlay(c.timeline.id);
  engine.timelineSeek(t);
  engine.tick(25);
  return Object.values(engine.values).reduce((s, x) => s + (x.dimmer ?? 0), 0);
}

describe('Song-to-Show enrichi', () => {
  it('groupes du projet : « contres en couplet, faces au refrain »', () => {
    const p = demoProject();
    p.groups = [{ id: 'g-contres', name: 'Contres', color: '#22D3EE', fixtureIds: ['par1', 'par2'] }, { id: 'g-faces', name: 'Face', color: '#F59E0B', fixtureIds: ['rgbw'] }];
    const index = new ProjectIndex(p);
    const rig = rigInfo(index, false);
    expect(groupsBySection('contres en couplet et faces au refrain', rig.groups)).toEqual(new Map([['verse', ['g-contres']], ['chorus', ['g-faces']]]));
    const plan = planLocally(pop, 'contres en couplet, faces au refrain', rig);
    expect(plan.sections[idx('verse')]!.groups).toEqual(['g-contres']);
    expect(plan.sections[idx('chorus')]!.groups).toEqual(['g-faces']);
    expect(plan.sections[0]!.groups).toEqual([]);
    expect(plan.summary).toMatch(/couplet → Contres, refrain → Face/);
    const c = compileShow(index, 'T', pop, plan, OPTS);
    const verse = c.scenes[idx('verse')]!.values, chorus = c.scenes[idx('chorus')]!.values;
    expect(verse.par1!.dimmer).toBeGreaterThan(0);
    expect(verse.rgbw!.dimmer).toBe(0);
    expect(chorus.rgbw!.dimmer).toBeGreaterThan(0);
    expect(chorus.par1!.dimmer).toBe(0);
    // Effects only drive the lit groups.
    const verseStart = pop.sections[idx('verse')]!.start;
    for (const e of c.timeline.events.filter((x) => x.kind === 'effect' && x.start === verseStart)) {
      for (const id of c.effects.find((x) => x.id === e.refId)!.targets.fixtureIds) expect(['par1', 'par2']).toContain(id);
    }
    expect(adjustSection(plan.sections[0]!, 'avec les faces', rig).groups).toEqual(['g-faces']);
    expect(adjustSection(plan.sections[idx('verse')]!, 'tous les projecteurs', rig).groups).toEqual([]);
  });

  it('repères de scène : douche sur le chanteur en couplet, balayage public au refrain', () => {
    const p = demoProject();
    p.visualizer.markers = [SINGER];
    const index = new ProjectIndex(p);
    const plan = planLocally(pop, 'explosion sur les refrains', rigInfo(index, false));
    const verse = plan.sections[idx('verse')]!, chorus = plan.sections[idx('chorus')]!;
    expect(verse).toMatchObject({ focus: 'm-singer', movement: 'none', layers: { moving: true } });
    expect(chorus.focus).toBe('audience');
    const c = compileShow(index, 'T', pop, plan, OPTS);
    const v = c.scenes[idx('verse')]!.values;
    for (const id of ['spot1', 'spot2']) expect(aimError(index.fixtures.get(id)!, v[id]!, markerPoint(SINGER))).toBeLessThan(2);
    const at = (i: number) => c.timeline.events.filter((e) => e.kind === 'effect' && e.start === pop.sections[i]!.start).map((e) => c.effects.find((x) => x.id === e.refId)!);
    expect(at(idx('verse')).some((e) => ['panTilt', 'fan', 'randomMove'].includes(e.type))).toBe(false);
    const sweep = at(idx('chorus')).find((e) => e.type === 'panTilt');
    if (sweep) expect(sweep.params.shape).toBe('pan');
    // The audience is in front of the stage lip: the beams point towards it and downwards.
    const spot = index.fixtures.get('spot1')!;
    const cv = c.scenes[idx('chorus')]!.values.spot1!;
    const dir = beamDirection({ movable: true, rotation: 0, mount: 'hanging', mountTilt: 0, panDeg: (cv.pan! - 0.5) * 540, tiltDeg: tiltDegrees(spot.profile.physical, cv.tilt!) });
    expect(dir.z).toBeGreaterThan(0.3);
    expect(dir.y).toBeLessThan(0);
  });

  it('OpenRouter : groupes et repères nommés par le modèle, enregistrés par identifiant', async () => {
    const fallback = planLocally(pop, '', { wash: 3, moving: 2, bars: 0, allowStrobe: false }).sections;
    const answer = { summary: 'Show', sections: [
      { ...fallback[0], groups: ['contres', 'Inconnu'], focus: 'Chanteur', extras: ['ramp', 'blinder'] },
      { ...fallback[1], groups: undefined, focus: 'audience', extras: undefined },
    ] };
    const fetchImpl = (async () => new Response(JSON.stringify({ model: 'm/x', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answer) } }] }), { status: 200 })) as unknown as typeof fetch;
    const refs = { groups: [{ id: 'g-contres', name: 'Contres' }], markers: [{ id: 'm-singer', name: 'Chanteur' }] };
    const r = await planShowWithOpenRouter('', 'structure', { apiKey: 'k', model: 'm/x', effort: 'low', timeoutMs: 1000, fetchImpl }, fallback, refs);
    expect(r.sections[0]).toMatchObject({ groups: ['g-contres'], focus: 'm-singer', extras: ['ramp', 'blinder'] });
    expect(r.sections[1]).toMatchObject({ groups: [], focus: 'audience', extras: fallback[1]!.extras });
    // Fields a model leaves out are not reported as repaired.
    expect(r.notices.join(' ')).not.toMatch(/groups|focus|extras/);
  });

  it('OpenRouter : une section refaite avec ses voisines, noms en clair pour le modèle', async () => {
    const fallback = planLocally(pop, '', { wash: 3, moving: 2, bars: 0, allowStrobe: true }).sections;
    const current = { ...fallback[1]!, groups: ['g-contres'], focus: 'm-singer', locked: true };
    let sent = '';
    const answer = { ...fallback[1], effect: 'strobe', groups: ['Contres'], focus: 'Chanteur', why: 'Plus de punch demandé' };
    const fetchImpl = (async (_: string, init: { body: string }) => {
      sent = (JSON.parse(init.body) as { messages: { content: string }[] }).messages.map((m) => m.content).join('\n');
      return new Response(JSON.stringify({ model: 'm/x', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answer) } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const refs = { groups: [{ id: 'g-contres', name: 'Contres' }], markers: [{ id: 'm-singer', name: 'Chanteur' }] };
    const r = await planSectionWithOpenRouter({ intent: 'concert pop', instruction: 'plus de punch', structure: 'S', index: 1, current, prev: fallback[0], next: fallback[2] }, { apiKey: 'k', model: 'm/x', effort: 'low', timeoutMs: 1000, fetchImpl }, fallback[1]!, refs);
    expect(sent).toContain('Instruction for section 1: plus de punch');
    expect(sent).toMatch(/Section 1 now: .*"groups":\["Contres"\].*"focus":"Chanteur"/);
    expect(sent).toContain('Previous section: {');
    expect(r.section).toMatchObject({ groups: ['g-contres'], focus: 'm-singer', effect: 'chase', locked: true, note: 'plus de punch', why: 'Plus de punch demandé' });
    expect(r.notices.join(' ')).toMatch(/strobe non demandé/);
  });

  it('visée : pan/tilt calculés pour un point, accroché ou posé au sol', () => {
    const p = demoProject();
    p.patch.push({ ...p.patch[3]!, id: 'floor', name: 'Sol', height: 0.3, mount: 'floor', position: { x: -4, y: 6 }, rotation: 30, address: 60 });
    const index = new ProjectIndex(p);
    for (const target of [{ x: 0, y: 0, z: 0 }, { x: 3, y: 1.7, z: -2 }, { x: -5, y: 0, z: 4 }]) {
      for (const id of ['spot1', 'spot2']) expect(aimError(index.fixtures.get(id)!, aimAt(index.fixtures.get(id)!, target), target)).toBeLessThan(1);
    }
    const wall = { x: 0, y: 3, z: -8 };
    expect(aimError(index.fixtures.get('floor')!, aimAt(index.fixtures.get('floor')!, wall), wall)).toBeLessThan(1);
  });

  it('effets : éventail symétrique, suiveurs de bande neutres sans audio', () => {
    const p = demoProject();
    const index = new ProjectIndex(p);
    const heads = [index.fixtures.get('spot1')!, index.fixtures.get('spot2')!, { ...index.fixtures.get('spot1')!, fixture: { ...p.patch[3]!, id: 'spot3' } }];
    const fx = (type: Effect['type'], params: Record<string, unknown> = {}): Effect => ({ id: 'e', name: 'e', type, targets: { fixtureIds: [], groupIds: [] }, params: effectParamsSchema.parse(params), priority: 50, blend: 'override', duration: null, trigger: 'manual', origin: 'ai' });
    const fan = fx('fan', { amplitude: 0.4 });
    expect(Object.values(computeEffect(fan, 0, heads)).map((v) => v.pan)).toEqual([0.5, 0.5, 0.5]);
    const open = computeEffect(fan, 0.5, heads);
    expect(open.spot1!.pan).toBeCloseTo(0.3);
    expect(open.spot2!.pan).toBeCloseTo(0.5);
    expect(open.spot3!.pan).toBeCloseTo(0.7);
    const pars = [index.fixtures.get('par1')!];
    const bass = fx('bassFollow', { amplitude: 0.6 });
    expect(computeEffect(bass, 0, pars)).toEqual({});
    expect(computeEffect(bass, 0, pars, { bass: 0, brightness: 0 }).par1!.dimmer).toBeCloseTo(0.4);
    expect(computeEffect(bass, 0, pars, { bass: 1, brightness: 0 }).par1!.dimmer).toBe(1);
    const bright = fx('brightnessColor', { colors: ['#FF0000', '#0000FF'] });
    expect(computeEffect(bright, 0, pars)).toEqual({});
    expect(computeEffect(bright, 0, pars, { bass: 0, brightness: 0 }).par1).toMatchObject({ red: 1, blue: 0 });
    expect(computeEffect(bright, 0, pars, { bass: 0, brightness: 1 }).par1).toMatchObject({ red: 0, blue: 1 });
  });

  it('vocabulaire : ballyhoo, chase couleur, blinder sur le drop, zoom qui respire, fumée selon l’énergie', () => {
    const p = demoProject();
    p.profiles = [profileSchema.parse({ id: 'hazer', name: 'Hazer', manufacturer: 'Test', type: 'other', physical: { panRange: 0, tiltRange: 0, beamAngle: 10 }, modes: [{ name: '2ch', channels: [{ name: 'Fog', attribute: 'fog' }, { name: 'Fan', attribute: 'fan' }] }] })];
    p.patch.push({ ...p.patch[3]!, id: 'wash1', name: 'Wash 1', profileId: 'demo-wash', mode: '13ch', address: 120 });
    p.patch.push({ id: 'haze', name: 'Hazer', profileId: 'hazer', mode: '2ch', universe: 1, address: 100, tags: [], position: { x: 0, y: 7 }, rotation: 0, height: 0, notes: '' });
    const index = new ProjectIndex(p);
    const rig = rigInfo(index, false);
    expect(rig.wash + rig.moving + rig.bars).toBe(6);
    const moves = new Set([0, 1].flatMap((v) => planLocally(pop, 'explosion sur les refrains', rig, v).sections.map((s) => s.movement)));
    expect(moves.has('ballyhoo')).toBe(true);

    const plan = planLocally(edm, '', rig);
    const drop = idx('drop', edm);
    expect(plan.sections[drop]!.extras).toContain('blinder');
    const calm = plan.sections.findIndex((s) => s.extras.includes('breathe'));
    expect(calm).toBeGreaterThanOrEqual(0);
    plan.sections[0] = adjustSection(plan.sections[0]!, 'chase de couleurs', rig);
    const c = compileShow(index, 'T', edm, plan, OPTS);
    expect(c.timeline.events.some((e) => e.label === 'Blinder' && e.start === edm.sections[drop]!.start && e.lane === 2)).toBe(true);
    const fxAt = (i: number) => c.timeline.events.filter((e) => e.kind === 'effect' && e.start === edm.sections[i]!.start).map((e) => c.effects.find((x) => x.id === e.refId)!);
    // Only the heads with a zoom channel breathe (the demo wash has one, the demo spot does not).
    expect(fxAt(calm).filter((e) => e.type === 'wave').map((e) => [e.params.attribute, e.targets.fixtureIds])).toEqual([['zoom', ['wash1']]]);
    const chase = fxAt(0).find((e) => e.type === 'colorCycle')!;
    expect(chase.params.colors).toEqual(plan.sections[0]!.palette.length > 1 ? plan.sections[0]!.palette : [...plan.sections[0]!.palette, '#FFFFFF']);
    // Haze: more on the peaks, never an effect target, off on request.
    const fog = (i: number, cc = c) => cc.scenes[i]!.values.haze!.fog!;
    expect(fog(drop)).toBeGreaterThan(fog(0));
    expect(c.effects.every((e) => !e.targets.fixtureIds.includes('haze'))).toBe(true);
    const dry = compileShow(index, 'T', edm, { ...plan, intent: 'sans fumée' }, OPTS);
    expect(fog(drop, dry)).toBe(0);
  });

  it('rampes : un couplet long monte doucement au lieu d’un look figé', () => {
    const p = demoProject();
    const index = new ProjectIndex(p);
    const plan = planLocally(pop, '', rigInfo(index, false));
    const vi = idx('verse');
    expect(plan.sections[vi]!.extras).toContain('ramp');
    expect(plan.sections[idx('chorus')]!.extras).not.toContain('ramp');
    const c = compileShow(index, 'T', pop, plan, OPTS);
    const sec = pop.sections[vi]!;
    const rise = c.timeline.events.find((e) => e.label === 'Progression' && e.start === sec.start)!;
    expect(rise.fade).toBeCloseTo(sec.end - sec.start);
    expect(levelAt(p, c, sec.end - 0.5)).toBeGreaterThan(levelAt(p, c, sec.start + 2) * 1.3);
  });

  it('suiveurs de bande en lecture : le dimmer suit les basses du morceau joué', () => {
    const p = demoProject();
    const index = new ProjectIndex(p);
    const plan = planLocally(pop, 'les lumières suivent les basses', rigInfo(index, false));
    const ci = idx('chorus');
    expect(plan.sections[ci]!.extras).toContain('bassFollow');
    const c = compileShow(index, 'T', pop, plan, OPTS);
    expect(c.effects.some((e) => e.type === 'bassFollow' && e.blend === 'scale')).toBe(true);
    const t = pop.sections[ci]!.start + 3;
    const quiet = levelAt(p, c, t, { bass: 0, brightness: 0.5 }), loud = levelAt(p, c, t, { bass: 1, brightness: 0.5 });
    expect(loud).toBeGreaterThan(quiet * 1.5);
    // Without audio (stopped player) the look is left untouched.
    expect(levelAt(p, c, t)).toBeCloseTo(loud);
  });

  it('voix : détectée sur les couplets chantés, poursuite sur le chanteur seulement pendant le chant', () => {
    const vocals = sung.events.filter((e) => e.kind === 'vocal');
    const covered = (a: number, b: number) => vocals.reduce((d, v) => d + Math.max(0, Math.min(b, v.t + v.duration) - Math.max(a, v.t)), 0) / (b - a);
    const [, v1, ch, v2] = sungSong.boundaries.map((b) => b.start);
    expect(covered(v1!, ch!)).toBeGreaterThan(0.75);
    expect(covered(v2!, v2! + (ch! - v1!))).toBeGreaterThan(0.75);
    expect(covered(0, v1!)).toBe(0);
    expect(covered(ch!, v2!)).toBeLessThan(0.02);
    // Instrumental songs: no voice.
    expect(pop.events.some((e) => e.kind === 'vocal') || edm.events.some((e) => e.kind === 'vocal')).toBe(false);

    const p = demoProject();
    p.visualizer.markers = [SINGER];
    const index = new ProjectIndex(p);
    const plan = planLocally(sung, '', rigInfo(index, false));
    const c = compileShow(index, 'T', sung, plan, OPTS);
    const spots = c.timeline.events.filter((e) => e.label === 'Poursuite');
    expect(spots.map((e) => [e.start, e.duration, e.lane])).toEqual(vocals.map((v) => [v.t, v.duration, 3]));
    const spot = c.scenes.find((s) => s.id === spots[0]!.refId)!;
    expect(Object.keys(spot.values)).toEqual(['spot1']);
    expect(aimError(index.fixtures.get('spot1')!, spot.values.spot1!, markerPoint(SINGER))).toBeLessThan(2);
    expect(c.effects.every((e) => !e.targets.fixtureIds.includes('spot1'))).toBe(true);
    expect(compileShow(index, 'T', sung, { ...plan, intent: 'sans poursuite' }, OPTS).timeline.events.some((e) => e.label === 'Poursuite')).toBe(false);
    const noMarker = compileShow(new ProjectIndex(demoProject()), 'T', sung, plan, OPTS);
    expect(noMarker.notices.join(' ')).toMatch(/repère « Chanteur »/);
  });
});
