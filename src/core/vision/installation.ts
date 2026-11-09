/**
 * Installation cartography model.
 *
 * Converts the existing DMX patch and camera localisation results into a stable,
 * UI-independent representation for the 2D/3D installation map. It deliberately
 * distinguishes measured positions from patch fallbacks and preserves the
 * project's legacy auto-mount convention while marking inferred mount types.
 */

export type InstallationMount = 'hanging' | 'floor' | 'wall' | 'unknown';
export type PositionSource = 'camera-triangulated' | 'camera-height-estimate' | 'patch';

export interface InstallationFixtureInput {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  universe: number;
  address: number;
  channels: number;
  position: { x: number; y: number };
  height: number;
  mount?: 'auto' | 'hanging' | 'floor' | 'wall';
  trussId?: string | null;
  visualRecognition?: {
    label: string;
    description: string;
    observedType: string;
    confidence: number;
    verifiedAt: string;
  };
}

export interface InstallationLocatedInput {
  fixtureId: string;
  position: [number, number, number];
  method: 'triangulated' | 'height';
  uncertainty: number;
  views: number;
}

export interface InstallationIssueInput {
  kind: string;
  fixtureIds: string[];
  message: string;
}

export interface InstallationFixture {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  dmx: { universe: number; address: number; channels: number };
  position: { x: number; y: number; z: number };
  positionSource: PositionSource;
  /** Heuristic quality indicator derived from geometric uncertainty, not a probability. */
  positionQuality: number;
  uncertainty: number | null;
  views: number;
  mount: InstallationMount;
  mountIsInferred: boolean;
  supportId: string | null;
  zone: 'stage-left' | 'centre' | 'stage-right';
  visualRecognition?: InstallationFixtureInput['visualRecognition'];
  issues: InstallationIssueInput[];
}

export interface InstallationSupport {
  id: string;
  fixtureIds: string[];
  kind: 'truss' | 'unassigned';
}

export interface InstallationMap {
  schemaVersion: 1;
  coordinateSystem: 'stage-metres';
  fixtures: InstallationFixture[];
  supports: InstallationSupport[];
  summary: {
    total: number;
    cameraMeasured: number;
    triangulated: number;
    estimatedFromHeight: number;
    patchOnly: number;
    withIssues: number;
    unknownMount: number;
    visuallyRecognized: number;
  };
}

const finite = (n: number): boolean => Number.isFinite(n);
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

function mountOf(f: InstallationFixtureInput): { mount: InstallationMount; inferred: boolean } {
  if (f.mount && f.mount !== 'auto') return { mount: f.mount, inferred: false };
  // Preserve the project schema's legacy convention: auto/absent means floor below 1 m, hanging otherwise.
  if (f.height < 1) return { mount: 'floor', inferred: true };
  return { mount: 'hanging', inferred: true };
}

function zoneOf(x: number): InstallationFixture['zone'] {
  if (Math.abs(x) < 0.5) return 'centre';
  return x < 0 ? 'stage-left' : 'stage-right';
}

/**
 * Build a cartographic snapshot from the patch, camera solution and diagnostics.
 * Camera coordinates win only when all three coordinates and uncertainty are finite.
 * A missing/invalid camera solution safely falls back to the existing patch position.
 */
export function buildInstallationMap(
  fixtures: InstallationFixtureInput[],
  located: InstallationLocatedInput[] = [],
  issues: InstallationIssueInput[] = [],
): InstallationMap {
  const locatedById = new Map(located.map((item) => [item.fixtureId, item]));
  const issuesById = new Map<string, InstallationIssueInput[]>();
  for (const issue of issues) {
    for (const id of issue.fixtureIds) {
      issuesById.set(id, [...(issuesById.get(id) ?? []), issue]);
    }
  }

  const mapped: InstallationFixture[] = fixtures.map((fixture) => {
    const candidate = locatedById.get(fixture.id);
    const validCamera = candidate !== undefined
      && candidate.position.every(finite)
      && finite(candidate.uncertainty)
      && candidate.uncertainty >= 0
      && finite(candidate.views)
      && candidate.views >= 1;
    const source: PositionSource = validCamera
      ? candidate.method === 'triangulated' ? 'camera-triangulated' : 'camera-height-estimate'
      : 'patch';
    const position = validCamera
      ? { x: candidate.position[0], y: candidate.position[1], z: candidate.position[2] }
      : { x: fixture.position.x, y: fixture.position.y, z: fixture.height };
    const uncertainty = validCamera ? candidate.uncertainty : null;
    // This is a display score, not a statistical confidence interval.
    const geometricQuality = validCamera ? clamp01(1 / (1 + candidate.uncertainty * 4)) : 0;
    const positionQuality = source === 'camera-height-estimate'
      ? Math.min(0.55, geometricQuality)
      : geometricQuality;
    const mounting = mountOf(fixture);

    return {
      id: fixture.id,
      name: fixture.name,
      manufacturer: fixture.manufacturer,
      model: fixture.model,
      dmx: { universe: fixture.universe, address: fixture.address, channels: fixture.channels },
      position,
      positionSource: source,
      positionQuality,
      uncertainty,
      views: validCamera ? candidate.views : 0,
      mount: mounting.mount,
      mountIsInferred: mounting.inferred,
      supportId: fixture.trussId || null,
      zone: zoneOf(position.x),
      ...(fixture.visualRecognition ? { visualRecognition: fixture.visualRecognition } : {}),
      issues: issuesById.get(fixture.id) ?? [],
    };
  });

  const supportGroups = new Map<string, string[]>();
  for (const fixture of mapped) {
    if (!fixture.supportId) continue;
    supportGroups.set(fixture.supportId, [...(supportGroups.get(fixture.supportId) ?? []), fixture.id]);
  }
  const supports: InstallationSupport[] = [...supportGroups.entries()].map(([id, fixtureIds]) => ({
    id, fixtureIds, kind: 'truss',
  }));

  const triangulated = mapped.filter((f) => f.positionSource === 'camera-triangulated').length;
  const estimatedFromHeight = mapped.filter((f) => f.positionSource === 'camera-height-estimate').length;
  return {
    schemaVersion: 1,
    coordinateSystem: 'stage-metres',
    fixtures: mapped,
    supports,
    summary: {
      total: mapped.length,
      cameraMeasured: triangulated + estimatedFromHeight,
      triangulated,
      estimatedFromHeight,
      patchOnly: mapped.length - triangulated - estimatedFromHeight,
      withIssues: mapped.filter((f) => f.issues.length > 0).length,
      unknownMount: mapped.filter((f) => f.mount === 'unknown').length,
      visuallyRecognized: mapped.filter((f) => !!f.visualRecognition).length,
    },
  };
}
