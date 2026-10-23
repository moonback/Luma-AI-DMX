// @vitest-environment jsdom
import { render, screen, fireEvent, act as rtlAct, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import { Visualizer } from '../../src/renderer/features/Visualizer';
import { useStore } from '../../src/renderer/store';
import { commandSchema, type Command, type CommandInput } from '../../src/shared/commands';
import type { AppService } from '../../src/core/app/AppService';
import { makeService } from '../helpers';

/** Equipment library of the Stage page against a real headless AppService (same validated commands as the app). */
let svc: AppService;
let sent: Command[];

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
  Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(async () => {
  localStorage.clear();
  ({ svc } = makeService());
  await svc.init();
  sent = [];
  const invoke = vi.fn(async (raw: unknown) => {
    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Commande invalide : ${parsed.error.issues[0]?.message}` };
    sent.push(parsed.data);
    try {
      const data = await svc.execute(parsed.data);
      useStore.setState({ project: svc.projectState(), runtime: svc.runtimeState() });
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
  (window as unknown as { luma: unknown }).luma = { invoke, on: () => () => undefined };
  await run({ type: 'project.new', name: 'Matériel' });
  useStore.setState({
    project: svc.projectState(), runtime: svc.runtimeState(), values: {}, sources: {}, selection: [], sceneSel: null, placing: null,
    confirm: null, notice: null, toasts: [], stageMode: '2d', stagePanels: { build: true, inspect: true },
  });
});

afterEach(async () => { await svc.dispose(); });

const run = (raw: CommandInput) => svc.execute(commandSchema.parse(raw) as never);
const vis = () => svc.getProject().visualizer;
const click = async (id: string) => rtlAct(async () => { fireEvent.click(screen.getByTestId(id)); });
const answer = async (ok: boolean) => {
  await waitFor(() => expect(useStore.getState().confirm).not.toBeNull());
  const c = useStore.getState().confirm!;
  await rtlAct(async () => { c.resolve(ok); });
  return c;
};

describe('bibliothèque d’équipements', () => {
  it('recherche globale (mots-clés), favoris et récents, ajout rapide', async () => {
    render(<Visualizer />);
    fireEvent.change(screen.getByTestId('lib-search-all'), { target: { value: 'sono' } });
    const results = screen.getByTestId('lib-results');
    expect(within(results).getByTestId('lib-line-array-8')).toBeTruthy();
    await click('fav-line-array-8');
    await click('quick-line-array-8');
    await waitFor(() => expect(vis().props.map((p) => p.kind)).toEqual(['line-array']));
    expect(vis().props[0]!.params).toMatchObject({ modules: 8, flown: true });
    fireEvent.change(screen.getByTestId('lib-search-all'), { target: { value: '' } });
    expect(within(screen.getByTestId('lib-favorites')).getByTestId('lib-line-array-8')).toBeTruthy();
    expect(within(screen.getByTestId('lib-recent')).getByTestId('lib-line-array-8')).toBeTruthy();
    fireEvent.change(screen.getByTestId('lib-search-all'), { target: { value: 'zzz' } });
    expect(screen.getByText(/Aucun équipement/u)).toBeTruthy();
  });

  it('un assemblage s’ajoute en une étape annulable', async () => {
    render(<Visualizer />);
    await click('build-cat-structure');
    await rtlAct(async () => { fireEvent.click(within(screen.getByTestId('catalogue-structure')).getByTestId('quick-asm-goalpost')); });
    await waitFor(() => expect(vis().trusses).toHaveLength(3));
    await click('scene-undo');
    await waitFor(() => expect(vis().trusses).toHaveLength(0));
  });

  it('panneau de propriétés : réglages du type, masquer, verrouiller, échelle, symétrie, alignement', async () => {
    render(<Visualizer />);
    await click('build-cat-sound');
    await rtlAct(async () => { fireEvent.click(within(screen.getByTestId('catalogue-sound')).getByTestId('quick-line-array-8')); });
    await waitFor(() => expect(vis().props).toHaveLength(1));
    const card = () => screen.getAllByTestId('prop-row')[0]!;
    // Doubling the modules keeps their height: the array grows.
    const modules = within(card()).getByTitle('Modules').querySelector('input')!;
    fireEvent.change(modules, { target: { value: '16' } });
    await rtlAct(async () => { fireEvent.blur(modules); });
    await waitFor(() => expect(vis().props[0]!.params?.modules).toBe(16));
    expect(vis().props[0]!.height).toBeCloseTo(5.2, 5);
    expect(within(card()).getByTestId('prop-rigging').textContent).toMatch(/ni calcul de charge ni validation de sécurité/u);
    await rtlAct(async () => { fireEvent.click(within(card()).getByTestId('prop-hide')); });
    await waitFor(() => expect(vis().props[0]!.hidden).toBe(true));
    await rtlAct(async () => { fireEvent.click(within(card()).getByTestId('prop-lock')); });
    await waitFor(() => expect(vis().props[0]!.locked).toBe(true));
    await rtlAct(async () => { fireEvent.click(within(card()).getByTestId('prop-scale-up')); });
    await waitFor(() => expect(vis().props[0]!.width).toBeCloseTo(1.21, 5));
    await rtlAct(async () => { fireEvent.click(within(card()).getByTestId('prop-align-left')); });
    await waitFor(() => expect(vis().props[0]!.x).toBeLessThan(-5));
    await rtlAct(async () => { fireEvent.click(within(card()).getByTestId('prop-mirror')); });
    await waitFor(() => expect(vis().props).toHaveLength(2));
    expect(vis().props[1]!.x).toBe(-vis().props[0]!.x);
    // Changing the kind keeps only the settings valid for the new one.
    fireEvent.change(within(card()).getByTestId('prop-kind'), { target: { value: 'amp' } });
    await waitFor(() => expect(vis().props[0]!.kind).toBe('amp'));
    expect(vis().props[0]!.params).toBeUndefined();
  });

  it('assistant : aperçu des ajouts et des ambiguïtés, rien sans confirmation, puis une étape annulable', async () => {
    render(<Visualizer />);
    const text = 'Ajoute deux line arrays de chaque côté de la scène, une batterie au centre arrière, deux amplificateurs de guitare, une harpe et un grand écran LED derrière les musiciens.';
    fireEvent.change(screen.getByTestId('scene-assistant-text'), { target: { value: text } });
    fireEvent.click(screen.getByTestId('scene-assistant-run'));
    const refused = await answer(false);
    expect(refused.message).toMatch(/2 × Line array 8 modules \(jardin et cour, suspendu/u);
    expect(refused.message).toMatch(/Batterie \(fond de scène\)/u);
    expect(refused.message).toMatch(/Indisponible.*harpe/u);
    expect(sent.filter((c) => c.type === 'project.update')).toHaveLength(0);

    fireEvent.click(screen.getByTestId('scene-assistant-run'));
    await answer(true);
    await waitFor(() => expect(vis().props.length).toBe(5));
    expect(vis().screens).toHaveLength(1);
    expect(sent.filter((c) => c.type === 'project.update')).toHaveLength(1);
    await waitFor(() => expect(useStore.getState().toasts.some((x) => /6 élément/u.test(x.detail ?? ''))).toBe(true));
    await click('scene-undo');
    await waitFor(() => expect(vis().props).toHaveLength(0));
    expect(vis().screens).toHaveLength(0);
  });
});
