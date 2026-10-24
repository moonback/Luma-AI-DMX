import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from '../../util/math';
import type { AiAction } from '../actions';
import type { InterpreterContext } from './interpreter';

/*
 * Modifiers of the local interpreter relative to the current look (« plus chaud », « baisse de 20 % »): each targeted
 * fixture starts from its own colour or level, and fixtures outside `names` are never touched.
 */

/** Per-fixture « baisse de 20 % »: each targeted fixture keeps its own level, scaled by `factor`; unchanged ones (off) get no action. */
export function relativeLevels(ctx: InterpreterContext, names: string[], factor: number, fade: number): AiAction[] {
  const byLevel = new Map<number, string[]>();
  for (const f of ctx.fixtures) {
    if (!names.includes(f.name)) continue;
    const cur = ctx.current[f.id]?.level ?? 0;
    const level = Math.round(Math.min(1, Math.max(0, cur * factor)) * 100) / 100;
    if (Math.abs(level - cur) < 0.005) continue;
    byLevel.set(level, [...(byLevel.get(level) ?? []), f.name]);
  }
  return [...byLevel].map(([level, fixtureNames]) => ({ type: 'setIntensity' as const, target: { fixtureNames }, level, fade }));
}

/** Shifts the colour of the targeted fixtures that are lit, each from its own current colour. */
export function shiftCurrent(ctx: InterpreterContext, names: string[], fn: (hex: string) => string): AiAction[] {
  const byColor = new Map<string, string[]>();
  for (const f of ctx.fixtures) {
    if (!names.includes(f.name)) continue;
    const cur = ctx.current[f.id];
    if (!cur || cur.level <= 0.01) continue;
    if (!f.attributes.some((a) => ['red', 'colorWheel', 'cyan'].includes(a.split('#')[0]!))) continue;
    const next = fn(cur.color);
    const list = byColor.get(next) ?? [];
    list.push(f.name);
    byColor.set(next, list);
  }
  return [...byColor].map(([color, names]) => ({ type: 'setColor' as const, target: { fixtureNames: names }, color, fade: 3 }));
}

export const warmer = (hex: string) => {
  const hsv = rgbToHsv(hexToRgb(hex));
  const target = 0.08; // orange
  let d = target - hsv.h;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return rgbToHex(hsvToRgb(hsv.h + d * 0.4, Math.max(0.5, hsv.s), Math.max(0.6, hsv.v)));
};
export const cooler = (hex: string) => {
  const hsv = rgbToHsv(hexToRgb(hex));
  let d = 0.6 - hsv.h;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return rgbToHex(hsvToRgb(hsv.h + d * 0.4, Math.max(0.5, hsv.s), Math.max(0.6, hsv.v)));
};

