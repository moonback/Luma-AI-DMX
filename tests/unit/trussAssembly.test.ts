import { TRUSS_CATALOG, catalogPiece } from '../../src/core/visualizer/trussCatalog';
import { cloneElement, withoutElement } from '../../src/core/visualizer/sceneEdit';
import { assemblyFreeConnectors, assemblyOf, attachPiece, chainPieces, moveAssembly, billOfMaterials, pieceConnector, placedPieces, removePiece, startPiece } from '../../src/core/visualizer/assembly';
import { attach, worldConnector, type Pose } from '../../src/core/visualizer/connectors';
import { projectSchema, trussSchema, type Truss } from '../../src/core/model/schemas';
import { createProject } from '../../src/core/project/format';

const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: { x: number; y: number; z: number }) => Math.hypot(a.x, a.y, a.z);

describe('catalogue de truss', () => {
  it('a des identifiants uniques et des connecteurs bien formés', () => {
    expect(new Set(TRUSS_CATALOG.map((p) => p.id)).size).toBe(TRUSS_CATALOG.length);
    for (const p of TRUSS_CATALOG) {
      expect(p.weightKg).toBeGreaterThan(0);
      for (const c of p.connectors) {
        expect(c.system).toBe(p.system);
        expect(len(c.dir)).toBeCloseTo(1, 9);
        expect(len(c.up)).toBeCloseTo(1, 9);
        // attach() needs the roll reference orthogonal to the outgoing direction.
        expect(dot(c.dir, c.up)).toBeCloseTo(0, 9);
      }
    }
  });

  it('4 quarts de cercle referment l’anneau', () => {
    const arc = catalogPiece('quatro-r400')!;
    let pose: Pose = { pos: { x: 0, y: 0, z: 5 }, quat: { x: 0, y: 0, z: 0, w: 1 } };
    const start = worldConnector(pose, arc.connectors[0]!);
    for (let i = 0; i < 3; i++) pose = attach(worldConnector(pose, arc.connectors[1]!), arc, 0);
    const end = worldConnector(pose, arc.connectors[1]!);
    expect(end.pos.x).toBeCloseTo(start.pos.x, 6);
    expect(end.pos.y).toBeCloseTo(start.pos.y, 6);
    expect(end.pos.z).toBeCloseTo(5, 6);
    expect(dot(end.dir, start.dir)).toBeCloseTo(-1, 6);
  });
});

describe('assemblage', () => {
  /** Half goal post: base, 3 m upright, 90° corner rolled until its free arm points stage right, 4 m span. */
  function goalPost(): Truss[] {
    let t = startPiece([], 'quatro-base', 'base1', 'Embase', { x: -2.25, y: 0, z: 0 });
    t = attachPiece(t, 'base1', 'a', 'quatro-s300', 'up1', 'Montant');
    for (let roll = 0; roll < 4; roll++) {
      const next = attachPiece(t, 'up1', 'b', 'quatro-c90', 'c1', 'Angle', 0, roll);
      if (pieceConnector(next.at(-1)!, 'b')!.dir.x > 0.9) { t = next; break; }
    }
    return attachPiece(t, 'c1', 'b', 'quatro-s400', 'span', 'Traverse');
  }

  it('monte un portique géométriquement juste', () => {
    const t = goalPost();
    const span = t.find((x) => x.id === 'span')!;
    expect(span.shape).toBe('line');
    expect(span.height).toBeCloseTo(0.01 + 3 + 0.25, 3);
    expect(Math.abs(span.rotation) % 180).toBeCloseTo(0, 3);
    expect(t.find((x) => x.id === 'up1')!.shape).toBe('totem');
    expect(pieceConnector(span, 'b')!.pos.x).toBeCloseTo(-2.25 + 0.25 + 4, 3);
  });

  it('suit les connecteurs libres et refuse un connecteur pris ou incompatible', () => {
    const t = goalPost();
    expect(assemblyFreeConnectors(t).map((f) => `${f.pieceId}:${f.connector.id}`)).toEqual(['span:b']);
    expect(() => attachPiece(t, 'up1', 'b', 'quatro-s100', 'x', 'X')).toThrow(/déjà utilisé/);
    expect(() => attachPiece(t, 'span', 'b', 'trio-s100', 'x', 'X')).toThrow(/incompatible/);
  });

  it('supprimer une pièce libère le connecteur de sa voisine', () => {
    const t = removePiece(goalPost(), 'span');
    expect(assemblyFreeConnectors(t).map((f) => `${f.pieceId}:${f.connector.id}`)).toEqual(['c1:b']);
  });

  it('déplace et tourne tout l’assemblage d’un bloc, sans toucher le reste', () => {
    const old: Truss = { id: 'old', name: 'Pont', shape: 'line', x: 0, y: 2, height: 5, length: 8, rotation: 0, support: 'towers' };
    const before = [...goalPost(), old];
    const after = moveAssembly(before, 'up1', { dx: 1, dy: 2, dz: 0.5, yaw: 90 });
    expect(after.find((t) => t.id === 'old')).toBe(old);
    const pivot = before.find((t) => t.id === 'up1')!.pose!.pos;
    const far0 = pieceConnector(before.find((t) => t.id === 'span')!, 'b')!;
    const far1 = pieceConnector(after.find((t) => t.id === 'span')!, 'b')!;
    // Turned 90° around the upright, then shifted.
    expect(far1.pos.x).toBeCloseTo(pivot.x - (far0.pos.y - pivot.y) + 1, 3);
    expect(far1.pos.y).toBeCloseTo(pivot.y + (far0.pos.x - pivot.x) + 2, 3);
    expect(far1.pos.z).toBeCloseTo(far0.pos.z + 0.5, 3);
    expect(assemblyFreeConnectors(after).map((f) => `${f.pieceId}:${f.connector.id}`)).toEqual(['span:b']);
    expect(assemblyOf(after, 'base1')).toEqual(new Set(['base1', 'up1', 'c1', 'span']));
    // Every piece turned by the same yaw, the upright included (fixtures hung on it follow by these flat fields).
    for (const id of ['up1', 'span']) {
      const turned = after.find((t) => t.id === id)!.rotation - before.find((t) => t.id === id)!.rotation;
      expect(((turned % 360) + 360) % 360).toBeCloseTo(90, 3);
    }
  });

  it('enchaîne une pièce répétée et donne le connecteur suivant', () => {
    const first = chainPieces([], null, { catalogId: 'quatro-s200', connIdx: 0, roll: 0, count: 1, vertical: true }, ['m'], { x: 0, y: 3, z: 0 });
    expect(first.next).toEqual({ pieceId: 'm', connector: 'b' });
    const r = chainPieces(first.trusses, first.next, { catalogId: 'quatro-s100', connIdx: 0, roll: 0, count: 3 }, ['a', 'b', 'c'], { x: 0, y: 0, z: 0 });
    expect(r.trusses.map((t) => t.id)).toEqual(['m', 'a', 'b', 'c']);
    expect(r.next).toEqual({ pieceId: 'c', connector: 'b' });
    // 2 m upright + 3 × 1 m straight up: the free end is 5 m high.
    expect(pieceConnector(r.trusses.at(-1)!, 'b')!.pos.z).toBeCloseTo(5, 3);
    // A base ends the chain.
    expect(chainPieces([], null, { catalogId: 'quatro-base', connIdx: 0, roll: 0, count: 3 }, ['p', 'q', 'r'], { x: 0, y: 0, z: 0 }).next).toBeNull();
    expect(() => chainPieces([], null, { catalogId: 'quatro-s100', connIdx: 0, roll: 0, count: 2 }, ['p'], { x: 0, y: 0, z: 0 })).toThrow(/Identifiant/);
  });

  it('la suppression et la copie depuis la scène gardent les liens cohérents', () => {
    const t = goalPost();
    const p = createProject('Assemblage');
    const vis = { ...p.visualizer, trusses: t };
    expect(assemblyFreeConnectors(withoutElement(vis, { kind: 'truss', id: 'span' }).trusses!).map((f) => `${f.pieceId}:${f.connector.id}`)).toEqual(['c1:b']);
    const src = t.find((x) => x.id === 'span')!;
    const copy = cloneElement(vis, 'truss', src, () => 'copy') as Truss;
    expect(copy.links).toEqual([]);
    expect(copy.pose!.pos.x - src.pose!.pos.x).toBeCloseTo(copy.x - src.x, 6);
    expect(copy.pose!.pos.y - src.pose!.pos.y).toBeCloseTo(copy.y - src.y, 6);
  });

  it('donne la nomenclature et le poids', () => {
    const bom = billOfMaterials(goalPost());
    expect(bom.total).toBe(4);
    expect(bom.lines.map((l) => l.id).sort()).toEqual(['quatro-base', 'quatro-c90', 'quatro-s300', 'quatro-s400']);
    expect(bom.weightKg).toBeCloseTo(bom.lines.reduce((s, l) => s + l.weightKg, 0), 6);
  });

  it('reste un projet valide, et les truss paramétriques sont ignorées', () => {
    const t = goalPost();
    for (const x of t) expect(trussSchema.safeParse(x).success).toBe(true);
    const p = createProject('Assemblage');
    const parsed = projectSchema.parse({ ...p, visualizer: { ...p.visualizer, trusses: [...t, { id: 'old', name: 'Pont', shape: 'line', x: 0, y: 2, height: 5, length: 8, rotation: 0, support: 'towers' }] } });
    expect(placedPieces(parsed.visualizer.trusses)).toHaveLength(4);
  });
});
