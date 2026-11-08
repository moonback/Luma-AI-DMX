// @vitest-environment jsdom
import { vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { currentShowStep, ShowStepper } from '../../src/renderer/features/music/ShowStepper';
import { nowAndNext } from '../../src/renderer/features/music/PlayStep';
import { useStore } from '../../src/renderer/store';
import type { MusicTrack } from '../../src/core/model/schemas';

const plan = {} as NonNullable<MusicTrack['plan']>;

describe('stepper Song to Show', () => {
  it('déduit l’étape courante du morceau, du plan et de la lecture', () => {
    expect(currentShowStep(null, null)).toBe('track');
    expect(currentShowStep({ id: 'a', plan: null }, null)).toBe('intent');
    expect(currentShowStep({ id: 'a', plan: null }, 'a')).toBe('intent'); // listening before generating
    expect(currentShowStep({ id: 'a', plan }, null)).toBe('show');
    expect(currentShowStep({ id: 'a', plan }, 'b')).toBe('show'); // another track is playing
    expect(currentShowStep({ id: 'a', plan }, 'a')).toBe('play');
  });

  it('l’écran Jouer sait quelle section joue et laquelle suit', () => {
    const tk = { analysis: { sections: [{ start: 0, end: 30 }, { start: 30, end: 60 }] } } as unknown as MusicTrack;
    expect(nowAndNext(tk, null)).toEqual({ now: -1, next: 0 });
    expect(nowAndNext(tk, 10)).toEqual({ now: 0, next: 1 });
    expect(nowAndNext(tk, 45)).toEqual({ now: 1, next: -1 });
  });

  it('marque comme faites les étapes atteintes, même quand on revient en arrière', () => {
    useStore.setState({ language: 'fr' });
    render(<ShowStepper current="track" progress="show" onPick={() => undefined} />);
    expect(screen.getByTestId('music-step-track')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('music-step-intent').closest('li')).toHaveClass('done');
    expect(screen.getByTestId('music-step-show').closest('li')).not.toHaveClass('done');
  });

  it('montre les quatre étapes, met en avant la courante et signale le choix', () => {
    useStore.setState({ language: 'fr' });
    const onPick = vi.fn();
    render(<ShowStepper current="show" onPick={onPick} />);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Morceau', 'Intention', expect.stringContaining('Show'), '4Jouer']);
    expect(screen.getByTestId('music-step-show')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('music-step-track').closest('li')).toHaveClass('done');
    expect(screen.getByText('Retouchez les sections, essayez une variante ou ouvrez la timeline.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('music-step-intent'));
    expect(onPick).toHaveBeenCalledWith('intent');
  });
});
