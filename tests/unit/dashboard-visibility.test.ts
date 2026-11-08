import { describe, expect, it } from 'vitest';
import { componentVisibilitySchema, DEFAULT_COMPONENT_VISIBILITY } from '../../src/core/settings/settings';

describe('dashboard component visibility settings', () => {
  it('enables readiness and engine health by default for existing settings', () => {
    const visibility = componentVisibilitySchema.parse({ dashboard: {} });
    expect(visibility.dashboard.readiness).toBe(true);
    expect(visibility.dashboard.engineHealth).toBe(true);
  });

  it('allows each operational panel to be disabled independently', () => {
    const visibility = componentVisibilitySchema.parse({
      dashboard: { readiness: false, engineHealth: true },
    });
    expect(visibility.dashboard.readiness).toBe(false);
    expect(visibility.dashboard.engineHealth).toBe(true);
  });

  it('includes both panels in the default workspace visibility profile', () => {
    expect(DEFAULT_COMPONENT_VISIBILITY.dashboard.readiness).toBe(true);
    expect(DEFAULT_COMPONENT_VISIBILITY.dashboard.engineHealth).toBe(true);
  });
});
