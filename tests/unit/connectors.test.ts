import { IDENTITY, attach, compatible, freeConnectors, rotate, worldConnector, type CatalogPiece, type ConnectorDef, type Pose, type TrussSystem } from '../../src/core/visualizer/connectors';

const up = { x: 0, y: 0, z: 1 };
const straight = (length: number, system: TrussSystem = 'quatro'): CatalogPiece => ({
  id: `s${length}`, label: `Droite ${length} m`, system, category: 'straight', length, weightKg: 4.5 * length,
  connectors: [
    { id: 'a', pos: { x: -length / 2, y: 0, z: 0 }, dir: { x: -1, y: 0, z: 0 }, up, system, gender: 'h' },
    { id: 'b', pos: { x: length / 2, y: 0, z: 0 }, dir: { x: 1, y: 0, z: 0 }, up, system, gender: 'h' },
  ],
});
/** 90° corner: arms of 0.5 m along +x and +y from the node. */
const corner: CatalogPiece = {
  id: 'c90', label: 'Angle 90°', system: 'quatro', category: 'corner', length: 0.5, weightKg: 3,
  connectors: [
    { id: 'a', pos: { x: 0.5, y: 0, z: 0 }, dir: { x: 1, y: 0, z: 0 }, up, system: 'quatro', gender: 'h' },
    { id: 'b', pos: { x: 0, y: 0.5, z: 0 }, dir: { x: 0, y: 1, z: 0 }, up, system: 'quatro', gender: 'h' },
  ],
};
const origin: Pose = { pos: { x: 0, y: 0, z: 3 }, quat: IDENTITY };
const close = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6); expect(a.y).toBeCloseTo(b.y, 6); expect(a.z).toBeCloseTo(b.z, 6);
};

describe('connecteurs de truss', () => {
  it('deux droites bout à bout donnent la longueur cumulée', () => {
    const s2 = straight(2);
    const end = worldConnector(origin, s2.connectors[1]!);
    const pose = attach(end, straight(3), 0);
    close(pose.pos, { x: 1 + 1.5, y: 0, z: 3 });
    close(worldConnector(pose, straight(3).connectors[1]!).pos, { x: 4, y: 0, z: 3 });
  });

  it('un angle 90° puis une droite part à angle droit', () => {
    const cPose = attach(worldConnector(origin, straight(2).connectors[1]!), corner, 0);
    const out = worldConnector(cPose, corner.connectors[1]!);
    expect(Math.abs(out.dir.x)).toBeCloseTo(0, 6);
    expect(Math.abs(out.dir.y)).toBeCloseTo(1, 6);
    const s = attach(out, straight(1), 0);
    const far = worldConnector(s, straight(1).connectors[1]!);
    close(far.dir, out.dir);
    expect(far.pos.z).toBeCloseTo(3, 6);
  });

  it('4 roulis en quatro reviennent à la pose initiale, 2 en duo', () => {
    const end = worldConnector(origin, straight(2).connectors[1]!);
    const p0 = attach(end, straight(1), 0);
    const p4 = attach(end, straight(1), 0, 4);
    const v = { x: 0.3, y: 0.2, z: 0.1 };
    close(rotate(p4.quat, v), rotate(p0.quat, v));
    const p1 = attach(end, straight(1), 0, 1);
    close(rotate(p1.quat, up), { x: 0, y: 1, z: 0 });
    const d = worldConnector(origin, straight(2, 'duo').connectors[1]!);
    close(rotate(attach(d, straight(1, 'duo'), 0, 2).quat, v), rotate(attach(d, straight(1, 'duo'), 0).quat, v));
  });

  it('refuse un système ou un genre incompatible', () => {
    const quatroEnd = worldConnector(origin, straight(2).connectors[1]!);
    expect(() => attach(quatroEnd, straight(1, 'trio'), 0)).toThrow(/incompatible/);
    const m: ConnectorDef = { ...quatroEnd, gender: 'm' };
    expect(compatible(m, { ...m, gender: 'f' })).toBe(true);
    expect(compatible(m, { ...m, gender: 'm' })).toBe(false);
    expect(compatible(m, { ...m, gender: 'h' })).toBe(true);
  });

  it('liste les connecteurs libres de la structure', () => {
    const a = { id: 'p1', piece: straight(2), pose: origin, links: [] };
    const b = { id: 'p2', piece: straight(1), pose: attach(worldConnector(origin, straight(2).connectors[1]!), straight(1), 0), links: [{ connector: 'a', to: 'p1', toConnector: 'b' }] };
    const free = freeConnectors([a, b]);
    expect(free.map((f) => `${f.pieceId}:${f.connector.id}`)).toEqual(['p1:a', 'p2:b']);
    close(free[1]!.connector.pos, { x: 2, y: 0, z: 3 });
  });
});
