import { describe, it, expect } from 'vitest';
import { chainFromPoints, groupTrusses, snapPoint } from '../../src/core/visualizer/trussBuild';
import { trussSchema, type Truss } from '../../src/core/model/schemas';

let n = 0;
const id = () => `t${++n}`;

const piece = (over: Partial<Truss>): Truss => ({
  id: id(), name: 'Pièce', shape: 'line', x: 0, y: 0, height: 6, length: 2, rotation: 0, support: 'towers', ...over,
});

describe('chainFromPoints', () => {
  it('cuts a 4 m segment into two pieces of the same group, centred on each half', () => {
    const pieces = chainFromPoints([{ x: 0, y: 0 }, { x: 4, y: 0 }], 6, id, 'g1', 'Structure');
    expect(pieces).toHaveLength(2);
    expect(pieces.map((p) => p.x)).toEqual([1, 3]);
    expect(pieces.map((p) => p.length)).toEqual([2, 2]);
    expect(pieces.every((p) => p.groupId === 'g1' && p.rotation === 0 && p.shape === 'line')).toBe(true);
  });

  it('orients each segment along its direction', () => {
    const pieces = chainFromPoints([{ x: 0, y: 0 }, { x: 0, y: 2 }], 6, id, 'g1', 'S');
    expect(pieces).toHaveLength(1);
    expect(pieces[0]!.rotation).toBe(90);
  });

  it('skips segments under 0.5 m, so repeated clicks do not create pieces', () => {
    expect(chainFromPoints([{ x: 1, y: 1 }, { x: 1.2, y: 1 }], 6, id, 'g1', 'S')).toEqual([]);
  });

  it('produces pieces the truss schema accepts', () => {
    const pieces = chainFromPoints([{ x: -3, y: 1 }, { x: 3.5, y: 1 }], 6, id, 'g1', 'S');
    expect(pieces.length).toBeGreaterThan(0);
    expect(pieces.every((p) => trussSchema.safeParse(p).success)).toBe(true);
  });
});

describe('groupTrusses', () => {
  it('groups pieces by groupId and ignores ungrouped ones', () => {
    const groups = groupTrusses([piece({ groupId: 'a' }), piece({ groupId: 'a' }), piece({ groupId: 'b' }), piece({})]);
    expect(groups.get('a')).toHaveLength(2);
    expect(groups.get('b')).toHaveLength(1);
    expect(groups.size).toBe(2);
  });
});

describe('snapPoint', () => {
  it('snaps onto the end of a close truss, otherwise keeps the point', () => {
    const t = piece({ x: 0, y: 0, length: 2, rotation: 0 }); // ends at (-1, 0) and (1, 0)
    expect(snapPoint({ x: 1.2, y: 0.1 }, [t])).toEqual({ x: 1, y: 0 });
    expect(snapPoint({ x: 3, y: 3 }, [t])).toEqual({ x: 3, y: 3 });
  });
});
