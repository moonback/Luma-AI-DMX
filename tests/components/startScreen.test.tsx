// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { StartScreen } from '../../src/renderer/features/StartScreen';
import { useStore } from '../../src/renderer/store';
import { demoProject } from '../helpers';

const invoke = vi.fn(async (_cmd: unknown) => ({ ok: true, data: { opened: true, migratedFrom: null } }));
const RECENT = ['C:\\Shows\\Gala 2026.json', 'C:\\Shows\\Festival été.json', '/home/me/club.json'];

beforeEach(() => {
  invoke.mockClear();
  (window as unknown as { luma: unknown }).luma = { invoke, on: () => () => undefined };
  const project = demoProject();
  useStore.setState({ project: { project, library: [], path: null, dirty: false, revision: 1, issues: [], sceneHistory: { undo: 0, redo: 0 } }, startScreen: RECENT, newProjectOpen: false });
});

describe('écran de démarrage', () => {
  it('recherche un projet récent et l’ouvre', async () => {
    render(<StartScreen />);
    expect(screen.getAllByTestId('start-recent')).toHaveLength(3);
    fireEvent.change(screen.getByTestId('start-search'), { target: { value: 'festival' } });
    expect(screen.getAllByTestId('start-recent')).toHaveLength(1);
    fireEvent.click(screen.getByText('Festival été.json'));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith({ type: 'project.open', path: RECENT[1] }));
    await waitFor(() => expect(useStore.getState().startScreen).toBeNull());
  });

  it('nouveau projet ouvre la fenêtre de création ; continuer ferme sans rien changer', () => {
    const { unmount } = render(<StartScreen />);
    fireEvent.click(screen.getByTestId('start-new'));
    expect(useStore.getState()).toMatchObject({ startScreen: null, newProjectOpen: true });
    unmount();
    useStore.setState({ startScreen: [] });
    render(<StartScreen />);
    expect(screen.getByText(/Aucun projet récent/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('start-continue'));
    expect(useStore.getState().startScreen).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
});
