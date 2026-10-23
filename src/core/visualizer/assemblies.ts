import { propSchema, trussSchema, type Project, type StageProp, type Truss } from '../model/schemas';
import type { P2 } from './truss';
import type { EquipmentCategory } from './equipment';

/**
 * Ready-made assemblies of several stage elements (goalpost, ground-support roof, rigging grid, PA system, drum
 * riser): placed around a point, made of ordinary trusses and set pieces, so each part stays editable and fixtures
 * hang on the trusses as usual. Visual layouts only: never a structural or load calculation.
 */
type Vis = Project['visualizer'];
export type AssemblyId = 'goalpost' | 'roof' | 'grid' | 'pa-system' | 'drum-riser';
export interface Assembly { id: AssemblyId; group: EquipmentCategory; label: string; hint: string }

export const ASSEMBLIES: Assembly[] = [
  { id: 'goalpost', group: 'structure', label: 'Portique 6 × 4 m', hint: '2 totems et une poutre' },
  { id: 'roof', group: 'structure', label: 'Toiture 10 × 8 m', hint: '4 tours, cadre de poutres, moteurs et toit' },
  { id: 'grid', group: 'structure', label: 'Grille de rigging 10 × 6 m', hint: 'cadre suspendu et poutre centrale' },
  { id: 'pa-system', group: 'sound', label: 'Système de façade', hint: '2 line arrays suspendus et 4 caissons' },
  { id: 'drum-riser', group: 'backline', label: 'Batterie sur praticable', hint: 'praticable 3 × 2 m et batterie' },
];
export const assembly = (id: string) => ASSEMBLIES.find((a) => a.id === id);

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Elements of the assembly centred on `at` (stage width used by the PA system); ids from `id`. */
export function buildAssembly(id: AssemblyId, vis: Pick<Vis, 'stageWidth' | 'stageDepth'>, at: P2, newId: () => string): { trusses: Truss[]; props: StageProp[] } {
  const trusses: Truss[] = [], props: StageProp[] = [];
  const truss = (name: string, x: number, y: number, height: number, length: number, extra: Partial<Truss> = {}) =>
    trusses.push(trussSchema.parse({ id: newId(), name, shape: 'line', x: r2(at.x + x), y: r2(at.y + y), height, length, rotation: 0, support: 'none', ...extra }));
  const prop = (p: Omit<StageProp, 'id' | 'x' | 'y' | 'rotation'> & { rotation?: number }, x: number, y: number) =>
    props.push(propSchema.parse({ rotation: 0, ...p, id: newId(), x: r2(at.x + x), y: r2(at.y + y) }));
  switch (id) {
    case 'goalpost': {
      const span = 6, h = 4;
      for (const s of [-1, 1]) truss(`Portique ${s < 0 ? 'jardin' : 'cour'}`, (s * span) / 2, 0, h, 0.5, { shape: 'totem' });
      truss('Portique', 0, 0, h, span);
      break;
    }
    case 'roof': {
      const w = 10, d = 8, h = 7;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        truss('Tour', (sx * w) / 2, (sy * d) / 2, h, 0.5, { shape: 'totem' });
        prop({ kind: 'hoist', name: 'Moteur', width: 0.3, depth: 0.3, height: 0.5, elevation: h + 0.25, color: '#1f2937', params: { chain: 1 } }, (sx * w) / 2, (sy * d) / 2);
      }
      truss('Toiture face', 0, -d / 2, h, w);
      truss('Toiture lointain', 0, d / 2, h, w);
      truss('Toiture jardin', -w / 2, 0, h, d, { rotation: 90 });
      truss('Toiture cour', w / 2, 0, h, d, { rotation: 90 });
      prop({ kind: 'canopy', name: 'Toit', width: w + 1, depth: d + 1, height: 1.5, elevation: h + 0.2, color: '#e5e7eb', params: { style: 'pitched' } }, 0, 0);
      break;
    }
    case 'grid': {
      const w = 10, d = 6, h = 7;
      truss('Grille face', 0, -d / 2, h, w, { support: 'hung' });
      truss('Grille milieu', 0, 0, h, w, { support: 'hung' });
      truss('Grille lointain', 0, d / 2, h, w, { support: 'hung' });
      truss('Grille jardin', -w / 2, 0, h, d, { rotation: 90 });
      truss('Grille cour', w / 2, 0, h, d, { rotation: 90 });
      break;
    }
    case 'pa-system': {
      const side = Math.max(2, vis.stageWidth / 2 + 0.8);
      for (const s of [-1, 1]) {
        const name = s < 0 ? 'jardin' : 'cour';
        prop({ kind: 'line-array', name: `Line array ${name}`, width: 1.1, depth: 0.5, height: 3.9, elevation: 5, color: '#16181d', params: { modules: 12, splay: 1.5, bumper: true, flown: true } }, s * side, 0.3);
        for (const k of [0, 1]) prop({ kind: 'sub', name: `Sub ${name}`, width: 0.7, depth: 0.8, height: 0.55, elevation: k * 0.55, color: '#121418', params: { drivers: '1x18' } }, s * side, -0.5);
        prop({ kind: 'sub', name: `Sub ${name}`, width: 0.7, depth: 0.8, height: 0.55, elevation: 0, color: '#121418', params: { drivers: '1x18' } }, s * (side - 0.75), -0.5);
      }
      break;
    }
    case 'drum-riser':
      prop({ kind: 'riser', name: 'Praticable batterie', width: 3, depth: 2, height: 0.6, elevation: 0, color: '#2a2f3a', params: { skirt: true } }, 0, 0);
      prop({ kind: 'drums', name: 'Batterie', width: 1.8, depth: 1.5, height: 1.4, elevation: 0.6, color: '#9b1c1c', params: { kit: '5', cymbals: 3 } }, 0, 0);
      break;
  }
  return { trusses, props };
}

/** Visualizer patch appending the assembly, or null when it would exceed the element limits. */
export function withAssembly(vis: Vis, parts: { trusses: Truss[]; props: StageProp[] }): Partial<Vis> | null {
  if (vis.trusses.length + parts.trusses.length > 64 || vis.props.length + parts.props.length > 256) return null;
  return {
    ...(parts.trusses.length ? { trusses: [...vis.trusses, ...parts.trusses] } : {}),
    ...(parts.props.length ? { props: [...vis.props, ...parts.props] } : {}),
  };
}
