import { randomUUID } from 'node:crypto';
import type { Cue, CueList, Effect, FixtureValues, Scene, ShowPlan, ShowSectionPlan, SongAnalysis, Timeline, TimelineEvent } from '../model/schemas';
import { effectParamsSchema } from '../model/schemas';
import type { ProjectIndex } from '../engine/resolve';
import type { ResolvedFixture } from '../fixtures/profiles';
import { colorCapability, colorCells, colorToAttributes } from '../fixtures/color';
import { coarseChannel } from '../fixtures/profiles';
import { moduleKeys } from '../fixtures/modules';
import { attributeClass } from '../fixtures/attributes';
import { hexToRgb } from '../util/math';
import { beamToValues } from '../ai/director';
import { effectFlashViolation } from '../safety/flashGuard';
import { SECTION_NAMES } from './analyze';
import type { Vec3 } from '../visualizer/beam';
import { aimAt, isBlinder, isFog, isFollowSpot, markerPoint, memoAim, singerMarker, stagePoint, type NamedRef } from './showRig';
import { parseIntent, withMood, type Intent } from './intent';
export { parseIntent, withMood, type Intent };

/**
 * Song-to-Show: (1) a planner produces a typed show plan per section (energy, palette, layers, movement, effect) from
 * the song structure and the operator's intent — locally by rules, or by an LLM whose output is validated against the
 * same schema; (2) a deterministic compiler turns the plan into scenes, bar-synced effects and a timeline aligned on
 * the analysed downbeats, within the rig's real capabilities and the safety rules (strobe permission, flash guard).
 */

export interface RigInfo {
  wash: number;
  moving: number;
  bars: number;
  allowStrobe: boolean;
  /** Named project groups and stage markers the planner may use. */
  groups?: NamedRef[];
  markers?: NamedRef[];
}

type Layer = 'wash' | 'moving' | 'bars';
export function fixtureLayer(rf: ResolvedFixture): Layer {
  if (rf.attributes.includes('pan') || rf.attributes.includes('tilt')) return 'moving';
  if (rf.profile.type === 'led-bar' || colorCells(rf).length > 1) return 'bars';
  return 'wash';
}

export function rigInfo(index: ProjectIndex, allowStrobe: boolean): Required<RigInfo> {
  const ref = ({ id, name }: NamedRef) => ({ id, name });
  const r = { wash: 0, moving: 0, bars: 0, allowStrobe, groups: index.project.groups.map(ref), markers: index.project.visualizer.markers.map(ref) };
  for (const rf of index.fixtures.values()) if (!isFog(rf)) r[fixtureLayer(rf)]++;
  return r;
}

/* ── Planner (extracted to showPlanner.ts to stay under the 600-line limit) ── */
export { escalation, planLocally, adjustSection } from './showPlanner';

/* ---------------- Compiler ---------------- */

export interface CompileResult {
  scenes: Scene[];
  effects: Effect[];
  timeline: Timeline;
  /** GO list of the show: one cue per section, plus one per phrase in long sections. */
  cueList: CueList;
  notices: string[];
}

const LEVEL = [0, 0.3, 0.5, 0.7, 0.85, 1];
/** Haze / fog output by section energy: light haze in the calm parts, more on the peaks. */
const HAZE = [0, 0.1, 0.2, 0.35, 0.5, 0.65];
/** Share of its level a ramped section starts from (it reaches the full level at its end). */
const RAMP_FROM = 0.6;
const FOLLOW_COLOR = { r: 1, g: 0.95, b: 0.84 };

/** Every intensity key of the fixture: the main dimmer plus the cell dimmers of multi-head modules (ring, pixels…). */
function dimmerKeys(rf: ResolvedFixture): string[] {
  return [...new Set(['dimmer', ...moduleKeys(rf, 'dimmer')])];
}

function beamValues(rf: ResolvedFixture, beam: ShowSectionPlan['beam'], cluster: number): Record<string, number> {
  const gobos = coarseChannel(rf.mode, 'gobo')?.ranges.filter((r) => r.kind === 'gobo').length ?? 0;
  // Same music (cluster) → same gobo.
  const gobo = beam === 'gobo' || beam === 'prism' ? (gobos ? 1 + (cluster % gobos) : 0) : 0;
  return beamToValues(rf, { gobo, prism: beam === 'prism', frost: beam === 'frost' ? 1 : 0 });
}

/** Fixtures lit in the section: its project groups when it names some that still exist, else its families. Fog machines never. */
function litIds(index: ProjectIndex, s: ShowSectionPlan): Set<string> {
  const usable = (id: string) => { const rf = index.fixtures.get(id); return !!rf && !isFog(rf); };
  const fromGroups = s.groups.flatMap((g) => index.groups.get(g)?.fixtureIds ?? []).filter(usable);
  if (fromGroups.length) return new Set(fromGroups);
  return new Set([...index.fixtures.values()].filter((rf) => !isFog(rf) && s.layers[fixtureLayer(rf)]).map((rf) => rf.fixture.id));
}

/** Aim of the heads: a stage marker, or the audience (4 m past the stage lip, spread across the width), else none. */
function focusPoint(index: ProjectIndex, s: ShowSectionPlan, i: number): Vec3 | null {
  const vis = index.project.visualizer;
  if (s.focus === 'audience') return stagePoint((((i % 3) - 1) * vis.stageWidth) / 4, -4, 1.5);
  const m = s.focus ? vis.markers.find((x) => x.id === s.focus) : undefined;
  return m ? markerPoint(m) : null;
}

/**
 * Resting aim of the heads when nothing is focused, mirrored around the centre (`side`: stage x of the head):
 * calm → beams crossing on the stage floor, mid → a V fanning out over the audience, peak → high aerial beams.
 */
function restingAim(energy: number, side: number): Vec3 {
  if (energy <= 2) return stagePoint(-0.5 * side, 1, 0);
  if (energy <= 4) return stagePoint(2 * side, -6, 2);
  return stagePoint(1.5 * side, -6, 9);
}

const WHITE = { r: 1, g: 1, b: 1 };

/** `ownColors`: the operator chose the colours, so the heads keep them on the peaks instead of turning white. */
function sceneValues(index: ProjectIndex, s: ShowSectionPlan, cluster: number, lit: Set<string>, noHaze: boolean, ownColors: boolean, aim = aimAt): FixtureValues {
  const v: FixtureValues = {};
  const layerOf = (id: string) => fixtureLayer(index.fixtures.get(id)!);
  // Colour roles: washes carry the base colour and the heads the second one when both are lit (contrast between
  // layers); washes alone alternate the palette mirrored from the edges, so the look stays symmetric.
  const washes = spatial(index, [...lit].filter((id) => layerOf(id) === 'wash'));
  const layered = [...lit].some((id) => layerOf(id) === 'moving');
  const washRole = (id: string) => { const r = washes.indexOf(id); return layered || r < 0 ? 0 : Math.min(r, washes.length - 1 - r); };
  // Peaks: white beams on the heads cut through the haze over the coloured washes.
  const whiteHeads = s.energy >= 5 && !ownColors;
  let i = 0;
  for (const rf of index.fixtures.values()) {
    if (isFog(rf)) {
      const level = noHaze ? 0 : HAZE[s.energy]!;
      v[rf.fixture.id] = { fog: level, ...(rf.attributes.includes('fan') ? { fan: level } : {}) };
      continue;
    }
    const layer = fixtureLayer(rf);
    const on = lit.has(rf.fixture.id);
    const out: Record<string, number> = {};
    for (const k of dimmerKeys(rf)) out[k] = on ? LEVEL[s.energy]! : 0;
    if (colorCapability(rf) !== 'none') {
      const cells = colorCells(rf);
      const role = layer === 'moving' ? (layered && washes.length ? 1 : 0) : layer === 'wash' ? washRole(rf.fixture.id) : 0;
      const color = (k: number) => (layer === 'moving' && whiteHeads ? WHITE : hexToRgb(s.palette[k % s.palette.length]!));
      Object.assign(out, colorToAttributes(rf, color(role)));
      // Bars: one colour per cell; multi-head fixtures: the secondary modules take the next palette colour.
      const shift = rf.profile.modules.length > 1 ? 1 : 0;
      if (cells.length > 1 || shift) cells.forEach((c, k) => Object.assign(out, colorToAttributes(rf, color(role + k + shift), c)));
    }
    if (layer === 'moving') {
      // Unfocused heads rest on a designed position; movement effects swing around it.
      Object.assign(out, aim(rf, focusPoint(index, s, i) ?? restingAim(s.energy, rf.fixture.position.x || (i % 3) - 1)));
      Object.assign(out, beamValues(rf, s.beam, cluster));
    }
    v[rf.fixture.id] = out;
    i++;
  }
  return v;
}

const mapAttrs = (v: FixtureValues, fn: (attr: string, x: number) => number | null): FixtureValues =>
  Object.fromEntries(Object.entries(v).map(([fid, attrs]) => [fid, Object.fromEntries(Object.entries(attrs).flatMap(([a, x]) => { const y = fn(a, x); return y === null ? [] : [[a, y]]; }))]));
const intensityOnly = (v: FixtureValues) => mapAttrs(v, (a, x) => (attributeClass(a) === 'intensity' ? x : null));
const scaleIntensity = (v: FixtureValues, k: number) => mapAttrs(v, (a, x) => (attributeClass(a) === 'intensity' ? x * k : x));

/** Full white on every intensity key. */
const whiteHit = (rfs: readonly ResolvedFixture[]): FixtureValues =>
  Object.fromEntries(rfs.map((rf) => [rf.fixture.id, { ...Object.fromEntries(dimmerKeys(rf).map((k) => [k, 1])), ...(colorCapability(rf) !== 'none' ? colorToAttributes(rf, { r: 1, g: 1, b: 1 }) : {}) }]));

function fx(name: string, type: Effect['type'], ids: string[], blend: Effect['blend'], params: Record<string, unknown>): Effect {
  return { id: randomUUID(), name: name.slice(0, 80), type, targets: { fixtureIds: ids, groupIds: [] }, priority: 50, blend, duration: null, trigger: 'manual', origin: 'ai', params: effectParamsSchema.parse(params) };
}

function effectFor(name: string, s: ShowSectionPlan, maxStrobeHz: number, lights: string[]): Effect | null {
  if (!lights.length || s.effect === 'none') return null;
  const sync = { bpmSync: true, beatsPerCycle: s.effectBeats, barSync: true };
  
  // Standard effects
  switch (s.effect) {
    case 'wave': return fx(name, 'dimmerWave', lights, 'scale', { ...sync, offset: 0.7, amplitude: 0.6, phaseSpread: 1 });
    case 'pulse': return fx(name, 'pulse', lights, 'scale', { ...sync, offset: 0.65, amplitude: 0.7 });
    case 'pulseSlow': return fx(name, 'pulse', lights, 'scale', { ...sync, beatsPerCycle: s.effectBeats * 2, offset: 0.65, amplitude: 0.5 });
    case 'chase': return fx(name, 'chase', lights, 'scale', { ...sync, offset: 0.5, amplitude: 1, phaseSpread: 1 });
    case 'chaseSlow': return fx(name, 'chase', lights, 'scale', { ...sync, beatsPerCycle: s.effectBeats * 2, offset: 0.5, amplitude: 0.8, phaseSpread: 1 });
    case 'rainbow': return fx(name, 'rainbow', lights, 'override', { ...sync, phaseSpread: 1 });
    case 'colorChase': return fx(name, 'colorCycle', lights, 'override', { ...sync, phaseSpread: 1, colors: s.palette.length > 1 ? s.palette : [...s.palette, '#FFFFFF'] });
    case 'dimmerWave': return fx(name, 'dimmerWave', lights, 'scale', { ...sync, offset: 0.7, amplitude: 0.5, phaseSpread: 1 });
    
    // Strobe and flash effects
    case 'strobe': return fx(name, 'strobe', lights, 'scale', { speed: Math.min(maxStrobeHz, 20), offset: 0.5, amplitude: 1 });
    case 'snap': return fx(name, 'strobe', lights, 'scale', { speed: Math.min(maxStrobeHz, 20), beatsPerCycle: 1, offset: 0.5, amplitude: 1, duty: 0.1 });
    
    // Special effects
    case 'flicker': return fx(name, 'strobe', lights, 'scale', { speed: Math.min(maxStrobeHz, 30), beatsPerCycle: 0.5, offset: 0.4, amplitude: 0.8, duty: 0.3 });
    case 'glow': return fx(name, 'fade', lights, 'scale', { ...sync, beatsPerCycle: s.effectBeats * 4, offset: 0.3, amplitude: 0.7, phaseSpread: 0 });
    case 'gradient': return fx(name, 'colorCycle', lights, 'override', { ...sync, beatsPerCycle: s.effectBeats * 2, phaseSpread: 0.5, colors: s.palette.length > 1 ? s.palette : ['#FF0000', '#00FF00', '#0000FF'] });
  }
}

function moveFor(name: string, s: ShowSectionPlan, heads: string[]): Effect | null {
  // Heads focused on a marker hold still (shower); on the audience they sweep in pan only, keeping their tilt.
  if (!heads.length || s.movement === 'none' || (s.focus && s.focus !== 'audience')) return null;
  const sync = { bpmSync: true, barSync: true };
  
  // Special movements with dedicated effect types
  if (s.movement === 'fan') return fx(name, 'fan', heads, 'override', { ...sync, beatsPerCycle: 8, amplitude: 0.3 });
  if (s.movement === 'ballyhoo') return fx(name, 'randomMove', heads, 'override', { ...sync, beatsPerCycle: 2, amplitude: 0.6, seed: 7 });
  if (s.movement === 'random') return fx(name, 'randomMove', heads, 'override', { ...sync, beatsPerCycle: 4, amplitude: 0.5, seed: 42 });
  
  // Pan-only movements
  if (s.movement === 'pan') return fx(name, 'panTilt', heads, 'override', { ...sync, beatsPerCycle: 8, amplitude: 0.4, phaseSpread: 0.5, shape: 'pan' });
  
  // Tilt-only movements  
  if (s.movement === 'tilt') return fx(name, 'panTilt', heads, 'override', { ...sync, beatsPerCycle: 8, amplitude: 0.4, phaseSpread: 0.5, shape: 'tilt' });
  
  // Pattern movements with panTilt effect
  const patternMovements: Record<string, [number, number, string]> = {
    slow: [16, 0.3, 'circle'],
    sweep: [8, 0.5, 'circle'],
    fast: [4, 0.7, 'figure8'],
    circle: [8, 0.5, 'circle'],
    figure8: [8, 0.6, 'figure8'],
    pendulum: [12, 0.4, 'pingpong'],
    zigzag: [6, 0.6, 'zigzag'],
  };
  
  const config = patternMovements[s.movement];
  if (!config) return null;
  
  const [beats, amplitude, shape] = config;
  return fx(name, 'panTilt', heads, 'override', { 
    ...sync, 
    beatsPerCycle: beats, 
    amplitude, 
    phaseSpread: 0.5, 
    shape: s.focus === 'audience' ? 'pan' : shape 
  });
}

/** Extra effects of the section: zoom / iris breathing, band followers (they react to the audio being played). */
function extrasFor(index: ProjectIndex, name: string, s: ShowSectionPlan, lights: string[], heads: string[]): Effect[] {
  const out: Effect[] = [];
  const sync = { bpmSync: true, beatsPerCycle: 8, barSync: true };
  if (s.extras.includes('breathe')) for (const attr of ['zoom', 'iris'] as const) {
    const ids = heads.filter((id) => index.fixtures.get(id)!.attributes.includes(attr));
    if (ids.length) out.push(fx(`${name} · ${attr}`, 'wave', ids, 'override', { ...sync, attribute: attr, offset: 0.5, amplitude: 0.6, phaseSpread: 0.25 }));
  }
  if (s.extras.includes('bassFollow') && lights.length + heads.length) out.push(fx(`${name} · basses`, 'bassFollow', spatial(index, [...lights, ...heads]), 'scale', { ...sync, amplitude: 0.6 }));
  const colored = lights.filter((id) => colorCapability(index.fixtures.get(id)!) !== 'none');
  if (s.extras.includes('colorFollow') && colored.length) out.push(fx(`${name} · brillance`, 'brightnessColor', colored, 'override', { ...sync, colors: [s.palette[0]!, s.palette[1] ?? '#FFFFFF'] }));
  return out;
}

/** Fixture ids from stage left to stage right (then downstage first): effects chase across the stage, not the patch order. */
function spatial(index: ProjectIndex, ids: Iterable<string>): string[] {
  const pos = (id: string) => index.fixtures.get(id)!.fixture.position;
  return [...ids].sort((a, b) => pos(a).x - pos(b).x || pos(a).y - pos(b).y);
}

/** Phrase starts of a section: every phraseBars bars on the analysed downbeats; a tail shorter than half the phrase
 * length joins the last phrase. */
function phraseStarts(downbeats: readonly number[], sec: { start: number; end: number }, phraseBars: number = 8): number[] {
  const db = downbeats.filter((d) => d > sec.start + 0.05 && d < sec.end - 0.05);
  const out = [sec.start];
  const minTailBars = Math.ceil(phraseBars / 2);
  for (let k = phraseBars - 1; k < db.length; k += phraseBars) if (db.length - k >= minTailBars) out.push(db[k]!);
  return out;
}

/** Peak entered with a breath: a drop, or a chorus right after a build. */
const breathBefore = (sections: SongAnalysis['sections'], i: number) => i > 0 && (sections[i]!.label === 'drop' || (sections[i]!.label === 'chorus' && sections[i - 1]!.label === 'build'));

/** The parts of `e` outside [a, b); the part after the gap restarts without a fade (hard re-entry). */
function splitAround(e: TimelineEvent, a: number, b: number): TimelineEvent[] {
  if (b <= a) return [e];
  const end = e.start + e.duration;
  if (b <= e.start || a >= end) return [e];
  const out: TimelineEvent[] = [];
  if (a > e.start) out.push({ ...e, duration: a - e.start });
  if (b < end) out.push({ ...e, id: randomUUID(), start: b, duration: end - b, fade: 0 });
  return out;
}

export function compileShow(
  index: ProjectIndex,
  trackName: string,
  analysis: SongAnalysis,
  plan: ShowPlan,
  opts: { maxStrobeHz: number; allowStrobe: boolean; phraseBars?: number } = { maxStrobeHz: 10, allowStrobe: true, phraseBars: 8 },
): CompileResult {
  // Number of bars per phrase for cue generation - smaller values create more cues/tableaux
  // Default is 8, but can be configured via opts.phraseBars
  // For backward compatibility, we use 8 bars by default
  const phraseBars = opts?.phraseBars ?? 8;
  
  // Calculate bar duration for detecting long sections
  const barDuration = 60 / analysis.bpm * 4;
  const scenes: Scene[] = [];
  /** Layers over the section looks (progressions, blinders): listed after them, section scenes keep the section order. */
  const overlays: Scene[] = [];
  const looks: FixtureValues[] = [];
  const effects: Effect[] = [];
  const events: TimelineEvent[] = [];
  const notices: string[] = [];
  const beat = 60 / analysis.bpm;
  const short = trackName.slice(0, 40);
  /** Schema hard-cap for timeline event fade/fadeOut (TimelineEventSchema: max(60)). */
  const MAX_FADE = 60;
  const clampFade = (v: number) => Math.min(MAX_FADE, Math.max(0, v));
  const ev = (e: Omit<TimelineEvent, 'id' | 'cueIndex' | 'lane'> & { lane?: number }): TimelineEvent => ({
    id: randomUUID(), cueIndex: 0, lane: 0,
    ...e,
    fade: clampFade(e.fade),
    ...(e.fadeOut !== undefined ? { fadeOut: clampFade(e.fadeOut) } : {}),
  });
  const intent = parseIntent(plan.intent);
  const rigFixtures = [...index.fixtures.values()].filter((rf) => !isFog(rf));

  // Follow spot: one head (named so, else the first of at least two) lights the singer while a voice is detected.
  const vocals = analysis.events.filter((e) => e.kind === 'vocal');
  const singer = singerMarker(index.project.visualizer.markers);
  const heads = rigFixtures.filter((rf) => fixtureLayer(rf) === 'moving');
  const follow = vocals.length && singer && !intent.noFollow ? heads.find(isFollowSpot) ?? (heads.length >= 2 ? heads[0] : undefined) : undefined;
  if (vocals.length && !singer && heads.length >= 2 && !intent.noFollow) notices.push('Voix détectée : placez un repère « Chanteur » sur la scène pour une poursuite pendant le chant');

  const fades = analysis.sections.map((sec, i) => {
    const p = plan.sections[i], prev = plan.sections[i - 1];
    if (!prev || !p) return 0;
    if (breathBefore(analysis.sections, i)) return 0; // hard cut after the blackout
    return p.energy > prev.energy ? beat : Math.min(60, 4 * beat * 2, sec.end - sec.start); // rise: 1 beat, fall: 2 bars (capped at schema max)
  });

  // Breath before a drop: one beat of black so the hit lands on a dark stage (only after a section long enough).
  const breaths = analysis.sections.flatMap((s, i) => (breathBefore(analysis.sections, i) && s.start - analysis.sections[i - 1]!.start > 4 * beat ? [{ t: s.start - beat, duration: beat }] : []));

  const aimMemo = memoAim();
  let lastLook: TimelineEvent | undefined;
  // GO list: each cue fires at a time (section start or phrase start) and holds the look until the next one.
  const cueSteps: { t: number; fade: number; sceneId: string; effectIds: string[]; label: string }[] = [];
  const altOf = new Map<string, string>(); // primary effect id → its flipped copy (phrase-alternated)
  analysis.sections.forEach((sec, i) => {
    const p = plan.sections[i];
    if (!p) return;
    const label = `${String(i + 1).padStart(2, '0')} ${SECTION_NAMES[sec.label]}`;
    const name = `${short} · ${label}`;
    const len = sec.end - sec.start;
    const lit = litIds(index, p);
    const full = sceneValues(index, p, sec.cluster, lit, intent.noHaze, intent.colors.length > 0, aimMemo);
    const ramped = p.extras.includes('ramp');
    const scene: Scene = { id: randomUUID(), name: name.slice(0, 80), notes: plan.intent.slice(0, 500), values: ramped ? scaleIntensity(full, RAMP_FROM) : full, origin: 'ai' };
    scenes.push(scene);
    looks[i] = full;
    const nextFade = fades[i + 1] ?? 0;
    // Overlap with the next section by its fade: this scene holds while the next one fades in (crossfade).
    lastLook = ev({ kind: 'scene', refId: scene.id, start: sec.start, duration: len + nextFade, fade: fades[i]!, fadeOut: 0, label });
    events.push(lastLook);
    if (ramped) {
      // Intensities rise across the section from RAMP_FROM to the full level (HTP over the section scene).
      const rise: Scene = { id: randomUUID(), name: `${name} · progression`.slice(0, 80), notes: '', values: intensityOnly(full), origin: 'ai' };
      overlays.push(rise);
      events.push(ev({ kind: 'scene', refId: rise.id, start: sec.start, duration: len + nextFade, fade: len, fadeOut: nextFade, label: 'Progression', lane: 2 }));
    }
    const lights = spatial(index, lit).filter((id) => fixtureLayer(index.fixtures.get(id)!) !== 'moving');
    const movers = spatial(index, lit).filter((id) => fixtureLayer(index.fixtures.get(id)!) === 'moving' && id !== follow?.fixture.id);
    if (p.extras.includes('blinder')) {
      const blinders = rigFixtures.filter(isBlinder);
      const hit = blinders.length ? blinders : lights.map((id) => index.fixtures.get(id)!);
      if (hit.length) {
        const b: Scene = { id: randomUUID(), name: `${name} · blinder`.slice(0, 80), notes: '', values: whiteHit(hit), origin: 'ai' };
        overlays.push(b);
        events.push(ev({ kind: 'scene', refId: b.id, start: sec.start, duration: 2 * beat, fade: 0, fadeOut: 2 * beat, label: 'Blinder', lane: 2 }));
      }
    }
    let main = effectFor(`${name} · effet`, p, opts.maxStrobeHz, lights);
    if (main?.type === 'strobe' && !opts.allowStrobe) {
      notices.push(`${label} : strobe non autorisé (Paramètres › IA) — remplacé par un chase`);
      main = effectFor(main.name, { ...p, effect: 'chase' }, opts.maxStrobeHz, lights);
    }
    if (main) {
      const check = effectFlashViolation(index, scene.values, main, analysis.bpm, opts.maxStrobeHz);
      if (check.violation) {
        notices.push(`${label} : ${check.reason} — effet remplacé par une pulsation lente (garde-fou photosensible)`);
        main = effectFor(main.name, { ...p, effect: 'pulse', effectBeats: 4 }, opts.maxStrobeHz, lights);
      }
    }
    // Symmetry: the main effect mirrors from the edges to the centre; every other phrase it sweeps across the
    // stage instead, and the heads reverse, so a long section keeps evolving with the music's phrasing.
    if (main) main.params.direction = 'pingpong';
    const move = moveFor(`${name} · mouvement`, p, movers);
    
    // For long sections (> 16 bars), use smaller phraseBars to create more cues/tableaux
    // This automatically generates more variation in long sections
    const sectionBars = Math.round(len / barDuration);
    const effectivePhraseBars = sectionBars > 16 ? Math.max(4, phraseBars / 2) : phraseBars;
    const starts = phraseStarts(analysis.downbeats, sec, effectivePhraseBars);
    const flip: Record<string, Effect['params']['direction']> = { pingpong: 'forward', forward: 'reverse' };
    for (const e of [main, move, ...extrasFor(index, name, p, lights, movers)]) {
      if (!e) continue;
      effects.push(e);
      const alt = (e === main || e === move) && e.params.phaseSpread > 0 && starts.length > 1
        ? { ...e, id: randomUUID(), name: `${e.name} B`.slice(0, 80), params: { ...e.params, direction: flip[e.params.direction]! } } : null;
      if (alt) {
        effects.push(alt);
        altOf.set(e.id, alt.id);
      }
      starts.forEach((t, j) => {
        if (!alt && j) return;
        const end = alt ? starts[j + 1] ?? sec.end : sec.end;
        const ref = alt && j % 2 ? alt : e;
        events.push(ev({ kind: 'effect', refId: ref.id, start: t, duration: end - t, fade: 0, label: ref.name.slice(-40), lane: 1 }));
      });
    }
    // GO cues: the first one carries the section look and its movement; each later phrase re-fires the look and
    // switches to the flipped movement, like the timeline does.
    const primaryIds = [main, move].flatMap((e) => (e ? [e.id] : []));
    starts.forEach((t, j) => {
      const effectIds = primaryIds.map((id) => (j % 2 && altOf.has(id) ? altOf.get(id)! : id));
      cueSteps.push({ t, fade: j ? 0 : fades[i]!, sceneId: scene.id, effectIds, label: j ? `${label} · phrase ${j + 1}` : label });
    });
  });

  scenes.push(...overlays);

  // Accents: a short full-white hit on detected impacts inside accented sections (decays over one beat).
  const impacts = analysis.events.filter((e) => e.kind === 'impact' && analysis.sections.some((s, i) => plan.sections[i]?.accents && e.t >= s.start && e.t < s.end));
  if (impacts.length) {
    const accent: Scene = { id: randomUUID(), name: `${short} · accent`.slice(0, 80), notes: '', values: whiteHit(rigFixtures), origin: 'ai' };
    scenes.push(accent);
    for (const e of impacts) events.push(ev({ kind: 'scene', refId: accent.id, start: e.t, duration: beat, fade: 0, fadeOut: beat, label: 'Accent', lane: 2 }));
  }

  // Ending: a last hit in the closing seconds gets a white button then black; otherwise the last look fades out
  // over the last 2 bars.
  const ending: { t: number; duration: number }[] = [];
  const lastSec = analysis.sections.at(-1);
  const final = analysis.events.findLast((e) => e.kind === 'impact' && lastSec && e.t >= lastSec.start && e.t > analysis.duration - 8);
  if (final && analysis.duration - final.t > beat + 0.05) {
    const button: Scene = { id: randomUUID(), name: `${short} · final`.slice(0, 80), notes: '', values: whiteHit(rigFixtures), origin: 'ai' };
    scenes.push(button);
    events.push(ev({ kind: 'scene', refId: button.id, start: final.t, duration: beat, fade: 0, fadeOut: beat, label: 'Final', lane: 2 }));
    ending.push({ t: final.t + beat, duration: analysis.duration - final.t - beat });
  } else if (lastLook) lastLook.fadeOut = Math.min(8 * beat, lastLook.duration);

  // Risers: the intensity of the coming section ramps up over the riser (dimmers only, so colours and positions
  // stay those of the current section until the cut).
  analysis.events.filter((e) => e.kind === 'riser' && e.duration > 0).forEach((r) => {
    const k = analysis.sections.findIndex((s) => Math.abs(s.start - (r.t + r.duration)) < beat);
    const target = looks[k];
    if (k <= 0 || !target) return;
    // Before a breath the rise peaks as the blackout starts.
    const end = analysis.sections[k]!.start - (breaths.some((b) => Math.abs(b.t + b.duration - analysis.sections[k]!.start) < 1e-6) ? beat : 0);
    if (end - r.t < 0.05) return;
    const ramp: Scene = { id: randomUUID(), name: `${short} · montée ${k + 1}`.slice(0, 80), notes: '', values: intensityOnly(target), origin: 'ai' };
    scenes.push(ramp);
    events.push(ev({ kind: 'scene', refId: ramp.id, start: r.t, duration: end - r.t, fade: end - r.t, fadeOut: 0, label: 'Montée', lane: 2 }));
  });

  if (follow && singer) {
    // Top lane: its position and colour win over the section look while the voice is heard.
    const values = { ...Object.fromEntries(dimmerKeys(follow).map((k) => [k, 1])), ...(colorCapability(follow) !== 'none' ? colorToAttributes(follow, FOLLOW_COLOR) : {}), ...aimAt(follow, markerPoint(singer)), ...beamToValues(follow, { gobo: 0, prism: false, frost: 0 }) };
    const spot: Scene = { id: randomUUID(), name: `${short} · poursuite`.slice(0, 80), notes: '', values: { [follow.fixture.id]: values }, origin: 'ai' };
    scenes.push(spot);
    for (const v of vocals) events.push(ev({ kind: 'scene', refId: spot.id, start: v.t, duration: v.duration, fade: 0.5, fadeOut: 0.5, label: 'Poursuite', lane: 3 }));
  }

  // Silences: scene events are cut around them (intensities merge HTP, so a dark scene on top would not darken).
  const silences = [...analysis.events.filter((e) => e.kind === 'silence'), ...breaths, ...ending];
  const cut: TimelineEvent[] = [];
  for (const e of events) {
    let pieces = [e];
    if (e.kind === 'scene') for (const s of silences) pieces = pieces.flatMap((p) => splitAround(p, s.t, s.t + s.duration));
    cut.push(...pieces.filter((p) => p.duration >= 0.05 && p.start >= 0));
  }
  cut.sort((a, b) => a.start - b.start || a.lane - b.lane);
  const timeline: Timeline = { id: randomUUID(), name: `Show · ${short}`.slice(0, 80), duration: Math.max(1, Math.ceil(analysis.duration)), loop: false, events: cut };
  
  // Follow trigger: a cue waits `wait` after the previous cue's fade, so the previous look holds until its step ends.
  cueSteps.sort((a, b) => a.t - b.t);
  const cues: Cue[] = cueSteps.map((s, k) => {
    const prev = cueSteps[k - 1];
    const trigger: Cue['trigger'] = prev ? { type: 'follow', wait: Math.max(0, s.t - prev.t - prev.fade) } : { type: 'manual' };
    return { id: randomUUID(), number: k + 1, name: s.label.slice(0, 80), description: '', sceneId: s.sceneId, fade: s.fade, delay: 0, curve: 'linear', trigger, effectIds: s.effectIds };
  });
  const cueList: CueList = { id: randomUUID(), name: `Show · ${short}`.slice(0, 80), priority: 50, loop: false, cues: cues.slice(0, 999) };
  return { scenes, effects, timeline, cueList, notices };
}

export type { ShowIntegrityReport } from './showIntegrity';
export { validateShowIntegrity } from './showIntegrity';
export type { ArtisticQualityReport } from './artisticQuality';
export { evaluateArtisticQuality } from './artisticQuality';
export { ARTISTIC_STRATEGIES, type ArtisticStrategy } from './showPlanner';
