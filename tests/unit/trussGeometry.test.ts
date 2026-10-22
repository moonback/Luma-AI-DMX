import * as THREE from 'three';
import { buildAssembledPiece, connectorMarkers } from '../../src/renderer/features/stage3d/trussGeometry';
import { attachPiece, pieceConnector, startPiece } from '../../src/core/visualizer/assembly';
import { catalogPiece } from '../../src/core/visualizer/trussCatalog';
import type { Truss } from '../../src/core/model/schemas';

const mat = new THREE.MeshBasicMaterial();
const lattice = new THREE.LineBasicMaterial();
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
/** World box of a piece (three axes: x right, y up, z towards the audience). */
const boxOf = (pose: NonNullable<Truss['pose']>, catalogId: string) => {
  const g = buildAssembledPiece(pose, catalogPiece(catalogId)!, mat, lattice);
  g.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(g);
};

describe('rendu 3D des pièces assemblées', () => {
  // Base at x = 1, y = 2 (upstage), 3 m upright, 90° corner rolled to point stage right, 2 m span.
  let t = startPiece([], 'quatro-base', 'b', 'Embase', { x: 1, y: 2, z: 0 });
  t = attachPiece(t, 'b', 'a', 'quatro-s300', 'u', 'Montant');
  for (let roll = 0; roll < 4; roll++) {
    const next = attachPiece(t, 'u', 'b', 'quatro-c90', 'c', 'Angle', 0, roll);
    if (pieceConnector(next.at(-1)!, 'b')!.dir.x > 0.9) { t = next; break; }
  }
  t = attachPiece(t, 'c', 'b', 'quatro-s200', 's', 'Traverse');
  const byId = (id: string) => t.find((x) => x.id === id)!;

  it('dresse le montant à la verticale, au-dessus de l’embase', () => {
    const box = boxOf(byId('u').pose!, 'quatro-s300');
    expect(box.min.y).toBeCloseTo(0.01, 2);
    expect(box.max.y).toBeCloseTo(3.01, 2);
    // Stage y = 2 upstage is three z = -2.
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(-2, 2);
    expect(box.max.x - box.min.x).toBeLessThan(0.4);
  });

  it('pose la traverse à l’horizontale, côté x positif', () => {
    const box = boxOf(byId('s').pose!, 'quatro-s200');
    expect(box.max.x - box.min.x).toBeCloseTo(2, 1);
    expect(box.min.x).toBeCloseTo(1 + 0.25, 2);
    expect((box.min.y + box.max.y) / 2).toBeCloseTo(0.01 + 3 + 0.25, 2);
    expect(box.max.y - box.min.y).toBeLessThan(0.4);
  });

  it('marque le seul connecteur libre au bout de la traverse', () => {
    const g = connectorMarkers(t, 'u');
    expect(g.children).toHaveLength(1);
    const m = g.children[0]!;
    expect(m.userData.connector).toEqual({ pieceId: 's', id: 'b' });
    expect(m.position.x).toBeCloseTo(1 + 0.25 + 2, 2);
    expect(m.position.z).toBeCloseTo(-2, 2);
  });

  it('rend triangle, plat, nœud, quart de cercle et embase', () => {
    for (const id of ['trio-s100', 'duo-s100', 'quatro-x6', 'trio-r300', 'duo-base']) {
      expect(boxOf({ pos: { x: 0, y: 0, z: 2 }, quat: IDENTITY }, id).isEmpty()).toBe(false);
    }
    // A Ø 3 m quarter ring spans its radius stage right (x) and upstage (three -z).
    const ring = boxOf({ pos: { x: 0, y: 0, z: 2 }, quat: IDENTITY }, 'quatro-r300');
    expect(ring.max.x).toBeCloseTo(1.5 + 0.15, 1);
    expect(ring.min.z).toBeCloseTo(-1.5 - 0.15, 1);
  });
});
