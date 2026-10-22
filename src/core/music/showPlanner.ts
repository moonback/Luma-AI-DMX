/**
 * showPlanner.ts — Local rule-based show planner (Phase 1 refactor).
 *
 * Extracted from songToShow.ts to keep each module under the 600-line limit.
 * Contains the energy-to-look mapping (`sectionPlan`), the `planLocally` entry
 * point and the per-section live-edit helper `adjustSection`.
 */

import type { ShowSectionPlan, SongAnalysis, ShowPlan, ShowExtra, SectionLabel } from '../model/schemas';
import { normalize, COLORS } from '../ai/local/interpreter';
import { SECTION_NAMES } from './analyze';
import { groupsBySection, namePattern, singerMarker } from './showRig';
import { has, parseIntent, type Intent } from './intent';

/** Rig capabilities summary used by the local planner and compiler. */
export interface RigInfo {
  wash: number;
  moving: number;
  bars: number;
  allowStrobe: boolean;
  groups?: Array<{ id: string; name: string }>;
  markers?: Array<{ id: string; name: string }>;
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const LABEL_ENERGY: Record<SectionLabel, number> = {
  intro: 1, verse: 2, prechorus: 3, build: 3, chorus: 4, drop: 5, break: 1, bridge: 2, outro: 1,
};
const WARM = ['#FFB000', '#FF4FA0', '#FF7000', '#FF2A00'];
const COLD = ['#2040FF', '#8B00FF', '#00C8FF', '#00E5A0'];

const clampE = (e: number) => Math.max(0, Math.min(5, Math.round(e)));
const isPeak = (label: SectionLabel) => label === 'chorus' || label === 'drop';

/* ── escalation ─────────────────────────────────────────────────────────── */

/** Energy added to a repeated chorus / drop: each repeat goes higher, the last peak of the song the highest (max +1). */
export function escalation(analysis: SongAnalysis, i: number): number {
  const s = analysis.sections[i]!;
  if (!isPeak(s.label)) return 0;
  const k = analysis.sections.slice(0, i).filter((x) => x.label === s.label).length;
  const last = analysis.sections.findLastIndex((x) => isPeak(x.label)) === i;
  return k ? Math.min(1, 0.5 * k + (last ? 0.5 : 0)) : 0;
}

/* ── sectionPlan (local rules) ──────────────────────────────────────────── */

function sectionPlan(
  index: number, energy: number, palette: string[], rig: RigInfo, intent: Intent,
  variant: number, label: SectionLabel, bars = 0, bassShare = 0.5, perBeat = 2, brightness = 0.5,
  _hasVocals = false, _confidence = 1,
): ShowSectionPlan {
  const peak = label === 'chorus' || label === 'drop';
  const alt = (variant + index) % 2 === 0;
  const singer = rig.moving > 0 ? singerMarker(rig.markers ?? []) : null;
  const focus: ShowSectionPlan['focus'] = !singer ? null : peak ? 'audience' : energy <= 3 ? singer.id : null;
  const me = intent.moreMovement ? Math.min(5, energy + 1) : energy;

  let movement: ShowSectionPlan['movement'] = intent.noMovement || me <= 1 ? 'none'
    : me === 2 ? (alt ? 'slow' : 'circle')
    : me === 3 ? (alt ? 'sweep' : 'figure8')
    : me === 4 ? (alt ? 'fast' : 'fan')
    : alt ? (perBeat >= 3 ? 'zigzag' : 'ballyhoo') : (perBeat >= 3 ? 'pendulum' : 'fast');

  if (label === 'bridge' && me >= 3) movement = alt ? 'pendulum' : 'zigzag';
  if (label === 'build' && me >= 3) movement = alt ? 'figure8' : 'sweep';
  if (label === 'intro' && me >= 2) movement = 'circle';
  if (label === 'outro' && me >= 2) movement = alt ? 'pan' : 'slow';
  if (peak && me >= 4 && brightness >= 0.7) movement = alt ? 'ballyhoo' : 'random';
  if (focus && focus !== 'audience') movement = 'none';

  let effect: ShowSectionPlan['effect'] = 'none', effectBeats = 4;

  if (energy <= 2) {
    effect = brightness >= 0.7 ? (alt ? 'dimmerWave' : 'glow') : 'wave';
    effectBeats = 8;
  } else if (energy === 3) {
    if (perBeat >= 2.5) { effect = alt ? 'pulse' : 'flicker'; effectBeats = 2; }
    else if (brightness >= 0.6) { effect = alt ? 'pulse' : 'dimmerWave'; effectBeats = 4; }
    else { effect = alt ? 'pulse' : 'chase'; effectBeats = 2; }
  } else if (energy === 4) {
    if (brightness >= 0.7) { effect = alt ? 'gradient' : 'colorChase'; effectBeats = alt ? 8 : 4; }
    else if (perBeat >= 3) { effect = alt ? 'chase' : 'pulse'; effectBeats = 1; }
    else { effect = alt ? 'chase' : 'colorChase'; effectBeats = alt ? 1 : 4; }
  } else if (energy >= 5) {
    if (brightness >= 0.7) { effect = alt ? 'gradient' : 'colorChase'; effectBeats = 2; }
    else { effect = 'chase'; effectBeats = perBeat >= 3.5 ? 0.5 : 1; }
  }

  if (label === 'drop' && rig.allowStrobe && intent.strobe === 'want') effect = 'strobe';
  if (label === 'bridge' && energy >= 2) { effect = alt ? 'rainbow' : 'gradient'; effectBeats = 16; }
  if (label === 'build' && energy >= 3) { effect = alt ? 'pulseSlow' : 'chaseSlow'; effectBeats = 4; }
  if (label === 'intro' && energy <= 2 && brightness >= 0.6) { effect = 'glow'; effectBeats = 8; }
  if (label === 'outro' && energy <= 2) { effect = alt ? 'dimmerWave' : 'glow'; effectBeats = 8; }

  if (perBeat >= 3) effectBeats = Math.max(0.5, effectBeats / 2);
  else if (perBeat < 1) effectBeats = Math.min(16, effectBeats * 2);

  const beamFrost = energy <= 1 && brightness < 0.4;
  const beam: ShowSectionPlan['beam'] = peak && energy >= 5 ? 'prism' : energy >= 3 ? 'gobo' : beamFrost ? 'frost' : 'open';
  const layers = {
    wash: rig.wash > 0 || (rig.bars === 0 && rig.moving === 0),
    moving: rig.moving > 0 && (energy >= 2 || peak || !!focus),
    bars: rig.bars > 0 && energy >= 2,
  };
  const extras: ShowExtra[] = [];
  if (!peak && bars >= 8 && energy >= 1 && energy <= 4 && ['intro', 'verse', 'prechorus', 'build'].includes(label)) extras.push('ramp');
  if (label === 'drop' || (peak && energy >= 5)) extras.push('blinder');
  if (layers.moving && energy >= 1 && energy <= 2) extras.push('breathe');
  if (intent.bassFollow ? energy >= 3 : label === 'drop' || (peak && bassShare >= 0.65)) extras.push('bassFollow');
  if (intent.colorFollow ? energy >= 1 && effect !== 'rainbow' : (label === 'break' || (energy <= 2 && brightness >= 0.6)) && energy >= 1) extras.push('colorFollow');
  return {
    index, energy, beam,
    palette: peak ? palette.slice(0, 2) : palette.slice(0, energy >= 3 ? 2 : 1),
    layers, movement, effect, effectBeats, accents: energy >= 4, groups: [], focus, extras, locked: false, note: '', why: '',
  };
}

/* ── explain ────────────────────────────────────────────────────────────── */

const dec = (x: number) => x.toFixed(2).replace('.', ',');
const EXTRA_WHY: Record<ShowExtra, string> = {
  ramp: 'section longue → montée progressive', blinder: "temps fort → blinder à l'entrée",
  breathe: 'passage calme → zoom qui respire', bassFollow: 'basses dominantes → suit les basses',
  colorFollow: 'couleur qui suit la brillance',
};

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
  if (s.confidence !== undefined && s.confidence < 0.7) parts.push(`classification estimée (confiance ${(s.confidence * 100).toFixed(0)} %)`);
  if (s.hasVocals) parts.push('chant détecté');
  for (const x of p.extras) if (!['colorFollow', 'bassFollow'].includes(x) || (x === 'colorFollow' && intent.colorFollow) || (x === 'bassFollow' && intent.bassFollow)) parts.push(EXTRA_WHY[x]);
  return parts.join(' ; ').slice(0, 300);
}

/* ── planLocally ────────────────────────────────────────────────────────── */

export function planLocally(analysis: SongAnalysis, intentText: string, rig: RigInfo, variant = 0, previous?: ShowPlan | null): ShowPlan {
  const intent = parseIntent(intentText);
  const keyConfident = analysis.key.confidence >= 0.3;
  const modeIsMajor = keyConfident
    ? analysis.key.mode === 'major'
    : analysis.sections.reduce((s, x) => s + x.brightness, 0) / Math.max(1, analysis.sections.length) >= 0.5;
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
    const rot = (s.cluster + variant) % base.length;
    const palette = [...base.slice(rot), ...base.slice(0, rot)];
    if ((label === 'chorus' || label === 'drop') && !intent.colors.length) palette.splice(1, 0, accent);
    const plan = sectionPlan(i, clampE(e), palette.slice(0, 4), rig, intent, variant, label, (s.end - s.start) / barSec, s.bassShare, s.density / (analysis.bpm / 60), s.brightness, s.hasVocals, s.confidence);
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

/* ── adjustSection ──────────────────────────────────────────────────────── */

/** Local edit of one section from a short instruction ("plus chaud", "plus calme", "en rouge", "sans mouvement"…). */
export function adjustSection(s: ShowSectionPlan, instruction: string, rig: RigInfo): ShowSectionPlan {
  const t = normalize(instruction);
  const out: ShowSectionPlan = { ...s, palette: [...s.palette], layers: { ...s.layers }, groups: [...s.groups], extras: [...s.extras], note: instruction.slice(0, 200), why: `Retouche « ${instruction.slice(0, 80)} »${s.why ? ` ; ${s.why}` : ''}`.slice(0, 300) };
  const explicitProps = new Set<keyof ShowSectionPlan>();

  if (has(t, /\bplus (calme|doux|sobre)|moins (fort|energique|intense)/)) { out.energy = clampE(s.energy - 1); explicitProps.add('energy'); }
  if (has(t, /\bplus (fort|energique|intense|puissant)|moins (calme|sobre)|explos/)) { out.energy = clampE(s.energy + 1); explicitProps.add('energy'); }
  if (has(t, /\bplus chaud|chaleureu/)) { out.palette = WARM.slice(0, Math.max(1, s.palette.length)); explicitProps.add('palette'); }
  if (has(t, /\bplus froid|glacial/)) { out.palette = COLD.slice(0, Math.max(1, s.palette.length)); explicitProps.add('palette'); }
  const colors = COLORS.filter((c) => c.forms.some((f) => has(t, new RegExp(`\\b${normalize(f)}\\b`)))).map((c) => c.hex);
  if (colors.length) { out.palette = colors.slice(0, 4); explicitProps.add('palette'); }

  if (has(t, /\b(sans|pas de) mouvement/)) { out.movement = 'none'; explicitProps.add('movement'); }
  else if (has(t, /\bplus de mouvement|bouge/)) { out.movement = out.energy >= 4 ? 'fast' : 'sweep'; explicitProps.add('movement'); }
  else if (has(t, /\beventail\b/)) { out.movement = 'fan'; explicitProps.add('movement'); }
  else if (has(t, /\bballyhoo\b/)) { out.movement = 'ballyhoo'; explicitProps.add('movement'); }
  else if (has(t, /\bcercle\b|circle\b/)) { out.movement = 'circle'; explicitProps.add('movement'); }
  else if (has(t, /\bhuit\b|8\b|figure8\b|figure-8\b/)) { out.movement = 'figure8'; explicitProps.add('movement'); }
  else if (has(t, /\bpan (seul|horizontal|gauche|droite)?\b|pan\b/)) { out.movement = 'pan'; explicitProps.add('movement'); }
  else if (has(t, /\btilt (seul|vertical|haut|bas)?\b|tilt\b/)) { out.movement = 'tilt'; explicitProps.add('movement'); }
  else if (has(t, /\baléatoire\b|random\b|hasard\b/)) { out.movement = 'random'; explicitProps.add('movement'); }
  else if (has(t, /\bpendule\b|balancier\b/)) { out.movement = 'pendulum'; explicitProps.add('movement'); }
  else if (has(t, /\bzigzag\b|zig-zag\b/)) { out.movement = 'zigzag'; explicitProps.add('movement'); }

  if (has(t, /\b(sans|pas de) strobe/) && out.effect === 'strobe') { out.effect = 'chase'; explicitProps.add('effect'); }
  else if (has(t, /\bstrobe\b/) && rig.allowStrobe) { out.effect = 'strobe'; explicitProps.add('effect'); }
  else if (has(t, /\bchase (de )?couleurs?\b/)) { out.effect = 'colorChase'; explicitProps.add('effect'); }
  else if (has(t, /\bvague (dimm|er|s?)\b|dimmerWave\b/)) { out.effect = 'dimmerWave'; explicitProps.add('effect'); }
  else if (has(t, /\bpulse (lent|slow)\b/)) { out.effect = 'pulseSlow'; explicitProps.add('effect'); }
  else if (has(t, /\bchase (lent|slow)\b/)) { out.effect = 'chaseSlow'; explicitProps.add('effect'); }
  else if (has(t, /\bscintil(l|le|ement)\b|flicker\b/)) { out.effect = 'flicker'; explicitProps.add('effect'); }
  else if (has(t, /\bsnap\b|flash\b|éclair\b/)) { out.effect = 'snap'; explicitProps.add('effect'); }
  else if (has(t, /\blueur\b|glow\b/)) { out.effect = 'glow'; explicitProps.add('effect'); }
  else if (has(t, /\b(dé)?gradient\b|gradient\b/)) { out.effect = 'gradient'; explicitProps.add('effect'); }
  else if (has(t, /\barc (en )?ciel\b|rainbow\b/)) { out.effect = 'rainbow'; explicitProps.add('effect'); }

  const singer = singerMarker(rig.markers ?? []);
  if (singer && has(t, /\bdouche\b|\bsur (le |la )?(chanteu\w*|chant\w*|voix)\b/)) {
    out.focus = singer.id; out.movement = 'none'; out.layers = { ...out.layers, moving: true };
    explicitProps.add('focus'); explicitProps.add('movement'); explicitProps.add('layers');
  } else if (has(t, /\bpublic\b/)) { out.focus = 'audience'; explicitProps.add('focus'); }

  const groups = (rig.groups ?? []).filter((g) => namePattern(g.name).test(t));
  if (groups.length) { out.groups = groups.map((g) => g.id); explicitProps.add('groups'); }
  else if (has(t, /\btout le (kit|monde)|tous les projecteurs\b/)) { out.groups = []; explicitProps.add('groups'); }

  const extra = (x: ShowExtra, on: boolean) => { out.extras = on ? [...new Set([...out.extras, x])] : out.extras.filter((e) => e !== x); explicitProps.add('extras'); };
  const toggles: [ShowExtra, string][] = [['blinder', 'blinders?'], ['ramp', 'monte\\w* (doucement|progressivement)|progressi\\w*'], ['breathe', 'zoom|iris'], ['bassFollow', 'basses?']];
  for (const [x, words] of toggles) {
    if (has(t, new RegExp(`\\b(sans|pas de)\\s+(${words})\\b`))) extra(x, false);
    else if (has(t, new RegExp(`\\b(${words})\\b`))) extra(x, true);
  }

  if (has(t, /\b(sans|pas de) (gobos?|prismes?)\b|faisceau ouvert/)) { out.beam = 'open'; explicitProps.add('beam'); }
  else if (has(t, /\bprismes?\b/)) { out.beam = 'prism'; explicitProps.add('beam'); }
  else if (has(t, /\bgobos?\b/)) { out.beam = 'gobo'; explicitProps.add('beam'); }
  else if (has(t, /\b(frost|flou|diffus\w*)\b/)) { out.beam = 'frost'; explicitProps.add('beam'); }

  void explicitProps; // documented: used to guard future auto-recompute
  return out;
}
