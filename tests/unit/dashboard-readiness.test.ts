import { describe, expect, it } from 'vitest';
import type { OutputStatus } from '../../src/core/protocols/config';
import { classifyEngineHealth, evaluateDashboardReadiness, summarizeReadiness } from '../../src/renderer/features/dashboardReadiness';

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

  it('warns when the patch is empty', () => {
    const checks = evaluateDashboardReadiness({ ...base, patchCount: 0, resolvedFixtureCount: 0 });
    expect(checks.find((check) => check.id === 'patch')?.level).toBe('warning');
    expect(checks.find((check) => check.id === 'profiles')?.level).toBe('unknown');
  });

  it('accepts a physical output only when it is both armed and ready', () => {
    const checks = evaluateDashboardReadiness({ ...base, outputs: [output({ kind: 'artnet', real: true, armed: true, state: 'ready' })] });
    expect(checks.find((check) => check.id === 'outputs')?.level).toBe('ready');
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

describe('engine health classification', () => {
  it('keeps the state unknown before the first engine tick', () => {
    expect(classifyEngineHealth(null)).toBe('unknown');
    expect(classifyEngineHealth({ ticks: 0, load: 0, overruns: 0, errors: 0 })).toBe('unknown');
  });

  it('marks a low-load engine without overruns as ready', () => {
    expect(classifyEngineHealth({ ticks: 100, load: 0.2, overruns: 0, errors: 0 })).toBe('ready');
  });

  it('warns on a high load or any scheduler overrun', () => {
    expect(classifyEngineHealth({ ticks: 100, load: 0.85, overruns: 0, errors: 0 })).toBe('warning');
    expect(classifyEngineHealth({ ticks: 100, load: 0.2, overruns: 1, errors: 0 })).toBe('warning');
  });

  it('blocks when an engine tick has thrown', () => {
    expect(classifyEngineHealth({ ticks: 100, load: 0.2, overruns: 0, errors: 1 })).toBe('blocked');
  });
});
