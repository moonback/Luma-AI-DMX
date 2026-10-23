import type { StageProp, StageScreen } from '../model/schemas';
import type { ParamValue, PropKind } from '../visualizer/equipment';

/**
 * Shorthands for the set of the demonstration projects: typical metric sizes of the library equipment (see
 * `core/visualizer/library.ts`), so a demo reads "2 line arrays, a drum kit on its riser" instead of raw boxes.
 * Positions in metres (x across, y upstage), `elevation` = height of the floor the piece stands on.
 */
export type DemoProp = Omit<StageProp, 'id' | 'elevation' | 'rotation' | 'color'> & Partial<Pick<StageProp, 'elevation' | 'rotation' | 'color'>>;
/** LED screen / video wall of a demo: centre, bottom edge `elevation`, size; colour source with LED modules by default. */
export type DemoScreen = Omit<StageScreen, 'id' | 'source' | 'glow' | 'rotation' | 'image'> & Partial<Pick<StageScreen, 'source' | 'glow' | 'rotation'>>;

type Extra = Partial<Pick<StageProp, 'elevation' | 'rotation' | 'color'>> & { params?: Record<string, ParamValue> };
const r2 = (v: number) => Math.round(v * 100) / 100;
const prop = (kind: PropKind, name: string, x: number, y: number, width: number, depth: number, height: number, extra: Extra = {}): DemoProp =>
  ({ kind, name, x: r2(x), y: r2(y), width, depth, height, ...extra });

/** `n` items spread evenly from x0 to x1 (centred when n = 1). */
export const row = <T>(n: number, x0: number, x1: number, make: (x: number, i: number) => T): T[] =>
  Array.from({ length: n }, (_, i) => make(n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1), i));

/** Flown line array (bottom of the lowest module at `elevation`), modules of about 31 cm. */
export const lineArray = (name: string, x: number, y: number, elevation: number, modules = 8, splay = 2): DemoProp =>
  prop('line-array', name, x, y, 1.1, 0.5, r2(modules * 0.31 + 0.1), { elevation, color: '#16181D', params: { modules, splay, bumper: true, flown: true } });
/** Ground-stacked line array (on its bumper, on subs for instance). */
export const groundArray = (name: string, x: number, y: number, elevation = 0, modules = 4): DemoProp =>
  prop('line-array', name, x, y, 1.1, 0.5, r2(modules * 0.31 + 0.1), { elevation, color: '#16181D', params: { modules, splay: 0, bumper: true, flown: false } });
export const sub = (name: string, x: number, y: number, elevation = 0, drivers: '1x18' | '2x18' = '1x18'): DemoProp =>
  prop('sub', name, x, y, drivers === '2x18' ? 1.2 : 0.7, 0.8, 0.55, { elevation, color: '#121418', params: { drivers } });
export const paStand = (name: string, x: number, y: number, elevation = 0): DemoProp => prop('pa-stand', name, x, y, 0.4, 0.4, 1.9, { elevation, color: '#15171C' });
export const monitor = (name: string, x: number, y: number, elevation = 0): DemoProp => prop('monitor', name, x, y, 0.6, 0.45, 0.35, { elevation, rotation: 180, color: '#15171C' });

/** Drum kit facing the audience; `k` scales it (1 = 1.8 × 1.5 × 1.4 m). */
export const drums = (name: string, x: number, y: number, elevation = 0, k = 1, color = '#9B1C1C', kit: '4' | '5' | '7' = '5'): DemoProp =>
  prop('drums', name, x, y, r2(1.8 * k), r2(1.5 * k), r2(1.4 * k), { elevation, color, params: { kit, cymbals: kit === '7' ? 5 : 3 } });
export const amp = (name: string, style: 'combo' | 'stack' | 'bass', x: number, y: number, elevation = 0): DemoProp =>
  style === 'stack' ? prop('amp', name, x, y, 0.75, 0.38, 1.75, { elevation, color: '#1C1C1C', params: { style } })
    : style === 'bass' ? prop('amp', name, x, y, 0.6, 0.5, 1.3, { elevation, color: '#1C1C1C', params: { style } })
      : prop('amp', name, x, y, 0.65, 0.3, 0.55, { elevation, color: '#1C1C1C', params: { style } });
export const guitar = (name: string, style: 'electric' | 'acoustic' | 'bass', x: number, y: number, elevation = 0, color?: string): DemoProp =>
  prop('guitar', name, x, y, 0.4, 0.4, style === 'bass' ? 1.2 : 1, { elevation, color: color ?? { electric: '#B91C1C', acoustic: '#B07A3C', bass: '#1E3A8A' }[style], params: { style, stand: true } });
export const keyboard = (name: string, x: number, y: number, elevation = 0, tiers = 1, style: 'synth' | 'stage' | 'organ' = 'synth'): DemoProp =>
  prop('keyboard', name, x, y, tiers > 1 ? 1.4 : 1.2, 0.45, tiers > 1 ? 1.25 : 1, { elevation, color: style === 'stage' ? '#B91C1C' : '#1F2937', params: { style, tiers } });
export const piano = (name: string, x: number, y: number, rotation = 0, style: 'grand' | 'upright' = 'grand', elevation = 0): DemoProp =>
  style === 'grand' ? prop('piano', name, x, y, 1.55, 2.1, 1, { elevation, rotation, color: '#0B0B0E', params: { style, open: true } })
    : prop('piano', name, x, y, 1.5, 0.6, 1.3, { elevation, rotation, color: '#2B1A12', params: { style } });
export const mic = (name: string, x: number, y: number, elevation = 0, boom = false): DemoProp =>
  prop('mic', name, x, y, boom ? 0.5 : 0.3, boom ? 0.5 : 0.3, boom ? 1.5 : 1.6, { elevation, color: '#3A3F4A', ...(boom ? { params: { style: 'boom' } } : {}) });
export const musicStand = (name: string, x: number, y: number, elevation = 0, rotation = 0): DemoProp => prop('music-stand', name, x, y, 0.5, 0.4, 1.2, { elevation, rotation, color: '#2A2D34' });
export const chair = (name: string, x: number, y: number, rotation = 0, color = '#27272A', elevation = 0): DemoProp => prop('chair', name, x, y, 0.45, 0.5, 0.9, { elevation, rotation, color, params: { style: 'chair' } });
export const stool = (name: string, x: number, y: number, elevation = 0): DemoProp => prop('chair', name, x, y, 0.4, 0.4, 0.75, { elevation, color: '#27272A', params: { style: 'stool' } });

export const fog = (name: string, x: number, y: number, style: 'fog' | 'haze' | 'low' = 'fog', rotation = 0): DemoProp =>
  style === 'low' ? prop('fog-machine', name, x, y, 0.8, 0.5, 0.5, { rotation, color: '#D4D4D8', params: { style } })
    : prop('fog-machine', name, x, y, 0.6, 0.3, 0.25, { rotation, color: '#2A2D34', params: { style } });
export const co2 = (name: string, x: number, y: number, elevation = 0): DemoProp => prop('co2-jet', name, x, y, 0.3, 0.3, 0.4, { elevation, color: '#3F3F46' });
export const spark = (name: string, x: number, y: number, elevation = 0): DemoProp => prop('spark-machine', name, x, y, 0.35, 0.35, 0.35, { elevation, color: '#18181B' });

export const djBooth = (name: string, x: number, y: number, elevation = 0, width = 2, color = '#111318'): DemoProp =>
  prop('dj-booth', name, x, y, width, 0.8, 1.05, { elevation, color, params: { decks: true, led: true } });
/** Sound or lighting desk at front of house (in the audience, y < 0). */
export const desk = (name: string, style: 'audio' | 'light', x: number, y: number): DemoProp =>
  prop('console', name, x, y, style === 'audio' ? 1.4 : 1.2, 0.8, 1, { color: '#1F2937', params: { style, desk: true } });
export const flightCase = (name: string, x: number, y: number, elevation = 0, rotation = 0): DemoProp => prop('flight-case', name, x, y, 1.2, 0.6, 0.7, { elevation, rotation, color: '#111111', params: { wheels: true } });
/** Row of barriers across the stage front (crash barriers 2 m wide, or Vauban rails). */
export const barriers = (n: number, x0: number, x1: number, y: number, style: 'crash' | 'vauban' = 'crash', rotation = 0): DemoProp[] =>
  row(n, x0, x1, (x, i) => prop('barrier', `${style === 'crash' ? 'Crash barrière' : 'Barrière Vauban'} ${i + 1}`, x, y, 2, style === 'crash' ? 1.1 : 0.5, style === 'crash' ? 1.2 : 1.1, { rotation, color: '#6B7280', params: { style } }));
export const backdrop = (name: string, style: 'panel' | 'canvas' | 'frame', x: number, y: number, width: number, height: number, color: string, elevation = 0): DemoProp =>
  prop('backdrop', name, x, y, width, style === 'frame' ? 0.1 : 0.08, height, { elevation, color, params: { style } });
export const arch = (name: string, x: number, y: number, width: number, height: number, color: string, round = true): DemoProp =>
  prop('arch', name, x, y, width, 0.3, height, { color, params: { style: round ? 'round' : 'square', thickness: 0.3, leds: true } });

/** LED wall (modules of 50 cm) or video screen, bottom edge at `elevation`. */
export const screen = (name: string, x: number, y: number, width: number, height: number, elevation: number, color: string, extra: Partial<DemoScreen> = {}): DemoScreen =>
  ({ name, x, y, width, height, elevation, color, cabinet: 0.5, ...extra });
