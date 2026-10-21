import type { SectionLabel, StageMarker } from '../model/schemas';
import type { ResolvedFixture } from '../fixtures/profiles';
import { escapeRe, normalize } from '../ai/local/interpreter';
import { beamDirection, type Vec3 } from '../visualizer/beam';
import { mountOf, tiltDegrees } from '../visualizer/model';

/** Song-to-Show helpers tied to the project rig: named groups in the intent, stage markers, aiming the heads. */

export interface NamedRef { id: string; name: string }

const SECTION_WORDS: [RegExp, SectionLabel][] = [
  [/\bpre-? ?refrains?\b/, 'prechorus'], [/\bcouplets?\b/, 'verse'], [/\b(refrains?|chorus)\b/, 'chorus'], [/\bdrops?\b/, 'drop'],
  [/\bintro\b/, 'intro'], [/\b(outro|fin)\b/, 'outro'], [/\bponts?\b/, 'bridge'], [/\bbreaks?\b/, 'break'], [/\b(montees?|builds?)\b/, 'build'],
];

/** "face", "faces", "Contres" → a word pattern accepting the singular and the plural. */
export const namePattern = (name: string) => new RegExp(`\\b${escapeRe(normalize(name).trim().replace(/[sx]$/, ''))}[sx]?\\b`);

/**
 * Group names tied to section words in the same clause: « contres en couplet, faces au refrain » →
 * verse → [contres], chorus → [faces]. Clauses split on punctuation and « et ».
 */
export function groupsBySection(text: string, groups: readonly NamedRef[]): Map<SectionLabel, string[]> {
  const out = new Map<SectionLabel, string[]>();
  const named = groups.filter((g) => normalize(g.name).trim().length > 1);
  for (let clause of normalize(text).split(/[,.;]|\bet\b|\bpuis\b/)) {
    const ids = named.filter((g) => namePattern(g.name).test(clause)).map((g) => g.id);
    if (!ids.length) continue;
    for (const g of named) clause = clause.replace(namePattern(g.name), ' ');
    for (const [re, label] of SECTION_WORDS) {
      if (!re.test(clause)) continue;
      clause = clause.replace(re, ' ');
      out.set(label, [...new Set([...(out.get(label) ?? []), ...ids])]);
    }
  }
  return out;
}

/** The lead singer's marker (by name), else null. */
export function singerMarker<T extends NamedRef>(markers: readonly T[]): T | null {
  return markers.find((m) => /\b(chant\w*|voix|vocal\w*|singer|lead|solist\w*)\b/.test(normalize(m.name))) ?? null;
}

/** Stage point (meters, y upstage, height) → world coordinates of the 3D rig (z towards the audience). */
export const stagePoint = (x: number, y: number, height: number): Vec3 => ({ x, y: height, z: -y });
export const markerPoint = (m: StageMarker): Vec3 => stagePoint(m.x, m.y, m.height);

/**
 * Pan/tilt values (0..1) aiming the fixture's beam at a world point: grid search refined twice, using the same
 * geometry as the 3D view (mount, rotation, tilt travel). Ties go to the pan closest to centre.
 */
export function aimAt(rf: ResolvedFixture, target: Vec3): { pan?: number; tilt?: number } {
  const f = rf.fixture, phys = rf.profile.physical;
  const hasPan = rf.attributes.includes('pan'), hasTilt = rf.attributes.includes('tilt');
  if (!hasPan && !hasTilt) return {};
  const d = { x: target.x - f.position.x, y: target.y - f.height, z: target.z + f.position.y };
  const len = Math.hypot(d.x, d.y, d.z) || 1;
  const want = { x: d.x / len, y: d.y / len, z: d.z / len };
  const base = { movable: true, rotation: f.rotation, mount: mountOf(f), mountTilt: f.mountTilt ?? 0 };
  const score = (pan: number, tilt: number) => {
    const b = beamDirection({ ...base, panDeg: (pan - 0.5) * phys.panRange, tiltDeg: tiltDegrees(phys, tilt) });
    return b.x * want.x + b.y * want.y + b.z * want.z - 0.002 * Math.abs(pan - 0.5);
  };
  let best = { pan: 0.5, tilt: 0.5, s: -Infinity };
  const search = (pc: number, tc: number, span: number, steps: number) => {
    for (let a = -steps; a <= steps; a++) for (let b = -steps; b <= steps; b++) {
      const pan = hasPan ? Math.min(1, Math.max(0, pc + (a * span) / steps)) : 0.5;
      const tilt = hasTilt ? Math.min(1, Math.max(0, tc + (b * span) / steps)) : 0.5;
      const s = score(pan, tilt);
      if (s > best.s) best = { pan, tilt, s };
    }
  };
  search(0.5, 0.5, 0.5, 24);
  search(best.pan, best.tilt, 1 / 24, 6);
  search(best.pan, best.tilt, 1 / 144, 6);
  return { ...(hasPan ? { pan: best.pan } : {}), ...(hasTilt ? { tilt: best.tilt } : {}) };
}

/**
 * `aimAt` memoised per fixture object and target, for one compile: sections repeat the same resting / marker aims.
 * Scope it to a single call over one ProjectIndex (its fixtures do not change meanwhile), so nothing can go stale.
 */
export function memoAim(): typeof aimAt {
  const memo = new Map<ResolvedFixture, Map<string, ReturnType<typeof aimAt>>>();
  return (rf, t) => {
    let per = memo.get(rf);
    if (!per) memo.set(rf, per = new Map());
    const key = `${t.x},${t.y},${t.z}`;
    let r = per.get(key);
    if (!r) per.set(key, r = aimAt(rf, t));
    return r;
  };
}

export const isFog =(rf: ResolvedFixture) => rf.attributes.includes('fog');
/** Blinders: named or tagged so, else the conventional dimmer fixtures. */
export const isBlinder = (rf: ResolvedFixture) => [rf.fixture.name, ...rf.fixture.tags].some((t) => /blind/i.test(t)) || rf.profile.type === 'dimmer';
/** Follow spot for the vocals: a moving head named or tagged so, else the first one. */
export const isFollowSpot = (rf: ResolvedFixture) => [rf.fixture.name, ...rf.fixture.tags].some((t) => /poursuite|follow/i.test(normalize(t)));
