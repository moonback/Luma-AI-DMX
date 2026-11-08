import { vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  setNotice: vi.fn(),
}));

vi.mock('../../src/renderer/store', () => ({
  useStore: { getState: () => ({ toast: mocks.toast, setNotice: mocks.setNotice, language: 'en' }) },
}));
vi.mock('../../src/renderer/i18n', () => ({
  t: (key: string) => key === 'api.error.title' ? 'Action failed' : key,
}));

import { call } from '../../src/renderer/api';

describe('renderer command errors', () => {
  const invoke = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    invoke.mockReset();
    vi.stubGlobal('window', { luma: { invoke } });
  });

  it('shows ordinary command refusals as a translated non-blocking toast', async () => {
    invoke.mockResolvedValue({ ok: false, error: 'Network unavailable' });
    await expect(call({ type: 'output.universe', universe: 1 })).rejects.toThrow('Network unavailable');
    expect(mocks.toast).toHaveBeenCalledWith({
      kind: 'error',
      title: 'Action failed',
      detail: 'Network unavailable',
    });
    expect(mocks.setNotice).not.toHaveBeenCalled();
  });

  it('translates structured core errors in the active renderer language', async () => {
    invoke.mockResolvedValue({
      ok: false,
      error: 'Scène introuvable',
      message: { key: 'programming.sceneNotFound' },
    });
    await expect(call({ type: 'scene.load', id: 'missing' })).rejects.toThrow('Scene not found');
    expect(mocks.toast).toHaveBeenCalledWith({
      kind: 'error',
      title: 'Action failed',
      detail: 'Scene not found',
    });
  });

  it('keeps licence refusals in an explicit dialog', async () => {
    invoke.mockResolvedValue({ ok: false, error: 'Cette fonction nécessite la licence Standard.' });
    await expect(call({ type: 'music.generate', trackId: 'track-1', intent: 'club', nextVariant: false })).rejects.toThrow('licence Standard');
    expect(mocks.setNotice).toHaveBeenCalledWith({
      title: 'Action failed',
      detail: 'Cette fonction nécessite la licence Standard.',
    });
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('deduplicates repeated polling errors and resets after a successful poll', async () => {
    invoke
      .mockResolvedValueOnce({ ok: false, error: 'Output unavailable' })
      .mockResolvedValueOnce({ ok: false, error: 'Output unavailable' })
      .mockResolvedValueOnce({ ok: true, data: { computed: new Uint8Array(512), transmitted: [] } })
      .mockResolvedValueOnce({ ok: false, error: 'Output unavailable' });

    const cmd = { type: 'output.universe', universe: 1 } as const;
    await expect(call(cmd, { deduplicateErrors: true })).rejects.toThrow();
    await expect(call(cmd, { deduplicateErrors: true })).rejects.toThrow();
    await expect(call(cmd, { deduplicateErrors: true })).resolves.toBeDefined();
    await expect(call(cmd, { deduplicateErrors: true })).rejects.toThrow();

    expect(mocks.toast).toHaveBeenCalledTimes(2);
  });
});
