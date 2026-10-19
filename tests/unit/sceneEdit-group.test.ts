import { describe, it, expect } from 'vitest';
import { roomFor, withMovedGroup, withoutGroup } from '../../src/core/visualizer/sceneEdit';
import type { Project, Truss } from '../../src/core/model/schemas';

type Vis = Project['visualizer'];

const piece = (id: string, over: Partial<Truss> = {}): Truss => ({
  id, name: id, shape: 'line', x: 0, y: 0, height: 6, length: 2, rotation: 0, support: 'towers', ...over,
});
const vis = (trusses: Truss[]) => ({ trusses, markers: [], performers: [], screens: [], props: [] }) as unknown as Vis;

describe('roomFor', () => {
  it('counts the free slots left for trusses (the 64 limit is unchanged)', () => {
    expect(roomFor(vis([piece('a'), piece('b'), piece('c')]), 'truss')).toBe(61);
  });
});

describe('withMovedGroup', () => {
  it('moves only the pieces of the group, clamped to the stage bounds', () => {
    const v = vis([piece('a', { groupId: 'g', x: 98 }), piece('b', { groupId: 'h', x: 1 }), piece('c', { x: 1 })]);
    const moved = withMovedGroup(v, 'g', 5, -2).trusses!;
    expect(moved.map((t) => [t.id, t.x, t.y])).toEqual([['a', 100, -2], ['b', 1, 0], ['c', 1, 0]]);
  });
});

describe('withoutGroup', () => {
  it('removes every piece of the group and keeps the others', () => {
    const v = vis([piece('a', { groupId: 'g' }), piece('b', { groupId: 'g' }), piece('c')]);
    expect(withoutGroup(v, 'g').trusses!.map((t) => t.id)).toEqual(['c']);
  });
});
