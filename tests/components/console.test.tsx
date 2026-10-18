// @vitest-environment jsdom
import { render, screen, fireEvent, act as rtlAct } from '@testing-library/react';
import { vi } from 'vitest';
import { LiveConsole } from '../../src/renderer/features/LiveConsole';
import { useStore } from '../../src/renderer/store';
import { validatePatch } from '../../src/core/fixtures/patch';
import { ProfileLibrary } from '../../src/core/fixtures/profiles';
import { demoProject } from '../helpers';

const invoke = vi.fn(async (_cmd: unknown) => ({ ok: true, data: { applied: 1, rejected: [] } }));

beforeEach(() => {
  invoke.mockClear();
  (window as unknown as { luma: unknown }).luma = { invoke, on: () => () => undefined };
  const project = demoProject();
  useStore.setState({
    project: { project, library: [], path: null, dirty: false, revision: 1, issues: validatePatch(new ProfileLibrary(), project.patch), sceneHistory: { undo: 0, redo: 0 } },
    runtime: null,
    values: {},
    sources: {},
    selection: [],
  });
});

describe('Live Console', () => {
  it('génère les contrôles à partir du profil : PAR sans position, lyre avec position et roue de couleurs', () => {
    render(<LiveConsole />);
    fireEvent.click(screen.getByText('PAR 1'));
    expect(screen.getByText('Couleur')).toBeInTheDocument();
    expect(screen.queryByText('Position')).not.toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Rouge' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Spot 1'));
    expect(screen.getByText('Position')).toBeInTheDocument();
    expect(screen.getByText('Pan (16 bits)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Violet/ })).toBeInTheDocument(); // colour-wheel slot from the profile
    expect(screen.queryByRole('slider', { name: 'Rouge' })).not.toBeInTheDocument(); // no RGB channels on the spot
    expect(screen.getByRole('button', { name: /Reset/ })).toHaveClass('danger'); // special function flagged
  });

  it('envoie au moteur une commande typée pour la sélection (pas de paquet DMX côté interface)', async () => {
    render(<LiveConsole />);
    fireEvent.click(screen.getByText('Pars'));
    await rtlAct(async () => {
      fireEvent.click(screen.getByTitle('#FF0000'));
    });
    expect(invoke).toHaveBeenCalledWith({ type: 'programmer.setColor', fixtureIds: ['par1', 'par2', 'rgbw'], color: '#FF0000' });
    await rtlAct(async () => {
      fireEvent.change(screen.getByTestId('dimmer-fader'), { target: { value: '128' } });
    });
    expect(invoke).toHaveBeenCalledWith({ type: 'programmer.set', fixtureIds: ['par1', 'par2', 'rgbw'], values: { dimmer: 128 / 255 }, confirmSpecial: false });
  });

  it('une fonction spéciale demande confirmation avant envoi', async () => {
    render(<LiveConsole />);
    fireEvent.click(screen.getByText('Spot 1'));
    fireEvent.click(screen.getByRole('button', { name: /Reset/ }));
    expect(useStore.getState().confirm?.title).toBe('Fonction spéciale');
    expect(invoke).not.toHaveBeenCalled();
    await rtlAct(async () => useStore.getState().confirm!.resolve(true));
    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ type: 'programmer.set', fixtureIds: ['spot1'], confirmSpecial: true }));
  });
  it('sélection rapide : impairs / pairs / inverser, par type et compteur', () => {
    render(<LiveConsole />);
    const sel = () => useStore.getState().selection;
    fireEvent.click(screen.getByRole('button', { name: 'Impairs' }));
    expect(sel()).toEqual(['par1', 'rgbw', 'spot2']);
    fireEvent.click(screen.getByRole('button', { name: 'Pairs' })); // within the current selection
    expect(sel()).toEqual(['rgbw']);
    fireEvent.click(screen.getByRole('button', { name: 'Inverser' }));
    expect(sel()).toEqual(['par1', 'par2', 'spot1', 'spot2']);
    fireEvent.click(screen.getByRole('button', { name: /Lyres spot/ }));
    expect(sel()).toEqual(['spot1', 'spot2']);
    expect(screen.getByText('2 / 5 sélectionné(s)')).toBeInTheDocument();
  });

  it('état « touché » visible et relâche par famille', async () => {
    useStore.setState({ runtime: { programmer: { par1: { red: 1 } }, engine: { master: 1, programmerCount: 1 } } as never });
    render(<LiveConsole />);
    expect(screen.getByText('PAR 1').closest('.fx-tile')).toHaveClass('touched');
    expect(screen.getByText('PAR 2').closest('.fx-tile')).not.toHaveClass('touched');
    fireEvent.click(screen.getByRole('button', { name: /Touchés/ }));
    expect(useStore.getState().selection).toEqual(['par1']);
    expect(screen.getByRole('slider', { name: 'Rouge' }).closest('.ctl-row')).toHaveClass('touched');
    expect(screen.getAllByRole('button', { name: 'Relâcher' })).toHaveLength(1); // colour only: nothing to release in intensity
    await rtlAct(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Relâcher' }));
    });
    expect(invoke).toHaveBeenCalledWith({ type: 'programmer.release', fixtureIds: ['par1'], attributes: ['red'] });
  });

  it('fan : rampe d’intensité et éventail de pan répartis dans l’ordre de sélection', async () => {
    render(<LiveConsole />);
    fireEvent.click(screen.getByText('Pars'));
    await rtlAct(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rampe ↗' }));
    });
    expect(invoke).toHaveBeenCalledWith({ type: 'programmer.set', fixtureIds: ['par1'], values: { dimmer: 0 }, confirmSpecial: false });
    expect(invoke).toHaveBeenCalledWith({ type: 'programmer.set', fixtureIds: ['par2'], values: { dimmer: 0.5 }, confirmSpecial: false });
    expect(invoke).toHaveBeenCalledWith({ type: 'programmer.set', fixtureIds: ['rgbw'], values: { dimmer: 1 }, confirmSpecial: false });

    invoke.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Lyres spot/ }));
    await rtlAct(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Éventail pan' }));
    });
    expect(invoke).toHaveBeenCalledWith({ type: 'programmer.set', fixtureIds: ['spot1'], values: { pan: 0 }, confirmSpecial: false });
    expect(invoke).toHaveBeenCalledWith({ type: 'programmer.set', fixtureIds: ['spot2'], values: { pan: 0.15 }, confirmSpecial: false });
    fireEvent.click(screen.getByText('Spot 1', { selector: '.fx-name' })); // single fixture: fan is meaningless
    expect(screen.getByRole('button', { name: 'Éventail pan' })).toBeDisabled();
  });

  it('crée un groupe depuis la sélection en un clic et résume la sélection contrôlée', async () => {
    render(<LiveConsole />);
    fireEvent.click(screen.getByText('PAR 1'));
    expect(screen.getByTestId('selection-summary')).toHaveTextContent('PAR 1');
    await rtlAct(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Groupe' }));
    });
    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ type: 'group.upsert', group: expect.objectContaining({ fixtureIds: ['par1'] }) }));
  });
});
