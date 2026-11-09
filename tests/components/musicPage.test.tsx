// @vitest-environment jsdom
import { vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { planLocally } from '../../src/core/music/songToShow';
import type { MusicTrack, SongAnalysis } from '../../src/core/model/schemas';
import { useStore } from '../../src/renderer/store';
import { demoProject } from '../helpers';

const player = vi.hoisted(() => ({
  playing: null as { trackId: string } | null, paused: null, revision: 0,
  subscribe: () => () => undefined, position: () => 0, hasAudio: () => true, restore: async () => undefined, getWaveform: () => null,
  play: (() => undefined) as (...a: unknown[]) => void, pause: () => undefined, stop: () => undefined, load: (async () => undefined) as (...a: unknown[]) => Promise<unknown>,
}));
vi.mock('../../src/renderer/musicPlayer', () => ({ musicPlayer: player }));
const { MusicPage } = await import('../../src/renderer/features/Music');

const section = (start: number, end: number, label: 'verse' | 'chorus', energy: number) => ({ start, end, label, cluster: 0, energy, brightness: 0.5, density: 2, bassShare: 0.5 });
const analysis = (bpm: number): SongAnalysis => ({
  version: 1, duration: 60, bpm, tempoStable: true, meter: 4, beats: [], downbeats: [], key: { tonic: 0, mode: 'major', confidence: 0.8 }, events: [],
  sections: [section(0, 30, 'verse', 0.5), section(30, 60, 'chorus', 0.95)], tempoChanges: [],
});
const track = (id: string, name: string, bpm: number, withPlan: boolean): MusicTrack => ({
  id, name, hash: id.repeat(64).slice(0, 64), analysis: analysis(bpm),
  plan: withPlan ? planLocally(analysis(bpm), '', { wash: 2, moving: 0, bars: 0, allowStrobe: false }) : null,
  created: { sceneIds: [], effectIds: [], timelineId: null, cueListIds: [] },
});

let sent: { type: string; id?: string }[];
beforeEach(() => {
  sent = [];
  player.play = vi.fn();
  const project = { ...demoProject(), music: { tracks: [track('a', 'Intro live', 98, false), track('b', 'Nuit blanche', 124, true)] } };
  useStore.setState({ language: 'fr', project: { project, library: [], path: null, dirty: false, revision: 1, issues: [], sceneHistory: { undo: 0, redo: 0 } } as never });
  (window as unknown as { luma: unknown }).luma = {
    invoke: async (cmd: { type: string; id?: string }) => {
      sent.push(cmd);
      return { ok: true, data: cmd.type === 'music.addTrack' ? { id: 'c' } : undefined };
    },
    on: () => () => undefined,
  };
});

const step = (id: string) => screen.getByTestId(`music-step-${id}`);

describe('page Song to Show en quatre écrans', () => {
  it('ouvre chaque morceau sur son étape, puis navigue entre Morceau, Intention, Show et Jouer', async () => {
    render(<MusicPage />);
    // The first track has no show yet: it opens on « Intention », with the library beside it.
    expect(within(screen.getByTestId('music-library')).getAllByTestId('music-library-item')).toHaveLength(2);
    expect(step('intent')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('music-intent')).toBeInTheDocument();
    expect(screen.queryByTestId('music-sections')).toBeNull();
    fireEvent.click(step('track'));
    expect(screen.getByTestId('music-summary')).toHaveTextContent('98');
    fireEvent.click(screen.getByTestId('music-next'));
    expect(screen.getByTestId('music-intent')).toBeInTheDocument();
    fireEvent.click(step('show'));
    expect(screen.getByText('Pas encore de show')).toBeInTheDocument();

    // A track with a show opens on « Show »: plan, read-only sections, then « Jouer » starts the playback.
    fireEvent.click(screen.getAllByTestId('music-library-item').find((b) => b.textContent?.includes('Nuit blanche'))!);
    expect(step('show')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('music-plan-summary')).toBeInTheDocument();
    expect(screen.getByTestId('music-sections')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('music-to-play'));
    expect(player.play).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }), 0);
    expect(screen.getByTestId('music-live-now')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('music-next-section'));
    expect(player.play).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'b' }), 0);
    // The transport bar stays above every screen.
    expect(screen.getByTestId('music-play')).toBeInTheDocument();
  });

  it('filtre et trie la bibliothèque', () => {
    render(<MusicPage />);
    const names = () => screen.getAllByTestId('music-library-item').map((b) => b.textContent ?? '');
    expect(names()[0]).toContain('Nuit blanche'); // most recent (last imported) first
    fireEvent.change(screen.getByTestId('music-library-sort'), { target: { value: 'bpm' } });
    expect(names()[0]).toContain('Intro live');
    fireEvent.change(screen.getByTestId('music-library-filter'), { target: { value: 'NUIT' } });
    expect(names()).toHaveLength(1);
    fireEvent.change(screen.getByTestId('music-library-filter'), { target: { value: 'zzz' } });
    expect(screen.getByText('Aucun morceau ne correspond.')).toBeInTheDocument();
  });

  it('suggestions : les locales tout de suite, remplacées par celles de l’IA, demandées sans l’intention tapée', async () => {
    useStore.setState({ runtime: { ...useStore.getState().runtime, ai: { provider: 'openrouter' } } as never });
    const invoke = (window as unknown as { luma: { invoke: (c: { type: string }) => Promise<unknown> } }).luma.invoke;
    (window as unknown as { luma: { invoke: unknown } }).luma.invoke = async (cmd: { type: string }) =>
      cmd.type === 'music.suggestIntents' ? (sent.push(cmd), { ok: true, data: { suggestions: ['lumières sur les basses', 'couleurs pastel'], provider: 'openrouter', model: 'm', notices: [] } }) : invoke(cmd);
    render(<MusicPage />);
    const chips = () => Array.from(screen.getByTestId('music-intent-suggestions').querySelectorAll('button.chip:not([data-testid])')).map((b) => b.textContent);
    expect(chips()).toContain('couplets sobres'); // local, from the measured sound
    fireEvent.click(screen.getByTestId('music-intent-suggest-ai'));
    // The AI ones replace them, marked as such (own label, own chips).
    await waitFor(() => expect(screen.getAllByTestId('music-ai-suggestion').map((b) => b.textContent)).toEqual(['lumières sur les basses', 'couleurs pastel']));
    expect(chips()).toEqual([]);
    expect(screen.getByText('Suggestions de l’IA :')).toBeInTheDocument();
    expect(sent.find((c) => c.type === 'music.suggestIntents')).toEqual({ type: 'music.suggestIntents', trackId: 'a' });
  });

  it('remplace le fichier d’un morceau : le nouveau est ajouté, l’ancien retiré', async () => {
    player.load = vi.fn(async () => ({ name: 'nouveau.wav', hash: 'c'.repeat(64), analysis: analysis(110) }));
    render(<MusicPage />);
    const f = new File(['x'], 'nouveau.wav', { type: 'audio/wav' });
    fireEvent.change(screen.getByTestId('music-replace-file'), { target: { files: [f] } });
    await waitFor(() => expect(sent.map((c) => c.type)).toContain('music.removeTrack'));
    expect(sent.filter((c) => c.type.startsWith('music.') && c.type !== 'music.suggestIntents').map((c) => [c.type, c.id])).toEqual([['music.addTrack', undefined], ['music.removeTrack', 'a']]);
  });
});
