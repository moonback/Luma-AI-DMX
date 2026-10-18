import { randomUUID } from 'node:crypto';
import type { Effect, FixtureValues, Scene, ShowPlan, ShowSectionPlan, SongAnalysis, Timeline, TimelineEvent } from '../model/schemas';
import { effectParamsSchema, type SectionLabel, type ShowExtra } from '../model/schemas';
import type { ProjectIndex } from '../engine/resolve';
import type { ResolvedFixture } from '../fixtures/profiles';
import { colorCapability, colorCells, colorToAttributes } from '../fixtures/color';
import { coarseChannel } from '../fixtures/profiles';
import { moduleKeys } from '../fixtures/modules';
import { attributeClass } from '../fixtures/attributes';
import { hexToRgb } from '../util/math';
import { COLORS, normalize } from '../ai/local/interpreter';
import { beamToValues } from '../ai/director';
import { effectFlashViolation } from '../safety/flashGuard';
import { SECTION_NAMES } from './analyze';
import type { Vec3 } from '../visualizer/beam';
import { aimAt, groupsBySection, isBlinder, isFog, isFollowSpot, markerPoint, namePattern, singerMarker, stagePoint, type NamedRef } from './showRig';

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

/* ---------------- Intent ---------------- */

const LABEL_ENERGY: Record<SectionLabel, number> = { intro: 1, verse: 2, prechorus: 3, build: 3, chorus: 4, drop: 5, break: 1, bridge: 2, outro: 1 };
const WARM = ['#FFB000', '#FF4FA0', '#FF7000', '#FF2A00'];
const COLD = ['#2040FF', '#8B00FF', '#00C8FF', '#00E5A0'];

export interface Intent {
  verseShift: number;
  peakShift: number;
  globalShift: number;
  strobe: 'forbid' | 'want' | 'auto';
  noMovement: boolean;
  colors: string[];
  warmth: 'warm' | 'cold' | null;
  noHaze: boolean;
  noFollow: boolean;
  /** Band followers asked for: dimmer on the bass, colour on the brightness. */
  bassFollow: boolean;
  colorFollow: boolean;
}

const has = (t: string, re: RegExp) => re.test(t);

export function parseIntent(text: string): Intent {
  const t = normalize(text);
  const calm = /\b(sobre|sobres|calme|calmes|doux|douce|intime|discret|discrete|leger|legere)\b/;
  const big = /\b(explos\w*|energique\w*|puissant\w*|intense\w*|enorme\w*|fort|forte|pechu\w*|massif\w*)\b/;
  const verseCalm = has(t, new RegExp(`couplets?\\b[^,.;]*${calm.source}`)) || has(t, new RegExp(`${calm.source}[^,.;]*couplets?`));
  const peakBig = has(t, new RegExp(`(refrains?|drops?)\\b[^,.;]*${big.source}`)) || has(t, new RegExp(`${big.source}[^,.;]*(refrains?|drops?)`));
  const noStrobe = has(t, /\b(pas de|sans|aucun|no)\s+strobe/);
  const colors: string[] = [];
  for (const c of COLORS) if (c.forms.some((f) => has(t, new RegExp(`\\b${normalize(f)}\\b`)))) colors.push(c.hex);
  return {
    verseShift: verseCalm ? -1 : 0,
    peakShift: peakBig ? 1 : 0,
    globalShift: !verseCalm && !peakBig ? (has(t, calm) ? -1 : has(t, big) ? 1 : 0) : 0,
    strobe: noStrobe ? 'forbid' : has(t, /\bstrobe\b/) ? 'want' : 'auto',
    noMovement: has(t, /\b(sans|pas de|aucun)\s+mouvements?\b|\bfixes?\b/),
    colors,
    warmth: has(t, /\b(chaud|chaude|chaleureu\w*|warm)\b/) ? 'warm' : has(t, /\b(froid|froide|glacial\w*|cold)\b/) ? 'cold' : null,
    noHaze: has(t, /\b(sans|pas de|aucune?)\s+(fumee|haze|brouillard)\b/),
    noFollow: has(t, /\b(sans|pas de|aucune?)\s+poursuites?\b/),
    bassFollow: has(t, /\b(suit|suivent|sur|calee?s? sur) (les |la )?basses?\b/),
    colorFollow: has(t, /\bcouleurs? (qui )?sui\w* (la )?(brillance|musique|son)\b/),
  };
}

/* ---------------- Local planner ---------------- */

const clampE = (e: number) => Math.max(0, Math.min(5, Math.round(e)));

/** `bars`: section length in bars; `bassShare`: share of low-frequency energy of the section. */
function sectionPlan(index: number, energy: number, palette: string[], rig: RigInfo, intent: Intent, variant: number, label: SectionLabel, bars = 0, bassShare = 0.5): ShowSectionPlan {
  const peak = label === 'chorus' || label === 'drop';
  const alt = (variant + index) % 2 === 0;
  // With a singer on stage: shower on them in the calm parts (still heads), sweep the audience on the peaks.
  const singer = rig.moving > 0 ? singerMarker(rig.markers ?? []) : null;
  const focus: ShowSectionPlan['focus'] = !singer ? null : peak ? 'audience' : energy <= 3 ? singer.id : null;
  let movement: ShowSectionPlan['movement'] = intent.noMovement || energy <= 1 ? 'none' : energy === 2 ? 'slow' : energy === 3 ? 'sweep' : energy === 4 ? (alt ? 'fast' : 'fan') : alt ? 'ballyhoo' : 'fast';
  if (focus && focus !== 'audience') movement = 'none';
  let effect: ShowSectionPlan['effect'] = 'none', effectBeats = 4;
  if (energy === 2) { effect = 'wave'; effectBeats = 8; }
  else if (energy === 3) { effect = alt ? 'pulse' : 'chase'; effectBeats = 2; }
  else if (energy === 4) { effect = alt ? 'chase' : 'colorChase'; effectBeats = alt ? 1 : 4; }
  else if (energy >= 5) { effect = 'chase'; effectBeats = 1; }
  if (label === 'drop' && rig.allowStrobe && intent.strobe === 'want') effect = 'strobe';
  if (label === 'bridge' && energy >= 2) { effect = 'rainbow'; effectBeats = 16; }
  const beam: ShowSectionPlan['beam'] = peak && energy >= 5 ? 'prism' : energy >= 3 ? 'gobo' : energy <= 1 ? 'frost' : 'open';
  const layers = { wash: rig.wash > 0 || (rig.bars === 0 && rig.moving === 0), moving: rig.moving > 0 && (energy >= 2 || peak || !!focus), bars: rig.bars > 0 && energy >= 2 };
  const extras: ShowExtra[] = [];
  if (!peak && bars >= 8 && energy >= 1 && energy <= 4 && ['intro', 'verse', 'prechorus', 'build'].includes(label)) extras.push('ramp');
  if (label === 'drop' || (peak && energy >= 5)) extras.push('blinder');
  if (layers.moving && energy >= 1 && energy <= 2) extras.push('breathe');
  if (intent.bassFollow ? energy >= 3 : label === 'drop' || (peak && bassShare >= 0.75)) extras.push('bassFollow');
  if (intent.colorFollow ? energy >= 1 && effect !== 'rainbow' : label === 'break' && energy >= 1) extras.push('colorFollow');
  return {
    index, energy, beam,
    palette: peak ? palette.slice(0, 2) : palette.slice(0, energy >= 3 ? 2 : 1),
    layers, movement, effect, effectBeats, accents: energy >= 4, groups: [], focus, extras, locked: false, note: '', why: '',
  };
}

const dec = (x: number) => x.toFixed(2).replace('.', ',');
const EXTRA_WHY: Record<ShowExtra, string> = {
  ramp: 'section longue → montée progressive', blinder: 'temps fort → blinder à l’entrée', breathe: 'passage calme → zoom qui respire',
  bassFollow: 'basses dominantes → suit les basses', colorFollow: 'couleur qui suit la brillance',
};

/** Why the local rules chose this look: measured energy, repeats, the intent, the rig choices. */
function explain(analysis: SongAnalysis, i: number, p: ShowSectionPlan, intent: Intent, rig: RigInfo): string {
  const s = analysis.sections[i]!;
  const parts = [`${SECTION_NAMES[s.label]}, énergie mesurée ${dec(s.energy)} → niveau ${p.energy}/5`];
  const first = analysis.sections.findIndex((x) => x.cluster === s.cluster);
  if (first < i) parts.push(`même musique que la section ${first + 1} (${SECTION_NAMES[analysis.sections[first]!.label].toLowerCase()}) → même palette`);
  const peak = s.label === 'chorus' || s.label === 'drop';
  if (intent.verseShift && ['verse', 'intro', 'outro'].includes(s.label)) parts.push('couplets sobres demandés');
  if (intent.peakShift && peak) parts.push('temps forts renforcés (intention)');
  if (intent.globalShift) parts.push(intent.globalShift < 0 ? 'ambiance calme demandée' : 'ambiance énergique demandée');
  if (intent.colors.length) parts.push('couleurs demandées');
  if (p.groups.length) parts.push(`groupes demandés : ${p.groups.map((g) => rig.groups?.find((x) => x.id === g)?.name).filter(Boolean).join(', ')}`);
  if (p.focus === 'audience') parts.push('balayage du public');
  else if (p.focus) parts.push(`douche sur ${rig.markers?.find((m) => m.id === p.focus)?.name ?? 'le repère'}`);
  for (const x of p.extras) parts.push(EXTRA_WHY[x]);
  return parts.join(' ; ').slice(0, 300);
}

export function planLocally(analysis: SongAnalysis, intentText: string, rig: RigInfo, variant = 0, previous?: ShowPlan | null): ShowPlan {
  const intent = parseIntent(intentText);
  const base = intent.colors.length ? intent.colors : intent.warmth === 'cold' || (!intent.warmth && analysis.key.mode === 'minor') ? COLD : WARM;
  const accent = (intent.warmth === 'cold' || (!intent.warmth && analysis.key.mode === 'minor') ? WARM : COLD)[variant % 4]!;
  const byLabel = groupsBySection(intentText, rig.groups ?? []);
  const barSec = 240 / analysis.bpm;
  const sections = analysis.sections.map((s, i): ShowSectionPlan => {
    const kept = previous?.sections[i];
    if (kept?.locked && previous!.sections.length === analysis.sections.length) return kept;
    const label = s.label;
    let e = 0.6 * LABEL_ENERGY[label] + 0.4 * s.energy * 5 + intent.globalShift;
    if (label === 'verse' || label === 'intro' || label === 'outro') e += intent.verseShift;
    if (label === 'chorus' || label === 'drop') e += intent.peakShift;
    // Same music (cluster) → same palette, rotated by the variant.
    const rot = (s.cluster + variant) % base.length;
    const palette = [...base.slice(rot), ...base.slice(0, rot)];
    if ((label === 'chorus' || label === 'drop') && !intent.colors.length) palette.splice(1, 0, accent);
    const plan = sectionPlan(i, clampE(e), palette.slice(0, 4), rig, intent, variant, label, (s.end - s.start) / barSec, s.bassShare);
    const out = { ...plan, groups: byLabel.get(label) ?? [] };
    return { ...out, why: explain(analysis, i, out, intent, rig) };
  });
  const peaks = analysis.sections.filter((s) => s.label === 'chorus' || s.label === 'drop').length;
  return {
    intent: intentText.slice(0, 500), provider: 'local', model: null, variant,
    summary: `${sections.length} sections, ${peaks} temps fort(s) ; palette ${intent.colors.length ? 'demandée' : intent.warmth ?? (analysis.key.mode === 'minor' ? 'froide (tonalité mineure)' : 'chaude (tonalité majeure)')}${intent.strobe === 'forbid' ? ', sans strobe' : ''}${intent.noMovement ? ', sans mouvement' : ''}${byLabel.size ? `, groupes : ${[...byLabel].map(([l, ids]) => `${SECTION_NAMES[l].toLowerCase()} → ${ids.map((id) => rig.groups!.find((g) => g.id === id)!.name).join(' + ')}`).join(', ')}` : ''}.`,
    sections,
  };
}

/** Local edit of one section from a short instruction ("plus chaud", "plus calme", "en rouge", "sans mouvement"…). */
export function adjustSection(s: ShowSectionPlan, instruction: string, rig: RigInfo): ShowSectionPlan {
  const t = normalize(instruction);
  const out: ShowSectionPlan = { ...s, palette: [...s.palette], layers: { ...s.layers }, groups: [...s.groups], extras: [...s.extras], note: instruction.slice(0, 200), why: `Retouche « ${instruction.slice(0, 80)} »${s.why ? ` ; ${s.why}` : ''}`.slice(0, 300) };
  if (has(t, /\bplus (calme|doux|sobre)|moins (fort|energique|intense)/)) out.energy = clampE(s.energy - 1);
  if (has(t, /\bplus (fort|energique|intense|puissant)|moins (calme|sobre)|explos/)) out.energy = clampE(s.energy + 1);
  if (has(t, /\bplus chaud|chaleureu/)) out.palette = WARM.slice(0, Math.max(1, s.palette.length));
  if (has(t, /\bplus froid|glacial/)) out.palette = COLD.slice(0, Math.max(1, s.palette.length));
  const colors = COLORS.filter((c) => c.forms.some((f) => has(t, new RegExp(`\\b${normalize(f)}\\b`)))).map((c) => c.hex);
  if (colors.length) out.palette = colors.slice(0, 4);
  if (has(t, /\b(sans|pas de) mouvement/)) out.movement = 'none';
  else if (has(t, /\bplus de mouvement|bouge/)) out.movement = out.energy >= 4 ? 'fast' : 'sweep';
  if (has(t, /\b(sans|pas de) strobe/) && out.effect === 'strobe') out.effect = 'chase';
  else if (has(t, /\bstrobe\b/) && rig.allowStrobe) out.effect = 'strobe';
  if (out.energy !== s.energy && !colors.length && out.effect !== 'strobe') {
    const fresh = sectionPlan(s.index, out.energy, out.palette, rig, parseIntent(''), 0, out.energy >= 4 ? 'chorus' : 'verse');
    Object.assign(out, { effect: fresh.effect, effectBeats: fresh.effectBeats, accents: fresh.accents, layers: fresh.layers, beam: fresh.beam, movement: out.movement === 'none' && s.movement === 'none' ? 'none' : fresh.movement });
  }
  const groups = (rig.groups ?? []).filter((g) => namePattern(g.name).test(t));
  if (groups.length) out.groups = groups.map((g) => g.id);
  else if (has(t, /\btout le (kit|monde)|tous les projecteurs\b/)) out.groups = [];
  if (has(t, /\beventail\b/)) out.movement = 'fan';
  else if (has(t, /\bballyhoo\b/)) out.movement = 'ballyhoo';
  if (has(t, /\bchase (de )?couleurs?\b/)) out.effect = 'colorChase';
  const singer = singerMarker(rig.markers ?? []);
  if (singer && has(t, /\bdouche\b|\bsur (le |la )?(chanteu\w*|chant\w*|voix)\b/)) { out.focus = singer.id; out.movement = 'none'; out.layers.moving = true; }
  else if (has(t, /\bpublic\b/)) out.focus = 'audience';
  const extra = (x: ShowExtra, on: boolean) => { out.extras = on ? [...new Set([...out.extras, x])] : out.extras.filter((e) => e !== x); };
  const toggles: [ShowExtra, string][] = [['blinder', 'blinders?'], ['ramp', 'monte\\w* (doucement|progressivement)|progressi\\w*'], ['breathe', 'zoom|iris'], ['bassFollow', 'basses?']];
  for (const [x, words] of toggles) {
    if (has(t, new RegExp(`\\b(sans|pas de)\\s+(${words})\\b`))) extra(x, false);
    else if (has(t, new RegExp(`\\b(${words})\\b`))) extra(x, true);
  }
  if (has(t, /\b(sans|pas de) (gobos?|prismes?)\b|faisceau ouvert/)) out.beam = 'open';
  else if (has(t, /\bprismes?\b/)) out.beam = 'prism';
  else if (has(t, /\bgobos?\b/)) out.beam = 'gobo';
  else if (has(t, /\b(frost|flou|diffus\w*)\b/)) out.beam = 'frost';
  return out;
}

/* ---------------- Compiler ---------------- */

export interface CompileResult {
  scenes: Scene[];
  effects: Effect[];
  timeline: Timeline;
  notices: string[];
}

const LEVEL = [0.12, 0.3, 0.5, 0.7, 0.85, 1];
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

function sceneValues(index: ProjectIndex, s: ShowSectionPlan, cluster: number, lit: Set<string>, noHaze: boolean): FixtureValues {
  const v: FixtureValues = {};
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
      const color = (k: number) => hexToRgb(s.palette[k % s.palette.length]!);
      Object.assign(out, colorToAttributes(rf, color(i)));
      // Bars: one colour per cell; multi-head fixtures: the secondary modules take the next palette colour.
      const shift = rf.profile.modules.length > 1 ? 1 : 0;
      if (cells.length > 1 || shift) cells.forEach((c, k) => Object.assign(out, colorToAttributes(rf, color(i + k + shift), c)));
    }
    if (layer === 'moving') {
      const aim = focusPoint(index, s, i);
      if (aim) Object.assign(out, aimAt(rf, aim));
      else {
        // Static focus spread across the stage; movement effects swing around it.
        if (rf.attributes.includes('pan')) out.pan = 0.5 + ((i % 3) - 1) * 0.12;
        if (rf.attributes.includes('tilt')) out.tilt = 0.62;
      }
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
  switch (s.effect) {
    case 'wave': return fx(name, 'dimmerWave', lights, 'scale', { ...sync, offset: 0.7, amplitude: 0.6, phaseSpread: 1 });
    case 'pulse': return fx(name, 'pulse', lights, 'scale', { ...sync, offset: 0.65, amplitude: 0.7 });
    case 'chase': return fx(name, 'chase', lights, 'scale', { ...sync, offset: 0.5, amplitude: 1, phaseSpread: 1 });
    case 'rainbow': return fx(name, 'rainbow', lights, 'override', { ...sync, phaseSpread: 1 });
    case 'colorChase': return fx(name, 'colorCycle', lights, 'override', { ...sync, phaseSpread: 1, colors: s.palette.length > 1 ? s.palette : [...s.palette, '#FFFFFF'] });
    case 'strobe': return fx(name, 'strobe', lights, 'scale', { speed: Math.min(maxStrobeHz, 8), offset: 0.5, amplitude: 1 });
  }
}

function moveFor(name: string, s: ShowSectionPlan, heads: string[]): Effect | null {
  // Heads focused on a marker hold still (shower); on the audience they sweep in pan only, keeping their tilt.
  if (!heads.length || s.movement === 'none' || (s.focus && s.focus !== 'audience')) return null;
  const sync = { bpmSync: true, barSync: true };
  if (s.movement === 'fan') return fx(name, 'fan', heads, 'override', { ...sync, beatsPerCycle: 8, amplitude: 0.3 });
  if (s.movement === 'ballyhoo') return fx(name, 'randomMove', heads, 'override', { ...sync, beatsPerCycle: 2, amplitude: 0.6, seed: 7 });
  const [beats, amplitude] = { slow: [16, 0.3], sweep: [8, 0.5], fast: [4, 0.7] }[s.movement];
  return fx(name, 'panTilt', heads, 'override', { ...sync, beatsPerCycle: beats, amplitude, phaseSpread: 0.5, shape: s.focus === 'audience' ? 'pan' : s.movement === 'fast' ? 'figure8' : 'circle' });
}

/** Extra effects of the section: zoom / iris breathing, band followers (they react to the audio being played). */
function extrasFor(index: ProjectIndex, name: string, s: ShowSectionPlan, lights: string[], heads: string[]): Effect[] {
  const out: Effect[] = [];
  const sync = { bpmSync: true, beatsPerCycle: 8, barSync: true };
  if (s.extras.includes('breathe')) for (const attr of ['zoom', 'iris'] as const) {
    const ids = heads.filter((id) => index.fixtures.get(id)!.attributes.includes(attr));
    if (ids.length) out.push(fx(`${name} · ${attr}`, 'wave', ids, 'override', { ...sync, attribute: attr, offset: 0.5, amplitude: 0.6, phaseSpread: 0.25 }));
  }
  if (s.extras.includes('bassFollow') && lights.length + heads.length) out.push(fx(`${name} · basses`, 'bassFollow', [...lights, ...heads], 'scale', { ...sync, amplitude: 0.6 }));
  const colored = lights.filter((id) => colorCapability(index.fixtures.get(id)!) !== 'none');
  if (s.extras.includes('colorFollow') && colored.length) out.push(fx(`${name} · brillance`, 'brightnessColor', colored, 'override', { ...sync, colors: [s.palette[0]!, s.palette[1] ?? '#FFFFFF'] }));
  return out;
}

/** The parts of `e` outside [a, b); the part after the gap restarts without a fade (hard re-entry). */
function splitAround(e: TimelineEvent, a: number, b: number): TimelineEvent[] {
  const end = e.start + e.duration;
  if (b <= e.start || a >= end) return [e];
  const out: TimelineEvent[] = [];
  if (a > e.start) out.push({ ...e, duration: a - e.start });
  if (b < end) out.push({ ...e, id: randomUUID(), start: b, duration: end - b, fade: 0 });
  return out;
}

export function compileShow(index: ProjectIndex, trackName: string, analysis: SongAnalysis, plan: ShowPlan, opts: { maxStrobeHz: number; allowStrobe: boolean }): CompileResult {
  const scenes: Scene[] = [];
  /** Layers over the section looks (progressions, blinders): listed after them, section scenes keep the section order. */
  const overlays: Scene[] = [];
  const looks: FixtureValues[] = [];
  const effects: Effect[] = [];
  const events: TimelineEvent[] = [];
  const notices: string[] = [];
  const beat = 60 / analysis.bpm;
  const short = trackName.slice(0, 40);
  const ev = (e: Omit<TimelineEvent, 'id' | 'cueIndex' | 'lane'> & { lane?: number }): TimelineEvent => ({ id: randomUUID(), cueIndex: 0, lane: 0, ...e });
  const intent = parseIntent(plan.intent);
  const rigFixtures = [...index.fixtures.values()].filter((rf) => !isFog(rf));

  // Follow spot: one head (named so, else the first of at least two) lights the singer while a voice is detected.
  const vocals = analysis.events.filter((e) => e.kind === 'vocal');
  const singer = singerMarker(index.project.visualizer.markers);
  const heads = rigFixtures.filter((rf) => fixtureLayer(rf) === 'moving');
  const follow = vocals.length && singer && !intent.noFollow ? heads.find(isFollowSpot) ?? (heads.length >= 2 ? heads[0] : undefined) : undefined;
  if (vocals.length && !singer && heads.length >= 2 && !intent.noFollow) notices.push('Voix détectée : placez un repère « Chanteur » sur la scène pour une poursuite pendant le chant');

  const fades = analysis.sections.map((sec, i) => {
    const p = plan.sections[i]!, prev = plan.sections[i - 1];
    if (!prev) return 0;
    if (sec.label === 'drop') return 0; // hard cut on the drop
    return p.energy > prev.energy ? beat : Math.min(4 * beat * 2, sec.end - sec.start); // rise: 1 beat, fall: 2 bars
  });

  analysis.sections.forEach((sec, i) => {
    const p = plan.sections[i];
    if (!p) return;
    const label = `${String(i + 1).padStart(2, '0')} ${SECTION_NAMES[sec.label]}`;
    const name = `${short} · ${label}`;
    const len = sec.end - sec.start;
    const lit = litIds(index, p);
    const full = sceneValues(index, p, sec.cluster, lit, intent.noHaze);
    const ramped = p.extras.includes('ramp');
    const scene: Scene = { id: randomUUID(), name: name.slice(0, 80), notes: plan.intent.slice(0, 500), values: ramped ? scaleIntensity(full, RAMP_FROM) : full, origin: 'ai' };
    scenes.push(scene);
    looks[i] = full;
    const nextFade = fades[i + 1] ?? 0;
    // Overlap with the next section by its fade: this scene holds while the next one fades in (crossfade).
    events.push(ev({ kind: 'scene', refId: scene.id, start: sec.start, duration: len + nextFade, fade: fades[i]!, fadeOut: 0, label }));
    if (ramped) {
      // Intensities rise across the section from RAMP_FROM to the full level (HTP over the section scene).
      const rise: Scene = { id: randomUUID(), name: `${name} · progression`.slice(0, 80), notes: '', values: intensityOnly(full), origin: 'ai' };
      overlays.push(rise);
      events.push(ev({ kind: 'scene', refId: rise.id, start: sec.start, duration: len + nextFade, fade: len, fadeOut: nextFade, label: 'Progression', lane: 2 }));
    }
    const lights = [...lit].filter((id) => fixtureLayer(index.fixtures.get(id)!) !== 'moving');
    const movers = [...lit].filter((id) => fixtureLayer(index.fixtures.get(id)!) === 'moving' && id !== follow?.fixture.id);
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
    for (const e of [main, moveFor(`${name} · mouvement`, p, movers), ...extrasFor(index, name, p, lights, movers)]) {
      if (!e) continue;
      effects.push(e);
      events.push(ev({ kind: 'effect', refId: e.id, start: sec.start, duration: len, fade: 0, label: e.name.slice(-40), lane: 1 }));
    }
  });

  scenes.push(...overlays);

  // Accents: a short full-white hit on detected impacts inside accented sections (decays over one beat).
  const impacts = analysis.events.filter((e) => e.kind === 'impact' && analysis.sections.some((s, i) => plan.sections[i]?.accents && e.t >= s.start && e.t < s.end));
  if (impacts.length) {
    const accent: Scene = { id: randomUUID(), name: `${short} · accent`.slice(0, 80), notes: '', values: whiteHit(rigFixtures), origin: 'ai' };
    scenes.push(accent);
    for (const e of impacts) events.push(ev({ kind: 'scene', refId: accent.id, start: e.t, duration: beat, fade: 0, fadeOut: beat, label: 'Accent', lane: 2 }));
  }

  // Risers: the intensity of the coming section ramps up over the riser (dimmers only, so colours and positions
  // stay those of the current section until the cut).
  analysis.events.filter((e) => e.kind === 'riser' && e.duration > 0).forEach((r) => {
    const k = analysis.sections.findIndex((s) => Math.abs(s.start - (r.t + r.duration)) < beat);
    const target = looks[k];
    if (k <= 0 || !target) return;
    const ramp: Scene = { id: randomUUID(), name: `${short} · montée ${k + 1}`.slice(0, 80), notes: '', values: intensityOnly(target), origin: 'ai' };
    scenes.push(ramp);
    events.push(ev({ kind: 'scene', refId: ramp.id, start: r.t, duration: analysis.sections[k]!.start - r.t, fade: analysis.sections[k]!.start - r.t, fadeOut: 0, label: 'Montée', lane: 2 }));
  });

  if (follow && singer) {
    // Top lane: its position and colour win over the section look while the voice is heard.
    const values = { ...Object.fromEntries(dimmerKeys(follow).map((k) => [k, 1])), ...(colorCapability(follow) !== 'none' ? colorToAttributes(follow, FOLLOW_COLOR) : {}), ...aimAt(follow, markerPoint(singer)), ...beamToValues(follow, { gobo: 0, prism: false, frost: 0 }) };
    const spot: Scene = { id: randomUUID(), name: `${short} · poursuite`.slice(0, 80), notes: '', values: { [follow.fixture.id]: values }, origin: 'ai' };
    scenes.push(spot);
    for (const v of vocals) events.push(ev({ kind: 'scene', refId: spot.id, start: v.t, duration: v.duration, fade: 0.5, fadeOut: 0.5, label: 'Poursuite', lane: 3 }));
  }

  // Silences: scene events are cut around them (intensities merge HTP, so a dark scene on top would not darken).
  const silences = analysis.events.filter((e) => e.kind === 'silence');
  const cut: TimelineEvent[] = [];
  for (const e of events) {
    let pieces = [e];
    if (e.kind === 'scene') for (const s of silences) pieces = pieces.flatMap((p) => splitAround(p, s.t, s.t + s.duration));
    cut.push(...pieces.filter((p) => p.duration >= 0.05));
  }
  const timeline: Timeline = { id: randomUUID(), name: `Show · ${short}`.slice(0, 80), duration: Math.max(1, Math.ceil(analysis.duration)), loop: false, events: cut };
  return { scenes, effects, timeline, notices };
}
