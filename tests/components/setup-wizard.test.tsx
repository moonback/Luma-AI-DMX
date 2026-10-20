// @vitest-environment jsdom
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi } from 'vitest';
import { SetupWizard } from '../../src/renderer/features/SetupWizard';
import { useStore } from '../../src/renderer/store';
import { validatePatch } from '../../src/core/fixtures/patch';
import { ProfileLibrary } from '../../src/core/fixtures/profiles';
import { demoProject } from '../helpers';

// jsdom has no 2D canvas context: the plan is replaced by a stub, the steps are real.
vi.mock('../../src/renderer/features/Visualizer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/renderer/features/Visualizer')>();
  return { ...actual, StageCanvas: () => <div data-testid="stage-canvas-stub" /> };
});

const invoke = vi.fn(async (_cmd: unknown) => ({ ok: true, data: { applied: 1, rejected: [] } }));

beforeEach(() => {
  invoke.mockClear();
  (window as unknown as { luma: unknown }).luma = { invoke, on: () => () => undefined };
  const project = demoProject();
  useStore.setState({
    project: { project, path: null, dirty: false, revision: 1, issues: validatePatch(new ProfileLibrary(), project.patch), sceneHistory: { undo: 0, redo: 0 } },
    runtime: null,
    values: {},
    sources: {},
    selection: [],
    placing: null,
  });
});

describe('Mise en place (assistant pas à pas)', () => {
  it('commence à la structure, avec le plateau et les structures sur la même page', () => {
    render(<SetupWizard />);
    expect(screen.getByRole('heading', { name: 'Structure' })).toBeInTheDocument();
    expect(screen.getByText('Plateau')).toBeInTheDocument();
    expect(screen.getByText('Structures (truss)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Précédent/ })).toBeDisabled();
    expect(screen.getByTestId('setup-preview')).toBeInTheDocument();
  });

  it('avance étape par étape sans quitter la page : Structure → Décor → Patch', () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByTestId('setup-next'));
    expect(screen.getByRole('heading', { name: 'Décor' })).toBeInTheDocument();
    expect(screen.queryByText('Structures (truss)')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('setup-next'));
    expect(screen.getByRole('heading', { name: 'Patch' })).toBeInTheDocument();
    expect(screen.getByText('Étape 3 sur 3')).toBeInTheDocument();
    expect(screen.getByTestId('setup-finish')).toHaveTextContent('Terminer');
  });

  it('le patch liste les projecteurs avec univers et adresses, sans changer de page', () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByTestId('setup-step-patch'));
    const table = screen.getByTestId('setup-patch-table');
    expect(within(table).getByText('PAR 1')).toBeInTheDocument();
    expect(screen.getByTestId('setup-add-fixture')).toBeInTheDocument();
  });

  it('revenir en arrière et sauter directement à une étape par son bouton', () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByTestId('setup-step-decor'));
    expect(screen.getByRole('heading', { name: 'Décor' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Précédent/ }));
    expect(screen.getByRole('heading', { name: 'Structure' })).toBeInTheDocument();
  });

  it('affiche le rappel de pose quand un élément est en cours de placement', () => {
    useStore.setState({ placing: { kind: 'prop', label: 'praticable' } });
    render(<SetupWizard />);
    expect(screen.getByRole('status')).toHaveTextContent('praticable');
  });
});
