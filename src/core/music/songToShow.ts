import { randomUUID } from 'node:crypto';
import type { Cue, CueList, Effect, FixtureValues, Scene, ShowPlan, ShowSectionPlan, SongAnalysis, Timeline, TimelineEvent } from '../model/schemas';
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
import { aimAt, groupsBySection, isBlinder, isFog, isFollowSpot, markerPoint, memoAim, namePattern, singerMarker, stagePoint, type NamedRef } from './showRig';
import { has, parseIntent, withMood, type Intent } from './intent';
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

/* ---------------- Intent ---------------- */

const LABEL_ENERGY: Record<SectionLabel, number> = { intro: 1, verse: 2, prechorus: 3, build: 3, chorus: 4, drop: 5, break: 1, bridge: 2, outro: 1 };
const WARM = ['#FFB000', '#FF4FA0', '#FF7000', '#FF2A00'];
const COLD = ['#2040FF', '#8B00FF', '#00C8FF', '#00E5A0'];

/* ---------------- Local planner ---------------- */

const clampE = (e: number) => Math.max(0, Math.min(5, Math.round(e)));
const isPeak = (label: SectionLabel) => label === 'chorus' || label === 'drop';

/** Energy added to a repeated chorus / drop: each repeat goes higher, the last peak of the song the highest (max +1). */
export function escalation(analysis: SongAnalysis, i: number): number {
  const s = analysis.sections[i]!;
  if (!isPeak(s.label)) return 0;
  const k = analysis.sections.slice(0, i).filter((x) => x.label === s.label).length;
  const last = analysis.sections.findLastIndex((x) => isPeak(x.label)) === i;
  return k ? Math.min(1, 0.5 * k + (last ? 0.5 : 0)) : 0;
}

/** `bars`: section length in bars; `bassShare`: share of low-frequency energy; `perBeat`: onsets per beat; `brightness`: spectral centroid 0..1. */
function sectionPlan(index: number, energy: number, palette: string[], rig: RigInfo, intent: Intent, variant: number, label: SectionLabel, bars = 0, bassShare = 0.5, perBeat = 2, brightness = 0.5): ShowSectionPlan {
  const peak = label === 'chorus' || label === 'drop';
  const alt = (variant + index) % 2 === 0;
  // With a singer on stage: shower on them in the calm parts (still heads), sweep the audience on the peaks.
  const singer = rig.moving > 0 ? singerMarker(rig.markers ?? []) : null;
  const focus: ShowSectionPlan['focus'] = !singer ? null : peak ? 'audience' : energy <= 3 ? singer.id : null;
  const me = intent.moreMovement ? Math.min(5, energy + 1) : energy; // « beaucoup de mouvement »: heads one step livelier
  
  // Enhanced movement selection with more variety
  let movement: ShowSectionPlan['movement'] = intent.noMovement || me <= 1 ? 'none' : 
    me === 2 ? (alt ? 'slow' : 'circle') : 
    me === 3 ? (alt ? 'sweep' : 'figure8') : 
    me === 4 ? (alt ? 'fast' : 'fan') : 
    alt ? (perBeat >= 3 ? 'zigzag' : 'ballyhoo') : (perBeat >= 3 ? 'pendulum' : 'fast');
  
  // Special movements for specific labels and conditions
  if (label === 'bridge' && me >= 3) movement = alt ? 'pendulum' : 'zigzag';
  if (label === 'build' && me >= 3) movement = alt ? 'figure8' : 'sweep';
  if (label === 'intro' && me >= 2) movement = 'circle';
  if (label === 'outro' && me >= 2) movement = alt ? 'pan' : 'slow';
  
  // For high energy with high brightness, use more dynamic movements
  if (peak && me >= 4 && brightness >= 0.7) movement = alt ? 'ballyhoo' : 'random';
  
  if (focus && focus !== 'audience') movement = 'none';
  
  // Enhanced effect selection with more variety
  let effect: ShowSectionPlan['effect'] = 'none', effectBeats = 4;
  
  // Calm sections (energy 1-2)
  if (energy <= 2) {
    if (brightness >= 0.7) {
      effect = alt ? 'dimmerWave' : 'glow';
      effectBeats = 8;
    } else {
      effect = 'wave';
      effectBeats = 8;
    }
  }
  // Medium sections (energy 3)
  else if (energy === 3) {
    if (perBeat >= 2.5) {
      effect = alt ? 'pulse' : 'flicker';
      effectBeats = 2;
    } else if (brightness >= 0.6) {
      effect = alt ? 'pulse' : 'dimmerWave';
      effectBeats = 4;
    } else {
      effect = alt ? 'pulse' : 'chase';
      effectBeats = 2;
    }
  }
  // High energy sections (energy 4)
  else if (energy === 4) {
    if (brightness >= 0.7) {
      effect = alt ? 'gradient' : 'colorChase';
      effectBeats = alt ? 8 : 4;
    } else if (perBeat >= 3) {
      effect = alt ? 'chase' : 'pulse';
      effectBeats = 1;
    } else {
      effect = alt ? 'chase' : 'colorChase';
      effectBeats = alt ? 1 : 4;
    }
  }
  // Peak sections (energy 5)
  else if (energy >= 5) {
    if (brightness >= 0.7) {
      effect = alt ? 'gradient' : 'colorChase';
      effectBeats = 2;
    } else if (perBeat >= 3.5) {
      effect = 'chase';
      effectBeats = 0.5;
    } else {
      effect = 'chase';
      effectBeats = 1;
    }
  }
  
  // Special cases
  if (label === 'drop' && rig.allowStrobe && intent.strobe === 'want') effect = 'strobe';
  if (label === 'bridge' && energy >= 2) { effect = alt ? 'rainbow' : 'gradient'; effectBeats = 16; }
  if (label === 'build' && energy >= 3) { effect = alt ? 'pulseSlow' : 'chaseSlow'; effectBeats = 4; }
  if (label === 'intro' && energy <= 2 && brightness >= 0.6) { effect = 'glow'; effectBeats = 8; }
  if (label === 'outro' && energy <= 2) { effect = alt ? 'dimmerWave' : 'glow'; effectBeats = 8; }
  
  // Busy playing (≥ 3 onsets per beat) runs the effect twice as fast, sparse playing (< 1) half as fast.
  if (perBeat >= 3) effectBeats = Math.max(0.5, effectBeats / 2);
  else if (perBeat < 1) effectBeats = Math.min(16, effectBeats * 2);
  // Beam: prism on high-energy peaks, gobo on busy mid-energy sections, frost on calm dark sections.
  // brightness > 0.65 (bright, high-freq content) prefers open beam over frost even at low energy.
  const beamFrost = energy <= 1 && brightness < 0.4;
  const beam: ShowSectionPlan['beam'] = peak && energy >= 5 ? 'prism' : energy >= 3 ? 'gobo' : beamFrost ? 'frost' : 'open';
  const layers = { wash: rig.wash > 0 || (rig.bars === 0 && rig.moving === 0), moving: rig.moving > 0 && (energy >= 2 || peak || !!focus), bars: rig.bars > 0 && energy >= 2 };
  const extras: ShowExtra[] = [];
  if (!peak && bars >= 8 && energy >= 1 && energy <= 4 && ['intro', 'verse', 'prechorus', 'build'].includes(label)) extras.push('ramp');
  if (label === 'drop' || (peak && energy >= 5)) extras.push('blinder');
  if (layers.moving && energy >= 1 && energy <= 2) extras.push('breathe');
  // bassFollow: intent override, or drop/heavy-bass section (bassShare ≥ 0.65 is more reliable than 0.75).
  if (intent.bassFollow ? energy >= 3 : label === 'drop' || (peak && bassShare >= 0.65)) extras.push('bassFollow');
  // colorFollow: intent override, or bright calm section (spectral centroid high = melodic/airy).
  if (intent.colorFollow ? energy >= 1 && effect !== 'rainbow' : (label === 'break' || (energy <= 2 && brightness >= 0.6)) && energy >= 1) extras.push('colorFollow');
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
  if (escalation(analysis, i)) parts.push(`${SECTION_NAMES[s.label].toLowerCase()} répété → plus fort que le précédent`);
  if (intent.globalShift) parts.push(intent.globalShift < 0 ? 'ambiance calme demandée' : 'ambiance énergique demandée');
  if (intent.colors.length) parts.push('couleurs demandées');
  if (p.beam === 'frost' && s.brightness < 0.4) parts.push(`brillance faible (${dec(s.brightness)}) → faisceau diffus`);
  if (p.extras.includes('colorFollow') && !intent.colorFollow && s.brightness >= 0.6) parts.push(`brillance élevée (${dec(s.brightness)}) → couleur suit la brillance`);
  if (p.extras.includes('bassFollow') && !intent.bassFollow && s.bassShare >= 0.65) parts.push(`basses dominantes (${dec(s.bassShare)}) → suit les basses`);
  if (p.groups.length) parts.push(`groupes demandés : ${p.groups.map((g) => rig.groups?.find((x) => x.id === g)?.name).filter(Boolean).join(', ')}`);
  if (p.focus === 'audience') parts.push('balayage du public');
  else if (p.focus) parts.push(`douche sur ${rig.markers?.find((m) => m.id === p.focus)?.name ?? 'le repère'}`);
  for (const x of p.extras) if (!['colorFollow', 'bassFollow'].includes(x) || (x === 'colorFollow' && intent.colorFollow) || (x === 'bassFollow' && intent.bassFollow)) parts.push(EXTRA_WHY[x]);
  return parts.join(' ; ').slice(0, 300);
}

export function planLocally(analysis: SongAnalysis, intentText: string, rig: RigInfo, variant = 0, previous?: ShowPlan | null): ShowPlan {
  const intent = parseIntent(intentText);
  // Only use the detected mode to pick warm/cold when the key detection is confident enough.
  // Below 0.3 confidence the mode is unreliable; fall back to brightness (darker songs tend cold).
  const keyConfident = analysis.key.confidence >= 0.3;
  const modeIsMajor = keyConfident ? analysis.key.mode === 'major' : analysis.sections.reduce((s, x) => s + x.brightness, 0) / Math.max(1, analysis.sections.length) >= 0.5;
  const base = intent.colors.length ? intent.colors : intent.warmth === 'cold' || (!intent.warmth && !modeIsMajor) ? COLD : WARM;
  const accent = (intent.warmth === 'cold' || (!intent.warmth && !modeIsMajor) ? WARM : COLD)[variant % 4]!;
  const byLabel = groupsBySection(intentText, rig.groups ?? []);
  const barSec = (analysis.meter ?? 4) * 60 / analysis.bpm;
  const sections = analysis.sections.map((s, i): ShowSectionPlan => {
    const kept = previous?.sections[i];
    if (kept?.locked && previous!.sections.length === analysis.sections.length) return kept;
    const label = s.label;
    let e = 0.6 * LABEL_ENERGY[label] + 0.4 * s.energy * 5 + intent.globalShift;
    if (label === 'verse' || label === 'intro' || label === 'outro') e += intent.verseShift;
    if (label === 'chorus' || label === 'drop') e += intent.peakShift + escalation(analysis, i);
    // Same music (cluster) → same palette, rotated by the variant.
    const rot = (s.cluster + variant) % base.length;
    const palette = [...base.slice(rot), ...base.slice(0, rot)];
    if ((label === 'chorus' || label === 'drop') && !intent.colors.length) palette.splice(1, 0, accent);
    const plan = sectionPlan(i, clampE(e), palette.slice(0, 4), rig, intent, variant, label, (s.end - s.start) / barSec, s.bassShare, s.density / (analysis.bpm / 60), s.brightness);
    const out = { ...plan, groups: byLabel.get(label) ?? [] };
    return { ...out, why: explain(analysis, i, out, intent, rig) };
  });
  const peaks = analysis.sections.filter((s) => s.label === 'chorus' || s.label === 'drop').length;
  return {
    intent: intentText.slice(0, 500), provider: 'local', model: null, variant,
    summary: `${sections.length} sections, ${peaks} temps fort(s) ; palette ${intent.colors.length ? 'demandée' : (intent.warmth && { warm: 'chaude', cold: 'froide' }[intent.warmth]) ?? (!modeIsMajor ? `froide (${keyConfident ? 'tonalité mineure' : 'tonalité incertaine, brillance faible'})` : `chaude (${keyConfident ? 'tonalité majeure' : 'tonalité incertaine, brillance élevée'})`)}${intent.strobe === 'forbid' ? ', sans strobe' : ''}${intent.noMovement ? ', sans mouvement' : ''}${byLabel.size ? `, groupes : ${[...byLabel].map(([l, ids]) => `${SECTION_NAMES[l].toLowerCase()} → ${ids.map((id) => rig.groups!.find((g) => g.id === id)!.name).join(' + ')}`).join(', ')}` : ''}.`,
    sections,
  };
}

/** Local edit of one section from a short instruction ("plus chaud", "plus calme", "en rouge", "sans mouvement"…). */
export function adjustSection(s: ShowSectionPlan, instruction: string, rig: RigInfo): ShowSectionPlan {
  const t = normalize(instruction);
  const out: ShowSectionPlan = { ...s, palette: [...s.palette], layers: { ...s.layers }, groups: [...s.groups], extras: [...s.extras], note: instruction.slice(0, 200), why: `Retouche « ${instruction.slice(0, 80)} »${s.why ? ` ; ${s.why}` : ''}`.slice(0, 300) };
  
  // Track explicitly modified properties to avoid overwriting user choices
  const explicitProps = new Set<keyof ShowSectionPlan>();
  
  // Energy modifications
  if (has(t, /\bplus (calme|doux|sobre)|moins (fort|energique|intense)/)) {
    out.energy = clampE(s.energy - 1);
    explicitProps.add('energy');
  }
  if (has(t, /\bplus (fort|energique|intense|puissant)|moins (calme|sobre)|explos/)) {
    out.energy = clampE(s.energy + 1);
    explicitProps.add('energy');
  }
  
  // Palette modifications
  if (has(t, /\bplus chaud|chaleureu/)) {
    out.palette = WARM.slice(0, Math.max(1, s.palette.length));
    explicitProps.add('palette');
  }
  if (has(t, /\bplus froid|glacial/)) {
    out.palette = COLD.slice(0, Math.max(1, s.palette.length));
    explicitProps.add('palette');
  }
  const colors = COLORS.filter((c) => c.forms.some((f) => has(t, new RegExp(`\\b${normalize(f)}\\b`)))).map((c) => c.hex);
  if (colors.length) {
    out.palette = colors.slice(0, 4);
    explicitProps.add('palette');
  }
  
  // Movement modifications
  if (has(t, /\b(sans|pas de) mouvement/)) {
    out.movement = 'none';
    explicitProps.add('movement');
  } else if (has(t, /\bplus de mouvement|bouge/)) {
    out.movement = out.energy >= 4 ? 'fast' : 'sweep';
    explicitProps.add('movement');
  } else if (has(t, /\beventail\b/)) {
    out.movement = 'fan';
    explicitProps.add('movement');
  } else if (has(t, /\bballyhoo\b/)) {
    out.movement = 'ballyhoo';
    explicitProps.add('movement');
  } else if (has(t, /\bcercle\b|circle\b/)) {
    out.movement = 'circle';
    explicitProps.add('movement');
  } else if (has(t, /\bhuit\b|8\b|figure8\b|figure-8\b/)) {
    out.movement = 'figure8';
    explicitProps.add('movement');
  } else if (has(t, /\bpan (seul|horizontal|gauche|droite)?\b|pan\b/)) {
    out.movement = 'pan';
    explicitProps.add('movement');
  } else if (has(t, /\btilt (seul|vertical|haut|bas)?\b|tilt\b/)) {
    out.movement = 'tilt';
    explicitProps.add('movement');
  } else if (has(t, /\baléatoire\b|random\b|hasard\b/)) {
    out.movement = 'random';
    explicitProps.add('movement');
  } else if (has(t, /\bpendule\b|balancier\b/)) {
    out.movement = 'pendulum';
    explicitProps.add('movement');
  } else if (has(t, /\bzigzag\b|zig-zag\b/)) {
    out.movement = 'zigzag';
    explicitProps.add('movement');
  }
  
  // Effect modifications
  if (has(t, /\b(sans|pas de) strobe/) && out.effect === 'strobe') {
    out.effect = 'chase';
    explicitProps.add('effect');
  } else if (has(t, /\bstrobe\b/) && rig.allowStrobe) {
    out.effect = 'strobe';
    explicitProps.add('effect');
  } else if (has(t, /\bchase (de )?couleurs?\b/)) {
    out.effect = 'colorChase';
    explicitProps.add('effect');
  } else if (has(t, /\bvague (dimm|er|s?)\b|dimmerWave\b/)) {
    out.effect = 'dimmerWave';
    explicitProps.add('effect');
  } else if (has(t, /\bpulse (lent|slow)\b/)) {
    out.effect = 'pulseSlow';
    explicitProps.add('effect');
  } else if (has(t, /\bchase (lent|slow)\b/)) {
    out.effect = 'chaseSlow';
    explicitProps.add('effect');
  } else if (has(t, /\bscintil(l|le|ement)\b|flicker\b/)) {
    out.effect = 'flicker';
    explicitProps.add('effect');
  } else if (has(t, /\bsnap\b|flash\b|éclair\b/)) {
    out.effect = 'snap';
    explicitProps.add('effect');
  } else if (has(t, /\blueur\b|glow\b/)) {
    out.effect = 'glow';
    explicitProps.add('effect');
  } else if (has(t, /\b(dé)?gradient\b|gradient\b/)) {
    out.effect = 'gradient';
    explicitProps.add('effect');
  } else if (has(t, /\barc (en )?ciel\b|rainbow\b/)) {
    out.effect = 'rainbow';
    explicitProps.add('effect');
  }
  
  // Focus modifications
  const singer = singerMarker(rig.markers ?? []);
  if (singer && has(t, /\bdouche\b|\bsur (le |la )?(chanteu\w*|chant\w*|voix)\b/)) {
    out.focus = singer.id;
    out.movement = 'none';
    out.layers = { ...out.layers, moving: true };
    explicitProps.add('focus');
    explicitProps.add('movement');
    explicitProps.add('layers');
  } else if (has(t, /\bpublic\b/)) {
    out.focus = 'audience';
    explicitProps.add('focus');
  }
  
  // Groups modifications
  const groups = (rig.groups ?? []).filter((g) => namePattern(g.name).test(t));
  if (groups.length) {
    out.groups = groups.map((g) => g.id);
    explicitProps.add('groups');
  } else if (has(t, /\btout le (kit|monde)|tous les projecteurs\b/)) {
    out.groups = [];
    explicitProps.add('groups');
  }
  
  // Extras modifications
  const extra = (x: ShowExtra, on: boolean) => { 
    out.extras = on ? [...new Set([...out.extras, x])] : out.extras.filter((e) => e !== x); 
    explicitProps.add('extras');
  };
  const toggles: [ShowExtra, string][] = [['blinder', 'blinders?'], ['ramp', 'monte\\w* (doucement|progressivement)|progressi\\w*'], ['breathe', 'zoom|iris'], ['bassFollow', 'basses?']];
  for (const [x, words] of toggles) {
    if (has(t, new RegExp(`\\b(sans|pas de)\\s+(${words})\\b`))) {
      extra(x, false);
    } else if (has(t, new RegExp(`\\b(${words})\\b`))) {
      extra(x, true);
    }
  }
  
  // Beam modifications
  if (has(t, /\b(sans|pas de) (gobos?|prismes?)\b|faisceau ouvert/)) {
    out.beam = 'open';
    explicitProps.add('beam');
  } else if (has(t, /\bprismes?\b/)) {
    out.beam = 'prism';
    explicitProps.add('beam');
  } else if (has(t, /\bgobos?\b/)) {
    out.beam = 'gobo';
    explicitProps.add('beam');
  } else if (has(t, /\b(frost|flou|diffus\w*)\b/)) {
    out.beam = 'frost';
    explicitProps.add('beam');
  }
  
  // Note: We intentionally do NOT recompute energy-dependent properties (effect, movement, beam, etc.)
  // when energy changes. This preserves user's explicit choices and prevents silent overwrites.
  // The user must manually adjust dependent properties if needed.
  
  return out;
}

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
  const end = e.start + e.duration;
  if (b <= e.start || a >= end) return [e];
  const out: TimelineEvent[] = [];
  if (a > e.start) out.push({ ...e, duration: a - e.start });
  if (b < end) out.push({ ...e, id: randomUUID(), start: b, duration: end - b, fade: 0 });
  return out;
}

export function compileShow(index: ProjectIndex, trackName: string, analysis: SongAnalysis, plan: ShowPlan, opts: { maxStrobeHz: number; allowStrobe: boolean; phraseBars?: number }): CompileResult {
  // Number of bars per phrase for cue generation - smaller values create more cues/tableaux
  // Default is 8, but can be configured via opts.phraseBars
  // For backward compatibility, we use 8 bars by default
  const phraseBars = opts.phraseBars ?? 8;
  
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
    if (breathBefore(analysis.sections, i)) return 0; // hard cut after the blackout
    return p.energy > prev.energy ? beat : Math.min(4 * beat * 2, sec.end - sec.start); // rise: 1 beat, fall: 2 bars
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
    cut.push(...pieces.filter((p) => p.duration >= 0.05));
  }
  const timeline: Timeline = { id: randomUUID(), name: `Show · ${short}`.slice(0, 80), duration: Math.max(1, Math.ceil(analysis.duration)), loop: false, events: cut };
  // Follow trigger: a cue waits `wait` after the previous cue's fade, so the previous look holds until its step ends.
  const cues: Cue[] = cueSteps.map((s, k) => {
    const prev = cueSteps[k - 1];
    const trigger: Cue['trigger'] = prev ? { type: 'follow', wait: Math.max(0, s.t - prev.t - prev.fade) } : { type: 'manual' };
    return { id: randomUUID(), number: k + 1, name: s.label.slice(0, 80), description: '', sceneId: s.sceneId, fade: s.fade, delay: 0, curve: 'linear', trigger, effectIds: s.effectIds };
  });
  const cueList: CueList = { id: randomUUID(), name: `Show · ${short}`.slice(0, 80), priority: 50, loop: false, cues: cues.slice(0, 999) };
  return { scenes, effects, timeline, cueList, notices };
}
