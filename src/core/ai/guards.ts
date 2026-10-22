import { hexToRgb, rgbToHsv } from '../util/math';
import type { ProjectIndex } from '../engine/resolve';
import { aiTargetSchema, type AiAction, type AiProposal } from './actions';
import { previewValues } from './director';
import { EXCLUDE_RE, findTarget, namesOf, normalize, stripNegations, type InterpreterContext } from './local/interpreter';
import { resolveAiTarget } from './target';

/*
 * Deterministic checks around the model: what the operator forbade is enforced by code, whatever the model or the
 * (editable) prompt says. Same reading rules as the local interpreter.
 */

export interface PromptConstraints {
  /** Effect types the request negates (« sans strobe »). */
  effects: Set<string>;
  /** Colours the request negates (« pas de rouge »), as hex. */
  colors: Set<string>;
  /** « ne touche pas aux couleurs ». */
  noColor: boolean;
  /** Fixtures the request protects (« sauf les faces », « garde les contres »). */
  protectedNames: string[];
}

export function promptConstraints(prompt: string, ctx: InterpreterContext): PromptConstraints {
  const neg = stripNegations(normalize(prompt.trim()));
  const clause = EXCLUDE_RE.exec(neg.text)?.[2];
  const ex = clause ? findTarget(clause, ctx) : null;
  return { effects: neg.effects, colors: neg.colors, noColor: !!clause && /\b(couleurs?|colou?rs?)\b/.test(clause), protectedNames: ex && !ex.target.all ? namesOf(ex.target, ctx) : [] };
}

const COLOR_EFFECTS = ['rainbow', 'colorCycle', 'brightnessColor'];

function effectsOf(a: AiAction): string[] {
  if (a.type === 'startEffect') return [a.effect.effectType];
  if (a.type === 'createSequence') return a.cues.flatMap((c) => c.effects.map((e) => e.effectType));
  return [];
}

function colorsOf(a: AiAction): string[] {
  const look = (parts: { color?: string; colors?: string[] }[]) => parts.flatMap((p) => [...(p.color ? [p.color] : []), ...(p.colors ?? [])]);
  switch (a.type) {
    case 'setColor': return look([a]);
    case 'createScene': return look(a.look);
    case 'startEffect': return a.effect.colors ?? [];
    case 'createSequence': return a.cues.flatMap((c) => [...look(c.look), ...c.effects.flatMap((e) => e.colors ?? [])]);
    default: return [];
  }
}

/** Same named colour: close hue for saturated colours, low saturation for white. */
function sameColor(hex: string, negated: string): boolean {
  const x = rgbToHsv(hexToRgb(hex)), y = rgbToHsv(hexToRgb(negated));
  if (y.s < 0.2) return x.s < 0.2 && x.v > 0.7;
  const d = Math.abs(x.h - y.h);
  return x.s >= 0.3 && Math.min(d, 1 - d) < 0.05;
}

/** Rejects the actions that break a constraint of the request; returns how many (mutates the proposal, refreshes its preview). */
export function enforceConstraints(p: AiProposal, c: PromptConstraints, index: ProjectIndex): number {
  const protectedIds = new Set(c.protectedNames.flatMap((n) => resolveAiTarget(index, { fixtureNames: [n] }).ids));
  let rejected = 0;
  for (const v of p.actions) {
    if (v.status === 'rejected' || !v.action) continue;
    const fx = effectsOf(v.action), colors = colorsOf(v.action);
    const touched = v.fixtureIds.filter((id) => protectedIds.has(id)).map((id) => index.fixtures.get(id)?.fixture.name ?? id);
    const why = [
      ...fx.filter((e) => c.effects.has(e)).map((e) => `effet ${e} exclu par la demande`),
      ...colors.filter((h) => [...c.colors].some((n) => sameColor(h, n))).map((h) => `couleur ${h} exclue par la demande`),
      ...(c.noColor && (colors.length || fx.some((e) => COLOR_EFFECTS.includes(e))) ? ['la demande interdit de changer les couleurs'] : []),
      ...(touched.length ? [`modifie des projecteurs protégés par la demande (${touched.slice(0, 5).join(', ')}${touched.length > 5 ? '…' : ''})`] : []),
    ];
    if (!why.length) continue;
    v.status = 'rejected';
    v.messages.push(`Contrainte non respectée : ${[...new Set(why)].join(' ; ')}`);
    rejected++;
  }
  if (rejected) p.preview = previewValues(index, p.actions);
  return rejected;
}

/**
 * `adjustIntensity` (model output only, not an engine action): « baisse de 20 % » becomes one setIntensity per current
 * level, so the proposal and its preview show the real resulting levels.
 */
export function expandRelativeIntensity(raws: readonly unknown[], index: ProjectIndex, current: Record<string, { level: number }>): unknown[] {
  return raws.flatMap((raw) => {
    const r = raw as { type?: unknown; target?: unknown; factor?: unknown; fade?: unknown } | null;
    if (r?.type !== 'adjustIntensity') return [raw];
    const target = aiTargetSchema.safeParse(r.target ?? {});
    if (typeof r.factor !== 'number' || !Number.isFinite(r.factor) || !target.success) return [raw]; // refused downstream
    const factor = Math.min(4, Math.max(0, r.factor));
    const fade = typeof r.fade === 'number' ? r.fade : 2;
    const byLevel = new Map<number, string[]>();
    for (const id of resolveAiTarget(index, target.data).ids) {
      const level = Math.round(Math.min(1, (current[id]?.level ?? 0) * factor) * 100) / 100;
      byLevel.set(level, [...(byLevel.get(level) ?? []), index.fixtures.get(id)!.fixture.name]);
    }
    // Nothing resolved: keep the target so validation reports why (unknown group…).
    if (!byLevel.size) return [{ type: 'setIntensity', target: target.data, level: 0, fade }];
    return [...byLevel].map(([level, fixtureNames]) => ({ type: 'setIntensity', target: { fixtureNames }, level, fade }));
  });
}
