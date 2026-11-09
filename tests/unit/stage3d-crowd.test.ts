import { describe, expect, it } from 'vitest';
import type { StageGeometry } from '../../src/core/visualizer/beam';
import { crowdSpots, seatedCrowdSpots } from '../../src/renderer/features/stage3d/crowd';

const largeStage: StageGeometry = {
  width: 22,
  depth: 19,
  wallHeight: 12,
  wall: true,
  thrust: null,
  arena: false,
  props: [],
};

describe('3D demo audience', () => {
  it('creates eight populated seated rows on large-format stages', () => {
    const seats = seatedCrowdSpots(largeStage);
    expect(seats.length).toBeGreaterThan(250);
    expect(new Set(seats.map((spot) => spot.height)).size).toBe(8);
    expect(seats.every((spot) => spot.z >= 10 && spot.z < 18)).toBe(true);
  });

  it('keeps standing spectators in front of the grandstands', () => {
    const standing = crowdSpots(largeStage);
    expect(standing.length).toBeGreaterThan(0);
    expect(standing.every((spot) => spot.z < 10)).toBe(true);
  });

  it('does not add grandstands to compact stages', () => {
    const compact = { ...largeStage, width: 12, depth: 8 };
    expect(seatedCrowdSpots(compact)).toHaveLength(0);
  });
});
