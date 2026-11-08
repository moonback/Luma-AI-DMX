// @vitest-environment jsdom
import { vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { settingsSchema, type Settings } from '../../src/core/settings/settings';
import { useStore } from '../../src/renderer/store';

vi.mock('../../src/renderer/control', () => ({ externalControl: { configure: vi.fn(async () => undefined), subscribe: () => () => undefined, status: { midiInputs: [], error: null, timecode: null } } }));
const setLatency = vi.fn();
vi.mock('../../src/renderer/audioEngine', () => ({ audioEngine: { setLatency, devices: async () => [] } }));
const { SettingsPage } = await import('../../src/renderer/features/Settings');

// A settings file as read from disk: `defaultSettings()` alone lacks the appearance sub-defaults (zod 4 does not re-parse
// `.default({})`, the known componentVisibility failure on master).
const base = settingsSchema.parse({ appearance: { components: { pages: {}, dashboard: {} } } });
let stored: Settings;
let updates: Settings[];
beforeEach(() => {
  stored = { ...base, engine: { ...base.engine, maxStrobeHz: 6 } };
  updates = [];
  useStore.setState({ language: 'fr' });
  (window as unknown as { luma: unknown }).luma = {
    invoke: async (cmd: { type: string; settings?: Settings }) => {
      if (cmd.type === 'settings.get') return { ok: true, data: stored };
      if (cmd.type === 'settings.update') { updates.push(cmd.settings!); return { ok: true, data: true }; }
      return { ok: true, data: undefined };
    },
    on: () => () => undefined,
  };
});

const tab = (name: string) => screen.getByRole('tab', { name });

describe('Paramètres', () => {
  it('regroupe les garde-fous dans « Sécurité du show », signale ce qui diffère du défaut et le rétablit', async () => {
    render(<SettingsPage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Sécurité du show' }));
    // allowStrobe left « IA » for this section, next to the other guards of audit T8.
    const strobe = screen.getByTestId<HTMLInputElement>('allow-strobe');
    expect(strobe.checked).toBe(false);
    expect(screen.getByTestId('flash-guard')).toBeInTheDocument();
    expect(screen.getByTestId('auto-arm-on-start')).toBeInTheDocument();
    // maxStrobeHz was saved at 6 (default 10): marked, with « Rétablir ».
    const maxStrobe = document.querySelector('[data-setting="engine.maxStrobeHz"]')!;
    expect(within(maxStrobe as HTMLElement).getByText('Modifié')).toBeInTheDocument();
    expect(screen.queryByTestId('reset-ai.allowStrobe')).toBeNull();
    fireEvent.click(strobe);
    expect(screen.getByTestId('reset-ai.allowStrobe')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('reset-engine.maxStrobeHz'));
    expect(screen.queryByTestId('reset-engine.maxStrobeHz')).toBeNull();
    fireEvent.click(screen.getByTestId('settings-save'));
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]!.engine.maxStrobeHz).toBe(10);
    expect(updates[0]!.ai.allowStrobe).toBe(true);
    // allowStrobe is no longer shown under « IA et fournisseurs ».
    fireEvent.click(tab('IA et fournisseurs'));
    expect(screen.queryByTestId('allow-strobe')).toBeNull();
  });

  it('recherche dans les libellés sans tenir compte des accents, puis ouvre l’onglet du réglage', async () => {
    render(<SettingsPage />);
    const search = await screen.findByTestId('settings-search');
    fireEvent.change(search, { target: { value: 'garde-fou PHOTOSENSIBLE' } });
    fireEvent.click(screen.getByTestId('search-hit-engine.flashGuard'));
    expect(tab('Sécurité du show')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('flash-guard')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'securite' } });
    expect(within(screen.getByTestId('settings-search-results')).getByRole('button', { name: 'Sécurité du show' })).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'zzz introuvable' } });
    expect(screen.getByText('Aucun réglage ne correspond à « zzz introuvable ».')).toBeInTheDocument();
  });

  it('cherche dans la langue active', async () => {
    useStore.setState({ language: 'en' });
    render(<SettingsPage />);
    fireEvent.change(await screen.findByTestId('settings-search'), { target: { value: 'latency' } });
    expect(screen.getByTestId('search-hit-audio.latencyMs')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('settings-search'), { target: { value: 'latence' } });
    expect(screen.queryByTestId('search-hit-audio.latencyMs')).toBeNull();
  });

  it('expose la latence audio et la granularité Song to Show, et applique la latence à l’enregistrement', async () => {
    render(<SettingsPage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Audio' }));
    const [latency, phrase] = ['audio.latencyMs', 'ai.phraseBars'].map((p) => document.querySelector(`[data-setting="${p}"] input`) as HTMLInputElement);
    fireEvent.change(latency!, { target: { value: '40' } });
    fireEvent.blur(latency!);
    fireEvent.change(phrase!, { target: { value: '4' } });
    fireEvent.blur(phrase!);
    expect(screen.getAllByText('Modifié')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('settings-save'));
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]!.audio.latencyMs).toBe(40);
    expect(updates[0]!.ai.phraseBars).toBe(4);
    expect(settingsSchema.safeParse(updates[0]).success).toBe(true);
    expect(setLatency).toHaveBeenLastCalledWith(40);
  });
});
