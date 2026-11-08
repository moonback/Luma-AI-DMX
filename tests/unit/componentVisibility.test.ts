import { describe, expect, it } from 'vitest';
import { DEFAULT_COMPONENT_VISIBILITY, settingsSchema } from '../../src/core/settings/settings';

describe('workspace component visibility settings', () => {
  it('keeps every component visible by default', () => {
    const settings = settingsSchema.parse({});
    expect(settings.appearance.components).toEqual(DEFAULT_COMPONENT_VISIBILITY);
  });

  it('migrates older settings by filling visibility defaults', () => {
    const settings = settingsSchema.parse({
      appearance: { reducedMotion: true, uiScale: 1.1, language: 'fr' },
    });
    expect(settings.appearance.reducedMotion).toBe(true);
    expect(settings.appearance.components.pages.visualizer).toBe(true);
    expect(settings.appearance.components.stage2d).toBe(true);
    expect(settings.appearance.components.stage3d).toBe(true);
  });

  it('persists independent navigation and stage visibility choices', () => {
    const settings = settingsSchema.parse({
      appearance: {
        components: {
          pages: { visualizer: false, music: false },
          stage2d: false,
          stage3d: true,
          stageBuildPanel: false,
          stageInspectorPanel: true,
          statusBar: false,
          diagnosticsButton: false,
          miniPlayer: false,
        },
      },
    });
    expect(settings.appearance.components.pages.visualizer).toBe(false);
    expect(settings.appearance.components.pages.music).toBe(false);
    expect(settings.appearance.components.pages.dashboard).toBe(true);
    expect(settings.appearance.components.stage2d).toBe(false);
    expect(settings.appearance.components.stage3d).toBe(true);
    expect(settings.appearance.components.stageBuildPanel).toBe(false);
    expect(settings.appearance.components.stageInspectorPanel).toBe(true);
    expect(settings.appearance.components.statusBar).toBe(false);
    expect(settings.appearance.components.diagnosticsButton).toBe(false);
    expect(settings.appearance.components.miniPlayer).toBe(false);
  });

  it('persists dashboard section visibility independently', () => {
    const settings = settingsSchema.parse({
      appearance: { components: { dashboard: { hardware: false, sceneFromText: false, alerts: false } } },
    });
    expect(settings.appearance.components.dashboard.hardware).toBe(false);
    expect(settings.appearance.components.dashboard.sceneFromText).toBe(false);
    expect(settings.appearance.components.dashboard.alerts).toBe(false);
    expect(settings.appearance.components.dashboard.show).toBe(true);
    expect(settings.appearance.components.dashboard.quickActions).toBe(true);
  });
});
