import { describe, expect, it } from 'vitest';
import type { OutputStatus } from '../../src/core/protocols/config';
import { evaluateDashboardReadiness, summarizeReadiness } from '../../src/renderer/features/dashboardReadiness';

const output = (overrides: Partial<OutputStatus> = {}): OutputStatus => ({
  id: 'out-1',
  name: 'Virtual',
  kind: 'virtual',
  real: false,
  enabled: true,
  armed: false,
  state: 'ready',
  detail: '',
  stats: { framesSent: 0, packetsSent: 0, bytesSent: 0, errors: 0, lastError: null, lastErrorAt: null, lastSendAt: null, measuredFps: 0 },
  ...overrides,
});

const base = {
  patchCount: 4,
  patchIssueCount: 0,
  resolvedFixtureCount: 4,
  outputs: [output()],
  projectPath: 'C:/shows/demo.luma',
  projectDirty: false,
  flashGuardViolation: false,
};

describe('dashboard readiness', () => {
  it('marks a complete simulated project as ready without claiming physical output', () => {
    const checks = evaluateDashboardReadiness(base);
    expect(checks.map((check) => check.level)).toEqual(['ready', 'ready', 'ready', 'ready', 'ready']);
    expect(summarizeReadiness(checks)).toBe('ready');
  });

  it('blocks a patch with conflicts and unresolved fixture profiles', () => {
    const checks = evaluateDashboardReadiness({ ...base, patchIssueCount: 2, resolvedFixtureCount: 3 });
    expect(checks.find((check) => check.id === 'patch')?.level).toBe('blocked');
    expect(checks.find((check) => check.id === 'profiles')?.level).toBe('blocked');
    expect(summarizeReadiness(checks)).toBe('blocked');
  });

  it('warns when no output is enabled or real outputs are not armed and ready', () => {
    expect(evaluateDashboardReadiness({ ...base, outputs: [output({ enabled: false })] }).find((check) => check.id === 'outputs')?.level).toBe('warning');
    expect(evaluateDashboardReadiness({ ...base, outputs: [output({ kind: 'artnet', real: true })] }).find((check) => check.id === 'outputs')?.level).toBe('warning');
  });

  it('blocks an output in error and a Flash Guard violation', () => {
    const checks = evaluateDashboardReadiness({
      ...base,
      outputs: [output({ kind: 'artnet', real: true, armed: true, state: 'error' })],
      flashGuardViolation: true,
    });
    expect(checks.find((check) => check.id === 'outputs')?.level).toBe('blocked');
    expect(checks.find((check) => check.id === 'safety')?.level).toBe('blocked');
  });

  it('does not convert missing runtime data into a successful check', () => {
    const checks = evaluateDashboardReadiness({ ...base, outputs: null, flashGuardViolation: null });
    expect(checks.find((check) => check.id === 'outputs')?.level).toBe('unknown');
    expect(checks.find((check) => check.id === 'safety')?.level).toBe('unknown');
    expect(summarizeReadiness(checks)).toBe('unknown');
  });

  it('warns about unsaved projects', () => {
    const checks = evaluateDashboardReadiness({ ...base, projectPath: null, projectDirty: true });
    expect(checks.find((check) => check.id === 'project')?.level).toBe('warning');
  });
});
