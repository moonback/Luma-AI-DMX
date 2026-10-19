// @vitest-environment jsdom
import { vi } from 'vitest';
import { defaultSettings } from '../../src/core/settings/settings';
import { demoProject } from '../helpers';

const configure = vi.fn(async () => undefined);
vi.mock('../../src/renderer/control', () => ({ externalControl: { configure } }));
const { bootstrap } = await import('../../src/renderer/App');

const DATA: Record<string, unknown> = {
  'project.get': { project: demoProject(), library: [], path: null, dirty: false, revision: 1, issues: [], sceneHistory: { undo: 0, redo: 0 } },
  'logs.recent': [],
  'settings.get': { ...defaultSettings(), control: { ...defaultSettings().control, midi: { enabled: true, mappings: [{ key: 'note:1:60', action: 'go' }] } } },
};

beforeEach(() => {
  configure.mockClear();
  (window as unknown as { luma: unknown }).luma = { invoke: async (cmd: { type: string }) => ({ ok: true, data: DATA[cmd.type] }), on: () => () => undefined };
});

describe('démarrage du rendu', () => {
  it('la fenêtre principale ouvre le contrôle MIDI/timecode', async () => {
    window.location.hash = '';
    await bootstrap();
    expect(configure).toHaveBeenCalledTimes(1);
  });

  it('la fenêtre 3D détachée ne l’ouvre pas (sinon chaque GO MIDI part deux fois)', async () => {
    window.location.hash = '#stage3d';
    await bootstrap();
    expect(configure).not.toHaveBeenCalled();
  });
});
