import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { Channel, ChannelRange, FixtureMode, FixtureProfile, FixtureType } from '../model/schemas';
import { dedupeRanges, slug } from './ofl';
import { validateProfile } from './profiles';
import { readZip, ZipError } from '../util/zip';

/**
 * Converter from a GDTF file (DIN SPEC 15800: a ZIP holding `description.xml`) to a Luma profile with all its DMX
 * modes. Covers coarse/fine/ultra offsets, channel functions as ranges (strobe Hz from PhysicalFrom/To), channel
 * sets and wheel slots (CIE xyY colours), control channels flagged dangerous, repeated geometries as cells, pan/tilt
 * travel and beam angle. DMX breaks other than the first are not modelled. Never throws.
 * Imported profiles must be checked against the fixture manual before a show.
 */
export interface GdtfConversion {
  profile: FixtureProfile | null;
  warnings: string[];
  errors: string[];
}

type Node = Record<string, unknown>;
const ARRAYS = new Set(['DMXMode', 'DMXChannel', 'LogicalChannel', 'ChannelFunction', 'ChannelSet', 'Wheel', 'Slot', 'Geometry', 'Axis', 'Beam', 'GeometryReference', 'FilterBeam', 'Display']);
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', parseAttributeValue: false, parseTagValue: false, isArray: (name, _path, _leaf, isAttribute) => !isAttribute && ARRAYS.has(name) });
const node = (v: unknown): Node => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Node) : {});
const arr = (n: Node, key: string): Node[] => (Array.isArray(n[key]) ? (n[key] as unknown[]).map(node) : []);
const str = (n: Node, key: string): string | undefined => (typeof n[key] === 'string' ? (n[key] as string).trim() || undefined : undefined);
const num = (n: Node, key: string): number | undefined => {
  const v = Number(str(n, key));
  return str(n, key) !== undefined && Number.isFinite(v) ? v : undefined;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** GDTF DMX value « value/bytes » (« 32768/2 », « 255/1 », or a bare number) → 8-bit coarse value. */
export function dmx8(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const [v, b] = raw.split('/');
  const value = Number(v), bytes = b === undefined ? 1 : Number(b);
  if (!Number.isFinite(value) || !Number.isInteger(bytes) || bytes < 1 || bytes > 4) return undefined;
  return clamp(Math.floor(value / 256 ** (bytes - 1)), 0, 255);
}
/** Same value at 16 bits (for the default of a channel with a fine byte). */
function dmx16(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const [v, b] = raw.split('/');
  const value = Number(v), bytes = b === undefined ? 1 : Number(b);
  if (!Number.isFinite(value) || !Number.isInteger(bytes) || bytes < 1 || bytes > 4) return undefined;
  return clamp(Math.round(bytes >= 2 ? value / 256 ** (bytes - 2) : value * 257), 0, 65535);
}

/** GDTF attribute → Luma attribute. */
const GDTF_ATTR: Record<string, string> = {
  Dimmer: 'dimmer', Pan: 'pan', Tilt: 'tilt', PositionMSpeed: 'panTiltSpeed', PanTiltMode: 'panTiltMode',
  Shutter1: 'shutter', Shutter1Strobe: 'strobe', StrobeFrequency: 'strobe', StrobeDuration: 'strobe',
  ColorAdd_R: 'red', ColorAdd_G: 'green', ColorAdd_B: 'blue', ColorAdd_W: 'white', ColorAdd_WW: 'warmWhite', ColorAdd_CW: 'coldWhite',
  ColorAdd_A: 'amber', ColorAdd_RY: 'amber', ColorAdd_UV: 'uv', ColorAdd_L: 'lime', ColorAdd_I: 'indigo',
  ColorRGB_Red: 'red', ColorRGB_Green: 'green', ColorRGB_Blue: 'blue', ColorRGB_White: 'white',
  ColorSub_C: 'cyan', ColorSub_M: 'magenta', ColorSub_Y: 'yellow', CTO: 'cto', CTC: 'colorTemperature', CTB: 'colorTemperature',
  Color1: 'colorWheel', ColorMacro1: 'colorMacro', ColorMixMSpeed: 'colorMacroFade',
  Gobo1: 'gobo', Gobo1Pos: 'goboRotation', Gobo1PosRotate: 'goboRotation', Gobo2: 'gobo2', Gobo2Pos: 'gobo2Rotation', Gobo2PosRotate: 'gobo2Rotation',
  Prism1: 'prism', Prism1Pos: 'prismIndex', Prism1PosRotate: 'prismRotation', Frost1: 'frost', Iris: 'iris', Focus1: 'focus', Zoom: 'zoom', ZoomModeSpot: 'zoomMode',
  Effects1: 'effectWheel', Control1: 'control', ResetAll: 'control', LampControl: 'control', FixtureGlobalReset: 'control', Function: 'control',
  Fans: 'fan', Fog: 'fog', Haze: 'fog', DimmerCurve: 'dimmerCurve', EffectsSync: 'macroSpeed', Macro: 'macro', GlobalMSpeed: 'speed',
};
const CONTINUOUS = new Set(['dimmer', 'pan', 'tilt', 'zoom', 'focus', 'iris', 'panTiltSpeed', 'red', 'green', 'blue', 'white', 'amber', 'uv', 'warmWhite', 'coldWhite', 'lime', 'indigo', 'cyan', 'magenta', 'yellow', 'cto', 'colorTemperature']);
/** A channel's Luma attribute: from its logical channel, or a known function inside it (strobe-only channels…). */
function lumaAttribute(lc: Node): string | null {
  const a = str(lc, 'Attribute') ?? '';
  if (GDTF_ATTR[a]) return GDTF_ATTR[a]!;
  for (const f of arr(lc, 'ChannelFunction')) {
    const fa = str(f, 'Attribute') ?? '';
    if (/^Shutter\dStrobe/u.test(fa)) return 'strobe';
  }
  return null;
}

/** CIE 1931 xyY (« 0.64,0.33,21.3 ») → sRGB hex, brightness normalised. */
export function cieToHex(raw: string | undefined): string | undefined {
  const [x, y] = (raw ?? '').split(',').map(Number);
  if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y) || y <= 0) return undefined;
  const X = x / y, Z = (1 - x - y) / y;
  const lin = [3.2406 * X - 1.5372 - 0.4986 * Z, -0.9689 * X + 1.8758 + 0.0415 * Z, 0.0557 * X - 0.204 + 1.057 * Z].map((v) => Math.max(0, v));
  const max = Math.max(...lin, 1e-9);
  return `#${lin.map((v) => {
    const c = v / max;
    const s = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return clamp(Math.round(s * 255), 0, 255).toString(16).padStart(2, '0');
  }).join('').toUpperCase()}`;
}

function shutterKind(fnAttr: string, name: string): ChannelRange['kind'] {
  if (/Random/u.test(fnAttr)) return 'random';
  if (/Pulse/u.test(fnAttr)) return 'pulse';
  if (/Strobe/u.test(fnAttr)) return 'strobe';
  if (/clos/iu.test(name)) return 'closed';
  if (/open/iu.test(name)) return 'open';
  return 'other';
}
function setKind(name: string, attr: string | null): ChannelRange['kind'] {
  if (attr === 'control') return /reset/iu.test(name) ? 'reset' : /lamp.*off/iu.test(name) ? 'lamp-off' : /lamp.*on/iu.test(name) ? 'lamp-on' : 'other';
  if (/shake/iu.test(name)) return 'shake';
  if (/\bopen\b/iu.test(name)) return 'open';
  return attr === 'colorWheel' ? 'color' : attr === 'gobo' || attr === 'gobo2' ? 'gobo' : 'other';
}
const isDangerous = (attr: string | null, name: string) => attr === 'control' && /reset|lamp|calibrat/iu.test(name);
const label = (s: string | undefined, d: string) => (s ?? d).slice(0, 64) || d;

/** Ranges of a DMX channel: one per channel function when several, else its channel sets, else nothing (fader). */
function channelRanges(ch: Node, attr: string | null, wheels: Node[]): ChannelRange[] {
  const fns = arr(ch, 'LogicalChannel').flatMap((lc) => arr(lc, 'ChannelFunction'))
    .map((f) => ({ f, from: dmx8(str(f, 'DMXFrom')) ?? 0 }))
    .sort((a, b) => a.from - b.from);
  const toOf = (i: number, list: { from: number }[], max = 255) => Math.max(list[i]!.from, (list[i + 1]?.from ?? max + 1) - 1);
  if (fns.length > 1) {
    return fns.map(({ f, from }, i): ChannelRange => {
      const fa = str(f, 'Attribute') ?? '';
      const name = str(f, 'Name') ?? fa;
      const kind = attr === 'shutter' || attr === 'strobe' ? shutterKind(fa, name) : setKind(name, attr);
      const pf = num(f, 'PhysicalFrom'), pt = num(f, 'PhysicalTo');
      const hz = (kind === 'strobe' || kind === 'pulse' || kind === 'random') && pf !== undefined && pt !== undefined && pf >= 0 && pt >= 0 && pf <= 100 && pt <= 100;
      return {
        from, to: toOf(i, fns), label: label(name, 'Fonction'), kind, dangerous: isDangerous(attr, name),
        ...(hz ? { hzFrom: pf, hzTo: pt } : {}),
        ...(!hz && pf !== undefined && pt !== undefined && pf !== pt ? { physFrom: pf, physTo: pt } : {}),
      };
    });
  }
  const only = fns[0];
  if (!only) return [];
  const wheel = wheels.find((w) => str(w, 'Name') === str(only.f, 'Wheel'));
  const slots = wheel ? arr(wheel, 'Slot') : [];
  const sets = arr(only.f, 'ChannelSet').map((s) => ({ s, from: dmx8(str(s, 'DMXFrom')) ?? only.from })).sort((a, b) => a.from - b.from);
  if (sets.length > 1 || (sets.length === 1 && !(attr && CONTINUOUS.has(attr)))) {
    return sets.map(({ s, from }, i): ChannelRange => {
      const slotIndex = num(s, 'WheelSlotIndex');
      const slot = slotIndex !== undefined ? slots[slotIndex - 1] : undefined;
      const name = str(s, 'Name') ?? (slot ? str(slot, 'Name') : undefined) ?? `Valeur ${from}`;
      const kind = attr === 'shutter' || attr === 'strobe' ? shutterKind(str(only.f, 'Attribute') ?? '', name) : setKind(name, attr);
      const color = kind === 'color' && slot ? cieToHex(str(slot, 'Color')) : undefined;
      return { from, to: toOf(i, sets), label: label(name, 'Fonction'), kind, ...(color ? { color } : {}), dangerous: isDangerous(attr, name) };
    }).filter((r) => r.label !== '');
  }
  if (!(attr && CONTINUOUS.has(attr))) return [{ from: 0, to: 255, label: label(str(only.f, 'Name'), 'Fonction'), kind: 'other', dangerous: isDangerous(attr, str(only.f, 'Name') ?? '') }];
  return [];
}

/** Every node of the geometry tree (Geometry, Axis, Beam… and their children). */
function* geometries(n: Node): Generator<Node & { _tag: string }> {
  for (const [k, v] of Object.entries(n)) {
    if (!Array.isArray(v)) continue;
    for (const child of v.map(node)) {
      yield Object.assign(child, { _tag: k });
      yield* geometries(child);
    }
  }
}

function fixtureType(attrs: Set<string>, cells: number): FixtureType {
  if (attrs.has('pan') && attrs.has('tilt')) return attrs.has('gobo') ? 'moving-head-spot' : 'moving-head-wash';
  if (cells > 1) return 'led-bar';
  if (attrs.has('strobe') && !['red', 'white', 'dimmer'].some((a) => attrs.has(a))) return 'strobe';
  if (['red', 'green', 'blue', 'white', 'colorWheel'].some((a) => attrs.has(a))) return 'par';
  return attrs.has('dimmer') ? 'dimmer' : 'other';
}

export function convertGdtf(file: Uint8Array): GdtfConversion {
  const warnings: string[] = [];
  const fail = (msg: string): GdtfConversion => ({ profile: null, warnings, errors: [msg] });
  let xml: string;
  try {
    const zip = readZip(file);
    const desc = zip.read('description.xml');
    if (!desc) return fail('Fichier GDTF sans description.xml');
    xml = Buffer.from(desc).toString('utf8');
  } catch (err) {
    return fail(err instanceof ZipError ? `Fichier GDTF illisible : ${err.message}` : `Fichier GDTF illisible : ${(err as Error).message}`);
  }
  const valid = XMLValidator.validate(xml);
  if (valid !== true) return fail(`description.xml invalide (ligne ${valid.err.line}) : ${valid.err.msg}`);
  const ft = node(node(parser.parse(xml)).GDTF).FixtureType;
  const fx = node(ft);
  if (!str(fx, 'Name')) return fail('description.xml sans <GDTF><FixtureType>');
  const wheels = arr(node(fx.Wheels), 'Wheel');
  const geo = [...geometries(node(fx.Geometries))];
  const dmxModes = arr(node(fx.DMXModes), 'DMXMode');
  if (!dmxModes.length) return fail('Aucun mode DMX (<DMXModes>) dans le fichier');

  const allAttrs = new Set<string>();
  let maxCells = 0;
  let pan: [number, number] | undefined, tilt: [number, number] | undefined;
  const modes: FixtureMode[] = [];
  for (const dm of dmxModes) {
    const modeName = (str(dm, 'Name') ?? `Mode ${modes.length + 1}`).slice(0, 48);
    const chans = arr(node(dm.DMXChannels), 'DMXChannel');
    // Repeated geometries (pixels, cells): a Luma attribute met on several geometries is split into cells.
    const geomsByAttr = new Map<string, string[]>();
    for (const ch of chans) {
      const a = lumaAttribute(arr(ch, 'LogicalChannel')[0] ?? {});
      const g = str(ch, 'Geometry') ?? '';
      if (!a) continue;
      const list = geomsByAttr.get(a) ?? [];
      if (!list.includes(g)) list.push(g);
      geomsByAttr.set(a, list);
    }
    const repeated: string[] = [];
    for (const list of geomsByAttr.values()) if (list.length > 1) for (const g of list) if (!repeated.includes(g)) repeated.push(g);
    maxCells = Math.max(maxCells, repeated.length);

    const byAddr = new Map<number, Channel>();
    const used = new Set<string>();
    const generic = (name: string): Channel => {
      let attr = `custom:${slug(name)}`;
      for (let n = 2; used.has(attr); n++) attr = `custom:${slug(name).slice(0, 26)}-${n}`;
      used.add(attr);
      return { name: name.slice(0, 48), attribute: attr, fine: false, default: 0, ranges: [] };
    };
    const place = (addr: number, ch: Channel, what: string) => {
      if (addr < 1 || addr > 512) warnings.push(`${modeName} · ${what} : canal ${addr} hors 1..512, ignoré`);
      else if (byAddr.has(addr)) warnings.push(`${modeName} · ${what} : canal ${addr} déjà utilisé, ignoré`);
      else byAddr.set(addr, ch);
    };
    for (const ch of chans) {
      const lc = arr(ch, 'LogicalChannel')[0] ?? {};
      const gAttr = str(lc, 'Attribute') ?? '?';
      const offsets = (str(ch, 'Offset') ?? '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
      if (!offsets.length) continue; // virtual channel (no DMX footprint)
      if ((num(ch, 'DMXBreak') ?? 1) !== 1) { warnings.push(`${modeName} · ${gAttr} : DMX break ${str(ch, 'DMXBreak')} non pris en charge, ignoré`); continue; }
      const geomName = str(ch, 'Geometry') ?? '';
      const cellIdx = repeated.indexOf(geomName);
      const cell = cellIdx >= 0 ? cellIdx + 1 : undefined;
      let attr = lumaAttribute(lc);
      const key = (a: string) => (cell ? `${a}#${cell}` : a);
      if (!attr) warnings.push(`Attribut GDTF « ${gAttr} » non reconnu, converti en canal générique`);
      else if (used.has(key(attr))) { warnings.push(`${modeName} · « ${gAttr} » duplique ${key(attr)}, converti en canal générique`); attr = null; }
      const fns = arr(lc, 'ChannelFunction');
      const initial = fns.find((f) => `${geomName}_${gAttr}.${gAttr}.${str(f, 'Name')}` === str(ch, 'InitialFunction')) ?? fns[0] ?? {};
      const rawDefault = str(ch, 'Default') ?? str(initial, 'Default');
      const fine = offsets.length > 1;
      const default16 = fine && attr ? dmx16(rawDefault) : undefined;
      const def = default16 !== undefined ? default16 >> 8 : dmx8(rawDefault) ?? 0;
      const chName = `${cell ? `${geomName} ` : ''}${str(lc, 'Name') ?? gAttr}`.slice(0, 48);
      const ranges = dedupeRanges(channelRanges(ch, attr, wheels));
      const base: Channel = attr
        ? { name: chName, attribute: attr, fine: false, default: def, ...(default16 !== undefined ? { default16 } : {}), ranges, ...(cell ? { cell } : {}) }
        : { ...generic(chName), default: def, ranges };
      if (attr) { used.add(key(attr)); allAttrs.add(attr); }
      place(offsets[0]!, base, gAttr);
      if (offsets[1] !== undefined) place(offsets[1], attr ? { name: `${chName} fin`.slice(0, 48), attribute: attr, fine: true, default: (default16 ?? 0) & 0xff, ranges: [], ...(cell ? { cell } : {}) } : generic(`${chName} fin`), gAttr);
      for (const extra of offsets.slice(2)) place(extra, generic(`${chName} octet ${offsets.indexOf(extra) + 1}`), gAttr);
      const fn0 = fns[0] ?? {};
      const span = [num(fn0, 'PhysicalFrom'), num(fn0, 'PhysicalTo')];
      if (attr === 'pan' && !pan && span.every((v) => v !== undefined)) pan = span as [number, number];
      if (attr === 'tilt' && !tilt && span.every((v) => v !== undefined)) tilt = span as [number, number];
    }
    if (!byAddr.size) { warnings.push(`Mode « ${modeName} » sans canal DMX, ignoré`); continue; }
    const count = Math.max(...byAddr.keys());
    const channels: Channel[] = [];
    for (let a = 1; a <= count; a++) channels.push(byAddr.get(a) ?? generic(`inutilisé ${a}`));
    if (!modes.some((m) => m.name === modeName)) modes.push({ name: modeName, channels });
  }
  if (!modes.length) return fail('Aucun mode DMX exploitable');

  const type = fixtureType(allAttrs, maxCells);
  const beamAngle = geo.filter((g) => g._tag === 'Beam').map((g) => num(g, 'BeamAngle')).find((v) => v !== undefined && v > 0);
  const manufacturer = (str(fx, 'Manufacturer') ?? 'Inconnu').slice(0, 80);
  const shortName = str(fx, 'ShortName') ?? str(fx, 'Name')!;
  const candidate = {
    id: `gdtf-${slug(manufacturer)}-${slug(shortName)}`.slice(0, 64),
    name: (str(fx, 'LongName') ?? str(fx, 'Name')!).slice(0, 80),
    manufacturer,
    type,
    fictional: false,
    physical: {
      panRange: pan ? clamp(Math.abs(pan[1] - pan[0]), 0, 720) : type.startsWith('moving') ? 540 : 0,
      tiltRange: tilt ? clamp(Math.abs(tilt[1] - tilt[0]), 0, 360) : type.startsWith('moving') ? 270 : 0,
      beamAngle: beamAngle !== undefined ? clamp(beamAngle, 1, 90) : 25,
      ...(tilt ? { tiltMin: clamp(tilt[0], -360, 360), tiltMax: clamp(tilt[1], -360, 360) } : {}),
    },
    modes,
    modules: [],
  };
  const v = validateProfile(candidate);
  if (!v.ok) return { profile: null, warnings, errors: v.errors.slice(0, 5) };
  return { profile: v.profile!, warnings: [...new Set(warnings)], errors: [] };
}
