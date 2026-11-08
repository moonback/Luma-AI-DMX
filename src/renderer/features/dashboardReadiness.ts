import type { OutputStatus } from '../../core/protocols/config';

export type ReadinessLevel = 'ready' | 'warning' | 'blocked' | 'unknown';
export type ReadinessCheckId = 'patch' | 'profiles' | 'outputs' | 'project' | 'safety';

export interface ReadinessCheck {
  id: ReadinessCheckId;
  level: ReadinessLevel;
  count?: number;
  page?: 'fixtures' | 'output' | 'settings';
}

export interface DashboardReadinessInput {
  patchCount: number;
  patchIssueCount: number;
  resolvedFixtureCount: number;
  outputs: readonly OutputStatus[] | null;
  projectPath: string | null;
  projectDirty: boolean;
  flashGuardViolation: boolean | null;
}

/**
 * Evaluates only facts already exposed by the application.
 * This is a preparation checklist, not a certification that a physical rig is safe.
 */
export function evaluateDashboardReadiness(input: DashboardReadinessInput): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];

  checks.push({
    id: 'patch',
    level: input.patchIssueCount > 0 ? 'blocked' : input.patchCount === 0 ? 'warning' : 'ready',
    count: input.patchIssueCount,
    page: 'fixtures',
  });

  checks.push({
    id: 'profiles',
    level: input.patchCount === 0
      ? 'unknown'
      : input.resolvedFixtureCount < input.patchCount
        ? 'blocked'
        : 'ready',
    count: Math.max(0, input.patchCount - input.resolvedFixtureCount),
    page: 'fixtures',
  });

  if (input.outputs === null) {
    checks.push({ id: 'outputs', level: 'unknown', page: 'output' });
  } else {
    const enabled = input.outputs.filter((output) => output.enabled);
    const errors = enabled.filter((output) => output.state === 'error');
    const real = enabled.filter((output) => output.real);
    const armedReady = real.filter((output) => output.armed && output.state === 'ready');

    checks.push({
      id: 'outputs',
      level: errors.length > 0
        ? 'blocked'
        : enabled.length === 0 || (real.length > 0 && armedReady.length === 0)
          ? 'warning'
          : 'ready',
      count: errors.length || (real.length > 0 ? armedReady.length : enabled.length),
      page: 'output',
    });
  }

  checks.push({
    id: 'project',
    level: !input.projectPath || input.projectDirty ? 'warning' : 'ready',
  });

  checks.push({
    id: 'safety',
    level: input.flashGuardViolation === null
      ? 'unknown'
      : input.flashGuardViolation
        ? 'blocked'
        : 'ready',
    page: 'settings',
  });

  return checks;
}

export function summarizeReadiness(checks: readonly ReadinessCheck[]): ReadinessLevel {
  if (checks.some((check) => check.level === 'blocked')) return 'blocked';
  if (checks.some((check) => check.level === 'warning')) return 'warning';
  if (checks.some((check) => check.level === 'unknown')) return 'unknown';
  return 'ready';
}
