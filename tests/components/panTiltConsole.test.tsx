// @vitest-environment jsdom
import { render, screen, fireEvent, act as rtlAct } from '@testing-library/react';
import { vi } from 'vitest';
import { PanTiltConsole } from '../../src/renderer/features/PanTiltConsole';
import { useStore } from '../../src/renderer/store';
import { validatePatch } from '../../src/core/fixtures/patch';
import { ProfileLibrary } from '../../src/core/fixtures/profiles';
import { demoProject } from '../helpers';

beforeEach(() => {
  (window as unknown as { luma: unknown }).luma = {
    invoke: vi.fn(async () => ({ ok: true, data: { applied: 1, rejected: [] } })),
    on: () => () => undefined,
  };
  const project = demoProject();
  useStore.setState({
    project: {
      project, library: [], path: null, dirty: false, revision: 1,
      issues: validatePatch(new ProfileLibrary(), project.patch),
      sceneHistory: { undo: 0, redo: 0 },
    },
    runtime: null,
    values: {},
    sources: {},
    simpleLocked: false,
    language: 'fr',
  });
});

describe('Console Simplifiée — interaction des machines', () => {
  it('ouvre les réglages immédiatement au clic simple par défaut', () => {
    render(<PanTiltConsole />);

    fireEvent.click(screen.getByRole('button', { name: /Spot 1/ }));

    expect(screen.getByRole('dialog', { name: 'Spot 1' })).toBeInTheDocument();
  });

  it('sélectionne au clic uniquement lorsque le mode sélection est activé', () => {
    render(<PanTiltConsole />);

    fireEvent.click(screen.getByRole('button', { name: 'Mode sélection' }));
    fireEvent.click(screen.getByRole('button', { name: /Spot 1/ }));
    fireEvent.click(screen.getByRole('button', { name: /Spot 2/ }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sélection activée' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Régler (2)' }));

    expect(screen.getByRole('dialog', { name: 'Console Simplifiée' })).toBeInTheDocument();
    expect(screen.getByText('2 machines sélectionnées')).toBeInTheDocument();
  });

  it('affiche « Mixte » quand les machines sélectionnées divergent', () => {
    useStore.setState({ values: { spot1: { dimmer: 1, pan: 0.5 }, spot2: { dimmer: 0.2, pan: 0.5 } } });
    render(<PanTiltConsole />);
    fireEvent.click(screen.getByRole('button', { name: 'Mode sélection' }));
    fireEvent.click(screen.getByRole('button', { name: /Spot 1/ }));
    fireEvent.click(screen.getByRole('button', { name: /Spot 2/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Régler (2)' }));

    expect(screen.getByText('Mixte', { selector: '.sc-fader-val' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Pan' }).parentElement).toHaveTextContent('50%');
  });

  it('signale les machines tenues manuellement et garde « Tout relâcher » accessible', () => {
    render(<PanTiltConsole />);
    expect(screen.queryByTestId('pantilt-held')).not.toBeInTheDocument();
    rtlAct(() => { useStore.setState({ runtime: { programmer: { spot1: { dimmer: 1 }, spot2: { pan: 0.3 } } } as never }); });
    expect(screen.getByTestId('pantilt-held')).toHaveTextContent('2 machine(s) tenue(s) manuellement');
    expect(screen.getByRole('button', { name: /Tout relâcher/ })).toBeEnabled();
  });

  it('désactive le mode sélection et efface la sélection courante', () => {
    render(<PanTiltConsole />);

    fireEvent.click(screen.getByRole('button', { name: 'Mode sélection' }));
    fireEvent.click(screen.getByRole('button', { name: /Spot 1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sélection activée' }));

    expect(screen.getByRole('button', { name: 'Mode sélection' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/machine\(s\) sélectionnée\(s\)/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Spot 2/ }));
    expect(screen.getByRole('dialog', { name: 'Spot 2' })).toBeInTheDocument();
  });
});
