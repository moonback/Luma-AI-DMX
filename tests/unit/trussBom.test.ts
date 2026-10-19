import { describe, it, expect } from 'vitest';
import { trussBom } from '../../src/core/visualizer/trussBom';
import type { Truss } from '../../src/core/model/schemas';

const piece = (over: Partial<Truss>): Truss => ({
  id: 'x', name: 'x', shape: 'line', x: 0, y: 0, height: 6, length: 2, rotation: 0, support: 'towers', ...over,
});

describe('trussBom', () => {
  it('counts pieces by length, longest first', () => {
    const bom = trussBom([piece({ length: 2 }), piece({ length: 3 }), piece({ length: 2 }), piece({ length: 2, shape: 'corner' })]);
    expect(bom).toEqual([{ length: 3, count: 1 }, { length: 2, count: 3 }]);
  });

  it('counts a totem by its height', () => {
    expect(trussBom([piece({ shape: 'totem', height: 3, length: 0.5 })])).toEqual([{ length: 3, count: 1 }]);
  });

  it('is empty without trusses', () => {
    expect(trussBom([])).toEqual([]);
  });
});
