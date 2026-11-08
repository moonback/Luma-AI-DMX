// @vitest-environment jsdom
import { vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { currentShowStep, ShowStepper } from '../../src/renderer/features/music/ShowStepper';
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
