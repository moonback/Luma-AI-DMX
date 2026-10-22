import { describe, it, expect } from 'vitest';
import { crowdSpots } from '../../src/renderer/features/stage3d/crowd';
import type { StageGeometry } from '../../src/core/visualizer/beam';

const stage = (o: Partial<StageGeometry> = {}): StageGeometry => ({ width: 10, depth: 8, wallHeight: 6, wall: true, thrust: null, arena: false, props: [], ...o });

describe('Stage 3D — Foule', () => {
  it('place le public devant la scène, jamais sur le plateau, avec un plafond', () => {
    const spots = crowdSpots(stage());
    expect(spots.length).toBeGreaterThan(100);
    expect(spots.length).toBeLessThanOrEqual(2500);
    expect(spots.every((s) => s.z > 0)).toBe(true);
  });

  it('laisse libre le praticable (thrust) et la scène en arène', () => {
    const thrust = crowdSpots(stage({ thrust: { width: 3, depth: 6 } }));
    expect(thrust.some((s) => Math.abs(s.x) < 1.5 && s.z < 6)).toBe(false);
    const arena = crowdSpots(stage({ arena: true }));
    expect(arena.some((s) => Math.abs(s.x) < 5 && s.z > -8 && s.z < 0)).toBe(false);
    expect(arena.some((s) => s.z < -8)).toBe(true); // derrière la scène aussi
  });

  it('garde la même disposition entre deux reconstructions', () => {
    expect(crowdSpots(stage())).toEqual(crowdSpots(stage()));
  });
});
