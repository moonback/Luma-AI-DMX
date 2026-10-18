// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { SectionEditor } from '../../src/renderer/features/music/SectionEditor';
import { planLocally } from '../../src/core/music/songToShow';
import type { MusicTrack, SongAnalysis } from '../../src/core/model/schemas';

const invoke = vi.fn(async (_cmd: unknown) => ({ ok: true, data: { timelineId: 't', notices: ['ok'], provider: 'local' } }));
const section = (start: number, end: number, label: 'verse' | 'chorus', energy: number) => ({ start, end, label, cluster: 0, energy, brightness: 0.5, density: 2, bassShare: 0.5 });
const analysis: SongAnalysis = {
  version: 1, duration: 60, bpm: 120, tempoStable: true, beats: [], downbeats: [], key: { tonic: 0, mode: 'major', confidence: 0.8 }, events: [],
  sections: [section(0, 30, 'verse', 0.5), section(30, 60, 'chorus', 0.95)],
};
const track = (withPlan: boolean): MusicTrack => ({
  id: 'trk', name: 'Démo', hash: 'a'.repeat(64), analysis,
  plan: withPlan ? planLocally(analysis, '', { wash: 2, moving: 0, bars: 0, allowStrobe: false }) : null,
  created: { sceneIds: [], effectIds: [], timelineId: null },
});
const sent = () => invoke.mock.calls.map((c) => c[0] as { type: string });

beforeEach(() => {
  invoke.mockClear();
  (window as unknown as { luma: unknown }).luma = { invoke, on: () => () => undefined };
});

describe('modale d’édition d’une section', () => {
  it('corrige l’étiquette et le look : seuls les champs modifiés partent', async () => {
    const onClose = vi.fn(), onNotices = vi.fn();
    render(<SectionEditor track={track(true)} index={0} onClose={onClose} onNotices={onNotices} />);
    expect(screen.getByText(/Pourquoi : Couplet, énergie mesurée 0,50/)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('section-label'), { target: { value: 'bridge' } });
    fireEvent.change(screen.getByTestId('section-energy'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('section-movement'), { target: { value: 'fan' } });
    fireEvent.click(screen.getByTestId('section-locked'));
    fireEvent.click(screen.getByTestId('section-save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sent()).toEqual([
      { type: 'music.setSection', trackId: 'trk', index: 0, label: 'bridge' },
      { type: 'music.updateSection', trackId: 'trk', index: 0, patch: { energy: 5, movement: 'fan', locked: true } },
    ]);
    expect(onNotices).toHaveBeenCalledWith(['ok']);
  });

  it('régénère avec la consigne ; sans plan, seule l’étiquette est modifiable', async () => {
    const onClose = vi.fn();
    const { unmount } = render(<SectionEditor track={track(true)} index={1} onClose={onClose} onNotices={() => undefined} />);
    fireEvent.change(screen.getByTestId('section-instruction'), { target: { value: 'en rouge' } });
    fireEvent.keyDown(screen.getByTestId('section-instruction'), { key: 'Enter' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sent()).toEqual([{ type: 'music.regenerateSection', trackId: 'trk', index: 1, instruction: 'en rouge' }]);
    unmount();
    invoke.mockClear();
    render(<SectionEditor track={track(false)} index={1} onClose={() => undefined} onNotices={() => undefined} />);
    expect(screen.getByText(/Générez le show/)).toBeInTheDocument();
    expect(screen.queryByTestId('section-energy')).toBeNull();
    fireEvent.click(screen.getByTestId('section-save'));
    await waitFor(() => expect(invoke).not.toHaveBeenCalled());
  });
});
