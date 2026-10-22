import type { MessageKey } from '../../i18n';
import type { AmbienceId, FloorId } from './quality';

/** Display preferences of the 3D view, kept per machine (localStorage). `view`: a built-in camera id or a saved view id. */
export interface Prefs { haze: number; glow: boolean; pools: boolean; labels: boolean; smoke: boolean; view: string; grid: number; real: boolean; ambience: AmbienceId; floor: FloorId; exposure: number; room: number }
const DEFAULT_PREFS: Prefs = { haze: 0.55, glow: true, pools: true, labels: false, smoke: false, view: 'foh', grid: 0.25, real: false, ambience: 'black', floor: 'matte', exposure: 1, room: 0 };

/** Quality presets: a coherent set of rendering options selectable in one click. */
export type QualityPresetId = 'edit' | 'balanced' | 'quality' | 'present';
export const QUALITY_PRESETS: { id: QualityPresetId; labelKey: MessageKey; hintKey: MessageKey; patch: Partial<Prefs> }[] = [
  { id: 'edit',     labelKey: 'stage3d.preset.edit',     hintKey: 'stage3d.preset.editHint',     patch: { glow: false, pools: false, smoke: false, real: false, haze: 0.3,  exposure: 1,   ambience: 'work',    floor: 'matte'  } },
  { id: 'balanced', labelKey: 'stage3d.preset.balanced', hintKey: 'stage3d.preset.balancedHint', patch: { glow: true,  pools: true,  smoke: false, real: false, haze: 0.55, exposure: 1,   ambience: 'black',   floor: 'matte'  } },
  { id: 'quality',  labelKey: 'stage3d.preset.quality',  hintKey: 'stage3d.preset.qualityHint',  patch: { glow: true,  pools: true,  smoke: false, real: true,  haze: 0.65, exposure: 1,   ambience: 'black',   floor: 'lacquer'} },
  { id: 'present',  labelKey: 'stage3d.preset.present',  hintKey: 'stage3d.preset.presentHint',  patch: { glow: true,  pools: true,  smoke: true,  real: false, haze: 0.8,  exposure: 1.1, ambience: 'club',    floor: 'wet'    } },
];

/** Editor grid steps in meters (0 = free); rotations snap to 15° whenever a grid is on. */
export const GRIDS = [0, 0.25, 0.5, 1];
export function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem('luma.stage3d') ?? '{}') as Partial<Prefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}
export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem('luma.stage3d', JSON.stringify(p));
  } catch {
    // preferences simply not persisted
  }
}
