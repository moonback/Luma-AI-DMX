import type { AttributeValues } from '../model/schemas';
import { clamp01, hexToRgb, type Rgb } from '../util/math';
import { coarseChannel, rangeAt, type ResolvedFixture } from './profiles';

export type ColorCapability = 'rgb' | 'rgbw' | 'cmy' | 'wheel' | 'none';

export function colorCapability(rf: ResolvedFixture): ColorCapability {
  const a = new Set(rf.attributes);
  if (a.has('red') && a.has('green') && a.has('blue')) return a.has('white') ? 'rgbw' : 'rgb';
  if (a.has('cyan') && a.has('magenta') && a.has('yellow')) return 'cmy';
  if (a.has('colorWheel')) return 'wheel';
  return 'none';
}

/**
 * Converts a target RGB colour into the attributes this fixture actually has.
 * Never assumes a channel layout: RGB, RGBW (white extraction), CMY and colour wheels are handled;
 * fixtures without colour capability get no colour attributes.
 */
export function colorToAttributes(rf: ResolvedFixture, rgb: Rgb): AttributeValues {
  const cap = colorCapability(rf);
  const r = clamp01(rgb.r), g = clamp01(rgb.g), b = clamp01(rgb.b);
  switch (cap) {
    case 'rgbw': {
      const w = Math.min(r, g, b);
      return { red: r - w, green: g - w, blue: b - w, white: w };
    }
    case 'rgb':
      return { red: r, green: g, blue: b };
    case 'cmy':
      return { cyan: 1 - r, magenta: 1 - g, yellow: 1 - b };
    case 'wheel': {
      const ch = coarseChannel(rf.mode, 'colorWheel');
      let best: { d: number; v: number } | undefined;
      for (const range of ch?.ranges ?? []) {
        if (range.kind !== 'color' || !range.color) continue;
        const c = hexToRgb(range.color);
        // Compare chromaticity so dim requests still match the right slot.
        const max = Math.max(r, g, b) || 1;
        const d = (c.r - r / max) ** 2 + (c.g - g / max) ** 2 + (c.b - b / max) ** 2;
        if (!best || d < best.d) best = { d, v: Math.round((range.from + range.to) / 2) / 255 };
      }
      return best ? { colorWheel: best.v } : {};
    }
    default:
      return {};
  }
}

const WARM_WHITE: Rgb = { r: 1, g: 0.9, b: 0.75 };

/** Approximate display colour (0..1, already multiplied by intensity). Not a photometric model. */
export function displayColor(rf: ResolvedFixture, v: AttributeValues): { color: Rgb; intensity: number } {
  const a = new Set(rf.attributes);
  let color: Rgb;
  if (a.has('red') || a.has('white')) {
    const w = v.white ?? 0, am = v.amber ?? 0, uv = v.uv ?? 0;
    color = {
      r: clamp01((v.red ?? 0) + w + am + uv * 0.4),
      g: clamp01((v.green ?? 0) + w + am * 0.6),
      b: clamp01((v.blue ?? 0) + w + uv * 0.9),
    };
  } else if (a.has('cyan')) {
    color = { r: 1 - (v.cyan ?? 0), g: 1 - (v.magenta ?? 0), b: 1 - (v.yellow ?? 0) };
  } else if (a.has('colorWheel')) {
    const ch = coarseChannel(rf.mode, 'colorWheel');
    const range = ch ? rangeAt(ch, Math.round((v.colorWheel ?? 0) * 255)) : undefined;
    color = range?.color ? hexToRgb(range.color) : WARM_WHITE;
  } else {
    color = WARM_WHITE;
  }
  let intensity = v.dimmer ?? 1;
  const shutter = coarseChannel(rf.mode, 'shutter');
  if (shutter && v.shutter !== undefined) {
    const range = rangeAt(shutter, Math.round(v.shutter * 255));
    if (range?.kind === 'closed') intensity = 0;
  }
  return { color, intensity: clamp01(intensity) };
}
