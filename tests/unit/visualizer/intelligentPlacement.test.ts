import { describe, expect, it } from 'vitest';
import type { Fixture, Truss } from '../../../src/core/model/schemas';
import { proposeIntelligentPlacements } from '../../../src/core/visualizer/intelligentPlacement';

const fixture = (overrides: Partial<Fixture> = {}): Fixture => ({
  id: 'fx-1',
  name: 'Lyre 1',
  profileId: 'profile-1',
  mode: 'Standard',
  universe: 1,
  address: 1,
  tags: [],
  position: { x: 0, y: 1.8 },
  rotation: 0,
  height: 4,
  mount: 'auto',
  notes: '',
  ...overrides,
}) as Fixture;

const truss = (overrides: Partial<Truss> = {}): Truss => ({
  id: 'truss-front',
  name: 'Pont avant',
  shape: 'line',
  x: 0,
  y: 2,
  height: 5,
  length: 10,
  rotation: 0,
  support: 'towers',
  ...overrides,
});

describe('proposeIntelligentPlacements', () => {
  it('prefers an explicit reviewed support label over geometric proximity', () => {
    const result = proposeIntelligentPlacements([
      fixture({
        visualRecognition: {
          label: 'Lyre spot',
          description: 'Étiquette visible',
          observedType: 'moving-head-spot',
          confidence: 0.9,
          mountGuess: 'hanging',
          supportHint: 'Pont arrière',
          verifiedAt: '2026-11-09T10:00:00.000Z',
        },
      }),
    ], [
      truss({ id: 'front', name: 'Pont avant', y: 2 }),
      truss({ id: 'back', name: 'Pont arrière', y: -2 }),
    ]);
    expect(result.placements[0]).toMatchObject({ trussId: 'back', reason: 'support-name', confidence: 0.95 });
  });

  it('uses the unique nearest truss only inside the configured distance', () => {
    const result = proposeIntelligentPlacements([fixture()], [
      truss({ id: 'near', y: 2 }),
      truss({ id: 'far', y: -2 }),
    ]);
    expect(result.placements[0]).toMatchObject({ trussId: 'near', reason: 'spatial-proximity', height: 4.8 });
  });

  it('does not guess when two trusses are equally close', () => {
    const result = proposeIntelligentPlacements([fixture({ position: { x: 0, y: 0 } })], [
      truss({ id: 'front', y: 1 }),
      truss({ id: 'back', y: -1 }),
    ]);
    expect(result.placements).toHaveLength(0);
    expect(result.skipped[0]).toMatchObject({ reason: 'ambiguous' });
  });

  it('preserves existing links and floor/wall fixtures', () => {
    const result = proposeIntelligentPlacements([
      fixture({ id: 'linked', trussId: 'existing' }),
      fixture({ id: 'floor', mount: 'floor' }),
      fixture({ id: 'visual-floor', visualRecognition: {
        label: 'PAR',
        description: '',
        observedType: 'par',
        confidence: 0.8,
        mountGuess: 'floor',
        supportHint: '',
        verifiedAt: '2026-11-09T10:00:00.000Z',
      } }),
    ], [truss()]);
    expect(result.placements).toHaveLength(0);
    expect(result.skipped.map((item) => item.reason)).toEqual(['already-linked', 'floor-or-wall', 'floor-or-wall']);
  });

  it('does not attach fixtures to distant trusses', () => {
    const result = proposeIntelligentPlacements([fixture({ position: { x: 0, y: -20 } })], [truss()]);
    expect(result.placements).toHaveLength(0);
    expect(result.skipped[0]).toMatchObject({ reason: 'no-match' });
  });
});
