import { describe, expect, it } from 'vitest';
import { buildInstallationMap, type InstallationFixtureInput } from './installation';

const fixture = (overrides: Partial<InstallationFixtureInput> = {}): InstallationFixtureInput => ({
  id: 'fx-1',
  name: 'Spot 1',
  manufacturer: 'Example',
  model: 'Spot',
  universe: 1,
  address: 101,
  channels: 16,
  position: { x: -2, y: 3 },
  height: 5,
  ...overrides,
});

describe('buildInstallationMap', () => {
  it('keeps patch coordinates when no camera measurement exists', () => {
    const map = buildInstallationMap([fixture()]);
    expect(map.fixtures[0]).toMatchObject({
      position: { x: -2, y: 3, z: 5 },
      positionSource: 'patch',
      positionQuality: 0,
      mount: 'unknown',
    });
    expect(map.summary.patchOnly).toBe(1);
  });

  it('uses triangulated coordinates and records uncertainty and view count', () => {
    const map = buildInstallationMap([fixture()], [{
      fixtureId: 'fx-1',
      position: [1.25, 4.5, 6],
      method: 'triangulated',
      uncertainty: 0.1,
      views: 3,
    }]);
    expect(map.fixtures[0]).toMatchObject({
      position: { x: 1.25, y: 4.5, z: 6 },
      positionSource: 'camera-triangulated',
      uncertainty: 0.1,
      views: 3,
      zone: 'stage-right',
    });
    expect(map.summary.triangulated).toBe(1);
  });

  it('caps height-only estimates below triangulated quality', () => {
    const map = buildInstallationMap([fixture()], [{
      fixtureId: 'fx-1',
      position: [0, 2, 5],
      method: 'height',
      uncertainty: 0.01,
      views: 1,
    }]);
    expect(map.fixtures[0]!.positionQuality).toBeLessThanOrEqual(0.55);
    expect(map.fixtures[0]!.positionSource).toBe('camera-height-estimate');
  });

  it('does not trust invalid camera measurements', () => {
    const map = buildInstallationMap([fixture()], [{
      fixtureId: 'fx-1',
      position: [Number.NaN, 2, 5],
      method: 'triangulated',
      uncertainty: 0.1,
      views: 2,
    }]);
    expect(map.fixtures[0]!.positionSource).toBe('patch');
    expect(map.fixtures[0]!.position).toEqual({ x: -2, y: 3, z: 5 });
  });

  it('groups fixtures by explicit truss and attaches diagnostics', () => {
    const map = buildInstallationMap([
      fixture({ id: 'fx-1', trussId: 'truss-front' }),
      fixture({ id: 'fx-2', trussId: 'truss-front', mount: 'hanging' }),
    ], [], [{ kind: 'moved', fixtureIds: ['fx-2'], message: 'Position différente du patch' }]);
    expect(map.supports).toEqual([{ id: 'truss-front', fixtureIds: ['fx-1', 'fx-2'], kind: 'truss' }]);
    expect(map.fixtures[1]!.issues).toHaveLength(1);
    expect(map.fixtures[1]!.mount).toBe('hanging');
    expect(map.summary.withIssues).toBe(1);
  });

  it('uses the legacy floor-height convention only as an inferred mount', () => {
    const map = buildInstallationMap([fixture({ height: 0.4 })]);
    expect(map.fixtures[0]).toMatchObject({ mount: 'floor', mountIsInferred: true });
  });
});
