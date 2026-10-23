import type { StageProp } from '../model/schemas';

/**
 * Catalogue of the stage equipment kinds (set pieces, sound, backline, effects, accessories): category, label,
 * search tags and the parameters specific to each kind. Shared by the 3D builders, the property panel, the library
 * and the scene assistant. Dimensions are meters; a kind is drawn inside its width × depth × height box, front
 * (towards the audience at rotation 0) on its local +z side.
 */
export type PropKind = StageProp['kind'];
export type EquipmentCategory = 'structure' | 'sound' | 'backline' | 'light' | 'decor' | 'video' | 'accessory';
export type ParamValue = number | string | boolean;

export type ParamSpec =
  | { key: string; label: string; type: 'number'; min: number; max: number; step: number; unit?: string; default: number }
  | { key: string; label: string; type: 'choice'; options: { id: string; label: string }[]; default: string }
  | { key: string; label: string; type: 'bool'; default: boolean }
  | { key: string; label: string; type: 'text'; max: number; hint?: string; default: string };

export interface EquipmentSpec {
  category: EquipmentCategory;
  label: string;
  /** Extra words for the library search ("sono", "PA"…). */
  tags: string;
  params: ParamSpec[];
  /** Performers can stand on it (riser, stairs…). */
  walkable?: boolean;
  /** Snaps under a truss when dropped close to one (flown speakers, hoists). */
  hangable?: boolean;
  /** Rigging / load-bearing look: the panel reminds that a 3D assembly is no safety validation. */
  rigging?: boolean;
}

const choice = (key: string, label: string, options: [string, string][], def?: string): ParamSpec =>
  ({ key, label, type: 'choice', options: options.map(([id, l]) => ({ id, label: l })), default: def ?? options[0]![0] });
const num = (key: string, label: string, min: number, max: number, step: number, def: number, unit?: string): ParamSpec =>
  ({ key, label, type: 'number', min, max, step, default: def, ...(unit ? { unit } : {}) });
const bool = (key: string, label: string, def: boolean): ParamSpec => ({ key, label, type: 'bool', default: def });

export const EQUIPMENT_CATEGORIES: { id: EquipmentCategory; label: string }[] = [
  { id: 'structure', label: 'Structures' }, { id: 'sound', label: 'Sonorisation' }, { id: 'backline', label: 'Instruments et backline' },
  { id: 'light', label: 'Éclairage et effets' }, { id: 'decor', label: 'Décors' }, { id: 'video', label: 'Vidéo' }, { id: 'accessory', label: 'Accessoires' },
];

export const EQUIPMENT: Record<PropKind, EquipmentSpec> = {
  riser: { category: 'decor', label: 'Praticable', tags: 'estrade podium plateau', params: [bool('skirt', 'Jupe', false)], walkable: true },
  stairs: { category: 'decor', label: 'Escalier', tags: 'marches', params: [bool('rails', 'Rampes', false)], walkable: true },
  speaker: { category: 'sound', label: 'Enceinte de façade', tags: 'sono diffusion haut-parleur pa', params: [choice('style', 'Format', [['box', 'Caisson'], ['column', 'Colonne']])] },
  monitor: { category: 'sound', label: 'Retour de scène', tags: 'wedge retour', params: [] },
  mic: { category: 'backline', label: 'Pied de micro', tags: 'microphone chant', params: [choice('style', 'Pied', [['straight', 'Droit'], ['boom', 'Perche']])] },
  table: { category: 'accessory', label: 'Table', tags: 'mobilier bureau', params: [bool('cloth', 'Nappe', false)], walkable: true },
  drape: { category: 'decor', label: 'Rideau', tags: 'pendrillon frise toile velours', params: [num('folds', 'Plis', 0, 30, 1, 9)] },
  box: { category: 'decor', label: 'Cube', tags: 'caisse bloc', params: [], walkable: true },
  column: { category: 'decor', label: 'Colonne', tags: 'pilier', params: [] },

  'truss-base': { category: 'structure', label: 'Embase de structure', tags: 'pied base platine lestage', params: [], rigging: true },
  hoist: { category: 'structure', label: 'Moteur de levage', tags: 'palan chaîne moteur rigging', params: [num('chain', 'Chaîne', 0.5, 20, 0.5, 3, 'm')], hangable: true, rigging: true },
  canopy: { category: 'structure', label: 'Toiture', tags: 'toit bâche couverture', params: [choice('style', 'Forme', [['pitched', 'Deux pentes'], ['arched', 'Cintrée'], ['flat', 'Plate']])], rigging: true },

  'line-array': {
    category: 'sound', label: 'Line array', tags: 'sono façade suspendu accroche bumper ligne source', hangable: true, rigging: true,
    params: [
      num('modules', 'Modules', 1, 24, 1, 8),
      num('splay', 'Angle entre modules', 0, 10, 0.5, 2, '°'),
      { key: 'angles', label: 'Angles par module', type: 'text', max: 120, hint: '0, 1, 2, 4…', default: '' },
      num('tilt', 'Site du bumper', -15, 15, 0.5, 0, '°'),
      bool('bumper', 'Bumper', true),
      bool('flown', 'Suspendu', true),
    ],
  },
  sub: { category: 'sound', label: 'Caisson de basses', tags: 'sub basse grave infra', params: [choice('drivers', 'Haut-parleurs', [['1x18', '1 × 18"'], ['2x18', '2 × 18"'], ['1x21', '1 × 21"']])] },
  'pa-stand': { category: 'sound', label: 'Enceinte sur pied', tags: 'sono trépied petite diffusion', params: [] },
  'audio-rack': { category: 'sound', label: 'Rack audio', tags: 'amplis processeur racks', params: [num('units', 'Unités', 2, 42, 1, 12, 'U'), bool('wheels', 'Roulettes', true)] },

  drums: {
    category: 'backline', label: 'Batterie', tags: 'fûts caisse claire grosse caisse toms cymbales', params: [
      choice('kit', 'Configuration', [['5', '5 fûts'], ['4', '4 fûts'], ['7', '7 fûts']]),
      num('cymbals', 'Cymbales', 1, 6, 1, 3),
    ],
  },
  cymbal: { category: 'backline', label: 'Cymbale sur pied', tags: 'crash ride charleston', params: [num('size', 'Diamètre', 0.25, 0.6, 0.01, 0.45, 'm')] },
  guitar: { category: 'backline', label: 'Guitare', tags: 'électrique acoustique basse instrument cordes', params: [choice('style', 'Type', [['electric', 'Électrique'], ['acoustic', 'Acoustique'], ['bass', 'Basse']]), bool('stand', 'Sur stand', true)] },
  amp: { category: 'backline', label: 'Amplificateur', tags: 'ampli guitare basse baffle tête', params: [choice('style', 'Type', [['combo', 'Combo guitare'], ['stack', 'Stack guitare'], ['bass', 'Ampli basse']])] },
  keyboard: { category: 'backline', label: 'Clavier', tags: 'synthé synthétiseur piano numérique stand', params: [choice('style', 'Type', [['synth', 'Synthétiseur'], ['stage', 'Piano de scène'], ['organ', 'Orgue']]), num('tiers', 'Étages', 1, 2, 1, 1)] },
  piano: { category: 'backline', label: 'Piano', tags: 'queue droit acoustique', params: [choice('style', 'Type', [['grand', 'À queue'], ['upright', 'Droit']]), bool('open', 'Couvercle ouvert', true)] },
  'music-stand': { category: 'backline', label: 'Pupitre à partitions', tags: 'lutrin partition', params: [] },

  'fog-machine': { category: 'light', label: 'Machine à fumée', tags: 'fumée brouillard hazer brume', params: [choice('style', 'Type', [['fog', 'Fumée'], ['haze', 'Brume (hazer)'], ['low', 'Fumée lourde']])] },
  'spark-machine': { category: 'light', label: 'Machine à étincelles', tags: 'sparkular étincelles effet froid', params: [] },
  'co2-jet': { category: 'light', label: 'Jet CO2', tags: 'cryo jet effet', params: [] },

  backdrop: { category: 'decor', label: 'Panneau de fond', tags: 'toile fond décor châssis', params: [choice('style', 'Type', [['panel', 'Panneau plein'], ['canvas', 'Toile tendue'], ['frame', 'Cadre décoratif']])] },
  arch: { category: 'decor', label: 'Arche', tags: 'portique décoratif arc entrée', params: [choice('style', 'Forme', [['round', 'Cintrée'], ['square', 'Carrée']]), num('thickness', 'Épaisseur', 0.05, 1, 0.05, 0.3, 'm'), bool('leds', 'Liseré LED', true)] },

  'dj-booth': { category: 'accessory', label: 'Régie DJ', tags: 'dj booth platines contrôleur', params: [bool('decks', 'Platines', true), bool('led', 'Façade LED', true)] },
  console: { category: 'accessory', label: 'Console', tags: 'régie façade mixage lumière son pupitre', params: [choice('style', 'Type', [['audio', 'Console son'], ['light', 'Console lumière']]), bool('desk', 'Sur table', true)] },
  'flight-case': { category: 'accessory', label: 'Flight-case', tags: 'malle caisse transport', params: [bool('wheels', 'Roulettes', true)], walkable: true },
  chair: { category: 'accessory', label: 'Chaise', tags: 'siège tabouret', params: [choice('style', 'Type', [['chair', 'Chaise'], ['stool', 'Tabouret']])] },
  barrier: { category: 'accessory', label: 'Barrière', tags: 'sécurité crash vauban public', params: [choice('style', 'Type', [['crash', 'Crash barrière'], ['vauban', 'Barrière Vauban']])] },
  cable: { category: 'accessory', label: 'Passage de câbles', tags: 'câble passe-câble connecteur rampe', params: [num('channels', 'Canaux', 1, 5, 1, 3)] },
};

/** Value of a parameter of a set piece: stored value when valid for the spec, else the default. */
export function paramOf(p: Pick<StageProp, 'kind' | 'params'>, key: string): ParamValue | undefined {
  const spec = EQUIPMENT[p.kind]?.params.find((x) => x.key === key);
  if (!spec) return undefined;
  return sanitizeParam(spec, p.params?.[key]) ?? spec.default;
}
export const numParam = (p: Pick<StageProp, 'kind' | 'params'>, key: string, fallback = 0): number => {
  const v = paramOf(p, key);
  return typeof v === 'number' ? v : fallback;
};
export const strParam = (p: Pick<StageProp, 'kind' | 'params'>, key: string): string => String(paramOf(p, key) ?? '');
export const boolParam = (p: Pick<StageProp, 'kind' | 'params'>, key: string): boolean => paramOf(p, key) === true;

/** A value checked against its spec (clamped and stepped numbers, known choices); undefined when unusable. */
export function sanitizeParam(spec: ParamSpec, v: unknown): ParamValue | undefined {
  switch (spec.type) {
    case 'number': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
      const stepped = Math.round(v / spec.step) * spec.step;
      return Math.round(Math.min(spec.max, Math.max(spec.min, stepped)) * 1000) / 1000;
    }
    case 'choice': return typeof v === 'string' && spec.options.some((o) => o.id === v) ? v : undefined;
    case 'bool': return typeof v === 'boolean' ? v : undefined;
    default: return typeof v === 'string' ? v.slice(0, spec.max) : undefined;
  }
}

/** Only the known, valid parameters of the kind (others dropped): safe to store after a kind change or a paste. */
export function sanitizeParams(kind: PropKind, params: Record<string, unknown> | undefined): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const spec of EQUIPMENT[kind].params) {
    const v = sanitizeParam(spec, params?.[spec.key]);
    if (v !== undefined) out[spec.key] = v;
  }
  return out;
}

/** Height of one line-array module (the array height is shared by its modules). */
export const lineArrayModules = (p: Pick<StageProp, 'kind' | 'params'>) => Math.max(1, Math.round(numParam(p, 'modules', 8)));

/**
 * Inter-module splay angles of a line array, top to bottom (n - 1 values, degrees, downwards positive): the per-module
 * list when given ("0, 1, 2"; missing values repeat the last one), else the uniform splay.
 */
export function lineArrayAngles(p: Pick<StageProp, 'kind' | 'params'>): number[] {
  const n = lineArrayModules(p);
  const listed = strParam(p, 'angles').split(/[,;\s]+/).filter(Boolean).map(Number).filter((x) => Number.isFinite(x)).map((x) => Math.min(15, Math.max(0, x)));
  const uniform = numParam(p, 'splay', 2);
  return Array.from({ length: n - 1 }, (_, i) => (listed.length ? listed[Math.min(i, listed.length - 1)]! : uniform));
}

/** Kinds a performer can stand on (floor height in the lighting estimate). */
export const WALKABLE_KINDS: ReadonlySet<PropKind> = new Set((Object.keys(EQUIPMENT) as PropKind[]).filter((k) => EQUIPMENT[k].walkable));
