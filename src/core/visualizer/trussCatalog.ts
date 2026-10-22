import type { CatalogPiece, ConnectorDef, TrussSystem, V3 } from './connectors';

/**
 * Generic catalogue of assembly pieces (docs/roadmap/truss-builder.md, phase 2): 29 cm truss in 4 chords (square),
 * 3 chords (triangle) and 2 chords (flat ladder). No brand names: indicative weights only, never load data.
 * Piece frame: a straight lies on x around its centre, a junction / corner sits on its node, z up.
 */
export const SYSTEM_LABEL: Record<TrussSystem, string> = { quatro: 'Carré 29 cm', trio: 'Triangle 29 cm', duo: 'Plat 29 cm' };
export const CATEGORY_LABEL: Record<CatalogPiece['category'], string> = {
  straight: 'Droites', corner: 'Angles', junction: 'Nœuds', circle: 'Cercles', base: 'Embases', special: 'Spéciaux',
};

/** Indicative aluminium weight per meter, plus the couplers of each end. */
const KG_PER_M: Record<TrussSystem, number> = { quatro: 4.6, trio: 3.6, duo: 2.4 };
const KG_PER_END = 0.4;
/** Arm length of node pieces (half the side of a corner block, coupler included). */
const NODE_ARM = 0.25;

export const STRAIGHT_LENGTHS = [0.25, 0.5, 1, 1.5, 2, 2.5, 3, 4];
/** Interior angle between the two arms of a planar corner (180° would be a straight). */
export const CORNER_ANGLES = [60, 90, 120, 135];
export const CIRCLE_DIAMETERS = [2, 3, 4, 5, 6];

const Z: V3 = { x: 0, y: 0, z: 1 };
const X: V3 = { x: 1, y: 0, z: 0 };
const round = (n: number) => Math.round(n * 1e9) / 1e9;
const v = (x: number, y: number, z: number): V3 => ({ x: round(x), y: round(y), z: round(z) });
const kg = (system: TrussSystem, meters: number, ends: number) => Math.round((KG_PER_M[system] * meters + KG_PER_END * ends) * 10) / 10;
/** Roll reference of an arm: up for horizontal arms, x for vertical ones. */
const upOf = (dir: V3) => (Math.abs(dir.z) > 0.5 ? X : Z);
const conn = (id: string, pos: V3, dir: V3, system: TrussSystem): ConnectorDef => ({ id, pos, dir, up: upOf(dir), system, gender: 'h' });
/** Node piece with one arm per direction. */
const node = (system: TrussSystem, id: string, label: string, category: CatalogPiece['category'], dirs: V3[]): CatalogPiece => ({
  id: `${system}-${id}`, label, system, category, length: NODE_ARM * 2, weightKg: kg(system, NODE_ARM * dirs.length, dirs.length),
  connectors: dirs.map((d, i) => conn(String.fromCharCode(97 + i), v(d.x * NODE_ARM, d.y * NODE_ARM, d.z * NODE_ARM), d, system)),
});

function piecesOf(system: TrussSystem): CatalogPiece[] {
  const out: CatalogPiece[] = [];
  for (const len of STRAIGHT_LENGTHS) {
    out.push({
      id: `${system}-s${len * 100}`, label: `Droite ${String(len).replace('.', ',')} m`, system, category: 'straight', length: len, weightKg: kg(system, len, 2),
      connectors: [conn('a', v(-len / 2, 0, 0), v(-1, 0, 0), system), conn('b', v(len / 2, 0, 0), X, system)],
    });
  }
  for (const deg of CORNER_ANGLES) {
    const a = (deg * Math.PI) / 180;
    out.push(node(system, `c${deg}`, `Angle ${deg}°`, 'corner', [X, v(Math.cos(a), Math.sin(a), 0)]));
  }
  const px = X, nx = v(-1, 0, 0), py = v(0, 1, 0), ny = v(0, -1, 0), pz = Z, nz = v(0, 0, -1);
  out.push(
    node(system, 'c3d', 'Angle 3D 3 départs', 'junction', [px, py, pz]),
    node(system, 't3', 'Té 3 départs', 'junction', [px, nx, py]),
    node(system, 't4', 'Té 4 départs (3D)', 'junction', [px, nx, py, pz]),
    node(system, 'x4', 'Croix 4 départs', 'junction', [px, nx, py, ny]),
    node(system, 'x5', 'Croix 5 départs (3D)', 'junction', [px, nx, py, ny, pz]),
    node(system, 'x6', 'Nœud 6 départs', 'junction', [px, nx, py, ny, pz, nz]),
  );
  for (const d of CIRCLE_DIAMETERS) {
    // Quarter arc of the circle centred on the piece origin, from angle 0 to 90° (4 make a full ring).
    const r = d / 2;
    out.push({
      id: `${system}-r${d * 100}`, label: `Quart de cercle Ø ${d} m`, system, category: 'circle', length: round((Math.PI * r) / 2), weightKg: kg(system, (Math.PI * r) / 2, 2),
      connectors: [conn('a', v(r, 0, 0), v(0, -1, 0), system), conn('b', v(0, r, 0), nx, system)],
    });
  }
  out.push({
    id: `${system}-base`, label: 'Embase', system, category: 'base', length: 0.6, weightKg: 12,
    connectors: [conn('a', v(0, 0, 0.01), pz, system)],
  });
  return out;
}

export const TRUSS_CATALOG: CatalogPiece[] = (['quatro', 'trio', 'duo'] as const).flatMap(piecesOf);

export const catalogPiece = (id: string) => TRUSS_CATALOG.find((p) => p.id === id);
