// @vitest-environment jsdom
import { render, screen, fireEvent, act as rtlAct, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import { Cues } from '../../src/renderer/features/Cues';
import { Fixtures } from '../../src/renderer/features/Fixtures';
import { OutputPage } from '../../src/renderer/features/Output';
import { AiDirector } from '../../src/renderer/features/AiDirector';
import { useStore } from '../../src/renderer/store';
import { commandSchema, type Command, type CommandInput } from '../../src/shared/commands';
import type { AppService } from '../../src/core/app/AppService';
import { demoProject, makeService } from '../helpers';

/**
 * Workspaces rendered against a real headless AppService: `window.luma.invoke` validates with the same Zod schema as
 * the main process, so these tests catch UI/command contract drift, not only rendering.
 */
let svc: AppService;
let sent: Command[];

beforeAll(() => {
  // jsdom has neither layout observers nor a 2D canvas: the stage preview just stays blank.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
});

beforeEach(async () => {
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
  const p = demoProject();
  await run({ type: 'project.new', name: 'Test' });
  // Load the demo rig through the public API, as the UI would after opening a project.
  for (const f of p.patch) await run({ type: 'fixture.add', profileId: f.profileId, mode: f.mode, universe: f.universe, address: f.address, count: 1, namePrefix: f.name.replace(/ \d+$/u, ''), tags: [] });
  useStore.setState({ project: svc.projectState(), runtime: svc.runtimeState(), values: {}, sources: {}, selection: [], confirm: null, toasts: [] });
});

afterEach(async () => {
  await svc.dispose();
});

const types = () => sent.map((c) => c.type);
/** Direct command with the renderer's input shape (defaults filled by the schema, as in the main process). */
const run = (raw: CommandInput) => svc.execute(commandSchema.parse(raw) as never) as Promise<{ id: string }>;

describe('Cues', () => {
  it('GO sur une liste réelle : la commande part et le moteur avance', async () => {
    const ids = svc.getProject().patch.map((f) => f.id);
    await run({ type: 'programmer.set', fixtureIds: ids, values: { dimmer: 1 } });
    const { id: sceneId } = await run({ type: 'scene.record', name: 'Plein feu' });
    await run({ type: 'cueList.upsert', cueList: { id: 'list-1', name: 'Show', priority: 50, loop: false, cues: [{ id: 'c1', number: 1, name: 'Ouverture', sceneId, fade: 0, delay: 0, effectIds: [] }] } });
    useStore.setState({ project: svc.projectState(), cueListId: 'list-1' });
    render(<Cues />);
    await rtlAct(async () => { fireEvent.click(screen.getByTestId('go')); });
    expect(sent).toContainEqual({ type: 'cue.go', listId: 'list-1' });
    expect(svc.engine.snapshot().playbacks.find((p) => p.cueListId === 'list-1')?.cueName).toBe('Ouverture');
  });
});

describe('Fixtures', () => {
  it('supprimer la sélection demande confirmation, puis retire les projecteurs', async () => {
    const [first] = svc.getProject().patch;
    useStore.setState({ selection: [first!.id] });
    render(<Fixtures />);
    expect(within(screen.getByTestId('patch-table')).getAllByRole('row').length).toBeGreaterThan(5);
    fireEvent.click(screen.getByTitle(/Supprimer/));
    expect(useStore.getState().confirm?.title).toBe('Supprimer des projecteurs');
    expect(types()).not.toContain('fixture.remove');
    await rtlAct(async () => useStore.getState().confirm!.resolve(true));
    await waitFor(() => expect(types()).toContain('fixture.remove'));
    expect(svc.getProject().patch.some((f) => f.id === first!.id)).toBe(false);
  });
});

describe('DMX Output', () => {
  it('armer une sortie réelle exige une confirmation explicite', async () => {
    const s = svc.getSettings();
    await run({ type: 'output.configure', outputs: [...s.outputs, { kind: 'artnet', id: 'an1', name: 'Nœud Art-Net', host: '127.0.0.1', universeMap: [{ local: 1, remote: 0 }] }] });
    useStore.setState({ runtime: svc.runtimeState() });
    render(<OutputPage />);
    const row = await screen.findByTestId('output-artnet');
    fireEvent.click(within(row).getByTestId('arm'));
    expect(useStore.getState().confirm?.title).toBe('Armer une sortie réelle');
    await rtlAct(async () => useStore.getState().confirm!.resolve(false));
    expect(types()).not.toContain('output.arm');
    fireEvent.click(within(row).getByTestId('arm'));
    await rtlAct(async () => useStore.getState().confirm!.resolve(true));
    await waitFor(() => expect(sent).toContainEqual({ type: 'output.arm', id: 'an1', confirmed: true }));
  });
});

describe('AI Director', () => {
  it('demande → proposition validée → appliquer → rapport', async () => {
    render(<AiDirector />);
    fireEvent.change(screen.getByTestId('ai-prompt'), { target: { value: 'tout en bleu à 80 %' } });
    await rtlAct(async () => { fireEvent.click(screen.getByTestId('ai-send')); });
    const proposal = await screen.findByTestId('proposal');
    expect(types()).toEqual(expect.arrayContaining(['ai.propose']));
    await rtlAct(async () => { fireEvent.click(within(proposal).getByTestId('ai-apply')); });
    await screen.findByTestId('ai-report');
    expect(types()).toContain('ai.apply');
    expect(svc.engine.snapshot().aiActive).toBe(true);
  });
});
