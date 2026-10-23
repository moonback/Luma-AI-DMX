import type { Performer, StageProp, StageScreen, StageMarker, Truss } from '../model/schemas';
import { EQUIPMENT, type EquipmentCategory, type ParamValue, type PropKind } from './equipment';

/**
 * Library of stage elements: standard truss pieces (straights, junctions, totems, circle, square, triangular), stage
 * equipment (sound, backline, effects, set pieces, accessories), performers, screens and stage points. An item is a
 * kind plus a preset merged into a new element by `newElement`; `name` in a preset is the base of the generated name
 * ("Droite 2 m 3"). Dimensions are typical metric sizes of the real equipment, never a technical specification.
 */
export type LibraryGroup = EquipmentCategory | 'people';
type Preset<T> = Partial<Omit<T, 'id' | 'x' | 'y'>>;
export type LibraryItem =
  | { id: string; group: LibraryGroup; label: string; kind: 'truss'; preset: Preset<Truss> }
  | { id: string; group: LibraryGroup; label: string; kind: 'prop'; preset: Preset<StageProp> }
  | { id: string; group: LibraryGroup; label: string; kind: 'performer'; preset: Preset<Performer> }
  | { id: string; group: LibraryGroup; label: string; kind: 'screen'; preset: Preset<StageScreen> }
  | { id: string; group: LibraryGroup; label: string; kind: 'marker'; preset: Preset<StageMarker> };

export const LIBRARY_GROUPS: { id: LibraryGroup; label: string }[] = [
  { id: 'structure', label: 'Structures' }, { id: 'sound', label: 'Sonorisation' }, { id: 'backline', label: 'Instruments' },
  { id: 'light', label: 'Effets' }, { id: 'decor', label: 'Décor' }, { id: 'video', label: 'Vidéo et repères' },
  { id: 'accessory', label: 'Accessoires' }, { id: 'people', label: 'Artistes' },
];

export const TRUSS_SHAPE_LABEL: Record<Truss['shape'], string> = {
  line: 'Droite', circle: 'Cercle', square: 'Carré', corner: 'Angle 90°', tee: 'Té', cross: 'Croix', totem: 'Totem',
};
/** Label of the `length` field for each truss shape. */
export const TRUSS_LENGTH_LABEL: Record<Truss['shape'], string> = {
  line: 'Longueur', circle: 'Diamètre', square: 'Côté', corner: 'Bras', tee: 'Bras', cross: 'Bras', totem: 'Longueur',
};
export const PROP_KIND_LABEL = Object.fromEntries(Object.entries(EQUIPMENT).map(([k, v]) => [k, v.label])) as Record<PropKind, string>;

/** Assembly pieces rest on totems / junctions: same height as a 3 m totem, no towers or motors of their own. */
const piece = (name: string, shape: Truss['shape'], length: number, extra: Preset<Truss> = {}): Preset<Truss> =>
  ({ name, shape, length, height: 3, support: 'none', ...extra });
const prop = (kind: PropKind, name: string, width: number, depth: number, height: number, color: string, params?: Record<string, ParamValue>, extra: Preset<StageProp> = {}): Preset<StageProp> =>
  ({ kind, name, width, depth, height, color, elevation: 0, ...(params ? { params } : {}), ...extra });
type PropItem = Extract<LibraryItem, { kind: 'prop' }>;
const item = (id: string, label: string, preset: Preset<StageProp>, group?: LibraryGroup): PropItem =>
  ({ id, group: group ?? EQUIPMENT[preset.kind!].category, label, kind: 'prop', preset });

export const LIBRARY: LibraryItem[] = [
  { id: 'truss-0.5', group: 'structure', label: 'Droite 0,5 m', kind: 'truss', preset: piece('Droite 0,5 m', 'line', 0.5) },
  { id: 'truss-1', group: 'structure', label: 'Droite 1 m', kind: 'truss', preset: piece('Droite 1 m', 'line', 1) },
  { id: 'truss-2', group: 'structure', label: 'Droite 2 m', kind: 'truss', preset: piece('Droite 2 m', 'line', 2) },
  { id: 'truss-3', group: 'structure', label: 'Droite 3 m', kind: 'truss', preset: piece('Droite 3 m', 'line', 3) },
  { id: 'truss-4', group: 'structure', label: 'Droite 4 m', kind: 'truss', preset: piece('Droite 4 m', 'line', 4) },
  { id: 'truss-tri-2', group: 'structure', label: 'Triangulaire 2 m', kind: 'truss', preset: piece('Tri 2 m', 'line', 2, { section: 'triangle' }) },
  { id: 'truss-tri-3', group: 'structure', label: 'Triangulaire 3 m', kind: 'truss', preset: piece('Tri 3 m', 'line', 3, { section: 'triangle' }) },
  { id: 'truss-corner', group: 'structure', label: 'Angle 90°', kind: 'truss', preset: piece('Angle', 'corner', 0.5) },
  { id: 'truss-tee', group: 'structure', label: 'Té 3 départs', kind: 'truss', preset: piece('Té', 'tee', 0.5) },
  { id: 'truss-cross', group: 'structure', label: 'Croix 4 départs', kind: 'truss', preset: piece('Croix', 'cross', 0.5) },
  { id: 'totem-1', group: 'structure', label: 'Totem 1 m', kind: 'truss', preset: piece('Totem 1 m', 'totem', 0.5, { height: 1 }) },
  { id: 'totem-2', group: 'structure', label: 'Totem 2 m', kind: 'truss', preset: piece('Totem 2 m', 'totem', 0.5, { height: 2 }) },
  { id: 'totem-3', group: 'structure', label: 'Totem 3 m', kind: 'truss', preset: piece('Totem 3 m', 'totem', 0.5, { height: 3 }) },
  { id: 'truss-circle', group: 'structure', label: 'Cercle Ø 4 m', kind: 'truss', preset: { name: 'Cercle', shape: 'circle', length: 4, height: 5, support: 'hung' } },
  { id: 'truss-square', group: 'structure', label: 'Carré 3 m', kind: 'truss', preset: { name: 'Carré', shape: 'square', length: 3, height: 5, support: 'hung' } },
  { id: 'truss-bridge', group: 'structure', label: 'Pont sur pieds 8 m', kind: 'truss', preset: { name: 'Pont', shape: 'line', length: 8, height: 5, support: 'towers' } },
  { id: 'truss-hung', group: 'structure', label: 'Pont suspendu 10 m', kind: 'truss', preset: { name: 'Pont', shape: 'line', length: 10, height: 7, support: 'hung' } },
  item('truss-base', 'Embase 60 × 60 cm', prop('truss-base', 'Embase', 0.6, 0.6, 0.12, '#8a93a6')),
  item('hoist', 'Moteur de levage', prop('hoist', 'Moteur', 0.3, 0.3, 0.5, '#1f2937', { chain: 3 }, { elevation: 6 })),
  item('canopy', 'Toiture 10 × 8 m', prop('canopy', 'Toiture', 10, 8, 1.5, '#e5e7eb', { style: 'pitched' }, { elevation: 7 })),

  item('line-array-8', 'Line array 8 modules', prop('line-array', 'Line array', 1.1, 0.5, 2.6, '#16181d', { modules: 8, splay: 2, bumper: true, flown: true }, { elevation: 4.5 })),
  item('line-array-12', 'Line array 12 modules', prop('line-array', 'Line array', 1.1, 0.5, 3.9, '#16181d', { modules: 12, splay: 1.5, bumper: true, flown: true }, { elevation: 5 })),
  item('line-array-ground', 'Line array posé (4 modules)', prop('line-array', 'Line array', 1.1, 0.5, 1.3, '#16181d', { modules: 4, splay: 0, bumper: true, flown: false }, { elevation: 0.6 })),
  { id: 'speaker', group: 'sound', label: 'Enceinte de façade', kind: 'prop', preset: prop('speaker', 'Enceinte', 0.6, 0.6, 1.2, '#15171c') },
  item('speaker-column', 'Enceinte colonne', prop('speaker', 'Colonne son', 0.3, 0.35, 2, '#15171c', { style: 'column' })),
  item('pa-stand', 'Enceinte sur pied', prop('pa-stand', 'Enceinte', 0.4, 0.4, 1.9, '#15171c')),
  item('sub', 'Caisson de basses 18"', prop('sub', 'Sub', 0.7, 0.8, 0.55, '#121418', { drivers: '1x18' })),
  item('sub-2x18', 'Caisson 2 × 18"', prop('sub', 'Sub', 1.2, 0.8, 0.6, '#121418', { drivers: '2x18' })),
  { id: 'monitor', group: 'sound', label: 'Retour de scène', kind: 'prop', preset: prop('monitor', 'Retour', 0.6, 0.45, 0.35, '#15171c') },
  item('audio-rack', 'Rack audio 12 U', prop('audio-rack', 'Rack', 0.6, 0.7, 0.75, '#22252c', { units: 12, wheels: true })),

  item('drums', 'Batterie', prop('drums', 'Batterie', 1.8, 1.5, 1.4, '#9b1c1c', { kit: '5', cymbals: 3 })),
  item('cymbal', 'Cymbale sur pied', prop('cymbal', 'Cymbale', 0.5, 0.5, 1.5, '#c9a43b', { size: 0.45 })),
  item('guitar-electric', 'Guitare électrique', prop('guitar', 'Guitare', 0.4, 0.4, 1, '#b91c1c', { style: 'electric', stand: true })),
  item('guitar-acoustic', 'Guitare acoustique', prop('guitar', 'Guitare folk', 0.45, 0.45, 1.05, '#b07a3c', { style: 'acoustic', stand: true })),
  item('guitar-bass', 'Basse', prop('guitar', 'Basse', 0.4, 0.4, 1.2, '#1e3a8a', { style: 'bass', stand: true })),
  item('amp-combo', 'Ampli guitare combo', prop('amp', 'Ampli', 0.65, 0.3, 0.55, '#1c1c1c', { style: 'combo' })),
  item('amp-stack', 'Stack guitare', prop('amp', 'Stack', 0.75, 0.38, 1.75, '#1c1c1c', { style: 'stack' })),
  item('amp-bass', 'Ampli basse', prop('amp', 'Ampli basse', 0.6, 0.5, 1.3, '#1c1c1c', { style: 'bass' })),
  item('keyboard', 'Synthétiseur sur stand', prop('keyboard', 'Clavier', 1.2, 0.45, 1, '#1f2937', { style: 'synth', tiers: 1 })),
  item('keyboard-2', 'Clavier 2 étages', prop('keyboard', 'Claviers', 1.4, 0.5, 1.25, '#1f2937', { style: 'synth', tiers: 2 })),
  item('stage-piano', 'Piano de scène', prop('keyboard', 'Piano de scène', 1.4, 0.4, 0.95, '#b91c1c', { style: 'stage', tiers: 1 })),
  item('grand-piano', 'Piano à queue', prop('piano', 'Piano', 1.55, 2.1, 1, '#0b0b0e', { style: 'grand', open: true })),
  item('upright-piano', 'Piano droit', prop('piano', 'Piano droit', 1.5, 0.6, 1.3, '#2b1a12', { style: 'upright' })),
  { id: 'mic', group: 'backline', label: 'Pied de micro', kind: 'prop', preset: prop('mic', 'Micro', 0.3, 0.3, 1.6, '#3a3f4a') },
  item('mic-boom', 'Micro sur perche', prop('mic', 'Micro', 0.5, 0.5, 1.5, '#3a3f4a', { style: 'boom' })),
  item('music-stand', 'Pupitre à partitions', prop('music-stand', 'Pupitre', 0.5, 0.4, 1.2, '#2a2d34')),

  item('fog', 'Machine à fumée', prop('fog-machine', 'Fumée', 0.6, 0.3, 0.25, '#2a2d34', { style: 'fog' })),
  item('hazer', 'Machine à brume (hazer)', prop('fog-machine', 'Hazer', 0.5, 0.35, 0.35, '#2a2d34', { style: 'haze' })),
  item('low-fog', 'Fumée lourde', prop('fog-machine', 'Fumée lourde', 0.8, 0.5, 0.5, '#d4d4d8', { style: 'low' })),
  item('spark', 'Machine à étincelles', prop('spark-machine', 'Étincelles', 0.35, 0.35, 0.35, '#18181b')),
  item('co2', 'Jet CO2', prop('co2-jet', 'CO2', 0.3, 0.3, 0.4, '#3f3f46')),

  { id: 'riser-2x1', group: 'decor', label: 'Praticable 2 × 1 m', kind: 'prop', preset: prop('riser', 'Praticable', 2, 1, 0.4, '#2a2f3a') },
  { id: 'riser-2x2', group: 'decor', label: 'Praticable 2 × 2 m', kind: 'prop', preset: prop('riser', 'Praticable', 2, 2, 0.6, '#2a2f3a') },
  item('drum-riser', 'Praticable batterie 3 × 2 m', prop('riser', 'Praticable batterie', 3, 2, 0.6, '#2a2f3a', { skirt: true })),
  { id: 'stairs', group: 'decor', label: 'Escalier', kind: 'prop', preset: prop('stairs', 'Escalier', 1, 1, 0.6, '#2a2f3a') },
  { id: 'drape', group: 'decor', label: 'Pendrillon', kind: 'prop', preset: prop('drape', 'Pendrillon', 2, 0.1, 5, '#0b0c10') },
  item('curtain', 'Rideau de fond 8 m', prop('drape', 'Rideau', 8, 0.15, 6, '#3b0d14', { folds: 14 })),
  item('backdrop', 'Panneau de fond 4 × 3 m', prop('backdrop', 'Panneau', 4, 0.12, 3, '#1e293b', { style: 'panel' })),
  item('canvas', 'Toile tendue 6 × 4 m', prop('backdrop', 'Toile', 6, 0.08, 4, '#e2e8f0', { style: 'canvas' })),
  item('frame', 'Cadre décoratif', prop('backdrop', 'Cadre', 2, 0.1, 2.5, '#a78bfa', { style: 'frame' })),
  item('arch', 'Arche 4 × 4 m', prop('arch', 'Arche', 4, 0.3, 4, '#f1f5f9', { style: 'round', thickness: 0.3, leds: true })),
  { id: 'box', group: 'decor', label: 'Cube', kind: 'prop', preset: prop('box', 'Cube', 1, 1, 1, '#475569') },
  { id: 'column', group: 'decor', label: 'Colonne', kind: 'prop', preset: prop('column', 'Colonne', 0.5, 0.5, 3, '#cbd5e1') },

  { id: 'table', group: 'accessory', label: 'Table / régie DJ', kind: 'prop', preset: prop('table', 'Table', 1.6, 0.7, 0.9, '#1d2129') },
  item('dj-booth', 'Régie DJ', prop('dj-booth', 'Régie DJ', 2, 0.8, 1.05, '#111318', { decks: true, led: true })),
  item('console-audio', 'Console son', prop('console', 'Console son', 1.4, 0.8, 1, '#1f2937', { style: 'audio', desk: true })),
  item('console-light', 'Console lumière', prop('console', 'Console lumière', 1.2, 0.7, 1, '#1f2937', { style: 'light', desk: true })),
  item('flight-case', 'Flight-case', prop('flight-case', 'Flight', 1.2, 0.6, 0.7, '#111111', { wheels: true })),
  item('chair', 'Chaise', prop('chair', 'Chaise', 0.45, 0.5, 0.9, '#27272a', { style: 'chair' })),
  item('stool', 'Tabouret', prop('chair', 'Tabouret', 0.4, 0.4, 0.75, '#27272a', { style: 'stool' })),
  item('barrier', 'Crash barrière 1 m', prop('barrier', 'Barrière', 1, 1.1, 1.2, '#9ca3af', { style: 'crash' })),
  item('barrier-vauban', 'Barrière Vauban 2 m', prop('barrier', 'Vauban', 2, 0.5, 1.1, '#9ca3af', { style: 'vauban' })),
  item('cable', 'Passage de câbles', prop('cable', 'Passe-câble', 0.9, 0.5, 0.06, '#f59e0b', { channels: 3 })),

  { id: 'performer-standing', group: 'people', label: 'Artiste debout', kind: 'performer', preset: { name: 'Artiste', kind: 'standing' } },
  { id: 'performer-seated', group: 'people', label: 'Artiste assis', kind: 'performer', preset: { name: 'Artiste', kind: 'seated' } },
  { id: 'performer-drums', group: 'people', label: 'Batteur', kind: 'performer', preset: { name: 'Batterie', kind: 'drums' } },
  { id: 'performer-keys', group: 'people', label: 'Claviériste', kind: 'performer', preset: { name: 'Clavier', kind: 'keys' } },
  { id: 'performer-lectern', group: 'people', label: 'Pupitre', kind: 'performer', preset: { name: 'Pupitre', kind: 'lectern' } },

  { id: 'screen-16-9', group: 'video', label: 'Écran 16:9 3 m', kind: 'screen', preset: { name: 'Écran', width: 3, height: 1.7, elevation: 1.2 } },
  { id: 'screen-wall', group: 'video', label: 'Mur LED 6 × 3 m', kind: 'screen', preset: { name: 'Mur LED', width: 6, height: 3, elevation: 0.5, color: '#7c3aed', cabinet: 0.5 } },
  { id: 'screen-wall-xl', group: 'video', label: 'Mur LED 10 × 5 m', kind: 'screen', preset: { name: 'Mur LED', width: 10, height: 5, elevation: 0.5, color: '#2563eb', cabinet: 0.5 } },
  { id: 'screen-side', group: 'video', label: 'Écran latéral IMAG 4 × 2,25 m', kind: 'screen', preset: { name: 'IMAG', width: 4, height: 2.25, elevation: 3, color: '#0ea5e9', cabinet: 0.5 } },
  { id: 'screen-pillar', group: 'video', label: 'Colonne LED 1 × 4 m', kind: 'screen', preset: { name: 'Colonne LED', width: 1, height: 4, elevation: 0, color: '#db2777', cabinet: 0.5 } },
  { id: 'marker', group: 'video', label: 'Point de scène', kind: 'marker', preset: { name: 'Point' } },
];

export const libraryItem = (id: string) => LIBRARY.find((x) => x.id === id);

/** Search text of an item: label, kind label and tags of its kind ("sono" finds the line arrays). */
export function librarySearchText(x: LibraryItem): string {
  const k = x.kind === 'prop' && x.preset.kind ? EQUIPMENT[x.preset.kind] : undefined;
  return [x.label, k?.label ?? '', k?.tags ?? '', LIBRARY_GROUPS.find((g) => g.id === x.group)?.label ?? ''].join(' ');
}
