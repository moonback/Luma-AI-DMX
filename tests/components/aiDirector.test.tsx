// @vitest-environment jsdom
import { render, screen, fireEvent, act as rtlAct, within } from '@testing-library/react';
import { vi } from 'vitest';
import { AiDirector } from '../../src/renderer/features/AiDirector';
import { exchangeState, useConversation } from '../../src/renderer/features/ai/conversation';
import { useStore } from '../../src/renderer/store';
import { commandSchema, type Command, type CommandInput } from '../../src/shared/commands';
import type { AppService } from '../../src/core/app/AppService';
import { demoProject, makeService } from '../helpers';

/* AI Director page against a real headless AppService: every state shown comes from a real proposal or report. */
let svc: AppService;
let sent: Command[];

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
});

const run = (raw: CommandInput) => svc.execute(commandSchema.parse(raw) as never) as Promise<{ id: string }>;

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
  await run({ type: 'project.new', name: 'Test' });
  for (const f of demoProject().patch) await run({ type: 'fixture.add', profileId: f.profileId, mode: f.mode, universe: f.universe, address: f.address, count: 1, namePrefix: f.name.replace(/ \d+$/u, ''), tags: [] });
  useStore.setState({ project: svc.projectState(), runtime: svc.runtimeState(), values: {}, sources: {}, selection: [], confirm: null, toasts: [], preview: null });
  useConversation.setState({ exchanges: [] });
});

afterEach(async () => {
  await svc.dispose();
});

const types = () => sent.map((c) => c.type);
async function ask(prompt: string) {
  fireEvent.change(screen.getByTestId('ai-prompt'), { target: { value: prompt } });
  await rtlAct(async () => { fireEvent.click(screen.getByTestId('ai-send')); });
}
const lastState = () => exchangeState(useConversation.getState().exchanges.at(-1)!);

describe('AI Director : conversation', () => {
  it('le plan affiche cibles, paramètres modifiés et conservés', async () => {
    render(<AiDirector />);
    await ask('Mets tout en violet');
    const p = await screen.findByTestId('proposal');
    expect(p.textContent).toMatch(/Modifie.*couleur/);
    expect(p.textContent).toMatch(/Conserve.*intensité/);
    expect(within(p).getByTestId('ai-state').dataset.state).toBe('awaiting');
  });

  it('la conversation survit à un changement d’espace de travail', async () => {
    const { unmount } = render(<AiDirector />);
    await ask('Tout en bleu');
    await screen.findByTestId('proposal');
    unmount();
    render(<AiDirector />);
    expect(await screen.findByTestId('proposal')).toBeTruthy();
    expect(screen.getByText('Tout en bleu')).toBeTruthy();
  });

  it('une action exclue n’est pas exécutée : révision puis application, rapport fidèle', async () => {
    render(<AiDirector />);
    await ask('Mets les pars en rouge et les lyres en bleu');
    const p = await screen.findByTestId('proposal');
    fireEvent.click(within(p).getAllByRole('checkbox')[1]!);
    await rtlAct(async () => { fireEvent.click(within(p).getByTestId('ai-apply')); });
    const report = await screen.findByTestId('ai-report');
    expect(types().slice(-2)).toEqual(['ai.revise', 'ai.apply']);
    expect(report.textContent).toMatch(/✓ Couleur #FF0000/);
    expect(report.textContent).not.toMatch(/#0040FF/);
    expect(report.textContent).toMatch(/Sorties en simulation/);
    expect(lastState()).toBe('success');
  });

  it('un double clic n’applique qu’une fois', async () => {
    render(<AiDirector />);
    await ask('Tout en bleu');
    const apply = within(await screen.findByTestId('proposal')).getByTestId('ai-apply');
    await rtlAct(async () => { fireEvent.click(apply); fireEvent.click(apply); });
    expect(types().filter((x) => x === 'ai.apply')).toHaveLength(1);
  });

  it('une exclusion illisible donne une question, sans bouton Appliquer', async () => {
    render(<AiDirector />);
    await ask('Tout en rouge sauf les machins');
    const p = await screen.findByTestId('proposal');
    expect(within(p).getByTestId('ai-question').textContent).toMatch(/exclure/);
    expect(within(p).queryByTestId('ai-apply')).toBeNull();
    expect(lastState()).toBe('question');
  });

  it('une proposition périmée est affichée en échec, avec la raison et sans rapport inventé', async () => {
    render(<AiDirector />);
    await ask('Tout en bleu');
    const p = await screen.findByTestId('proposal');
    await run({ type: 'fixture.add', profileId: 'demo-par-rgb', mode: '3ch RGB', universe: 1, address: null, count: 1, namePrefix: 'Nouveau', tags: [] });
    await rtlAct(async () => { fireEvent.click(within(p).getByTestId('ai-apply')); });
    expect(within(p).getByRole('alert').textContent).toMatch(/périmée/);
    expect(screen.queryByTestId('ai-report')).toBeNull();
    expect(lastState()).toBe('failed');
  });

  it('« annule la dernière modification » propose Défaire, relié à la vraie commande', async () => {
    render(<AiDirector />);
    await ask('Tout en bleu');
    await rtlAct(async () => { fireEvent.click(within(await screen.findByTestId('proposal')).getByTestId('ai-apply')); });
    await screen.findByTestId('ai-report');
    await ask('Annule la dernière modification');
    const undo = await screen.findByRole('button', { name: /Défaire la dernière application IA/ });
    await rtlAct(async () => { fireEvent.click(undo); });
    expect(types()).toContain('ai.undoApply');
    expect(svc.engine.snapshot().aiActive).toBe(false);
  });

  it('une réponse arrivée après l’effacement de la conversation est ignorée', () => {
    const { add, clear, patch } = useConversation.getState();
    const id = add('Tout en bleu');
    clear();
    patch(id, { error: 'réponse tardive' });
    expect(useConversation.getState().exchanges).toEqual([]);
  });

  it('effacer la conversation oublie le fil côté service', async () => {
    render(<AiDirector />);
    await ask('Tout en bleu');
    await screen.findByTestId('proposal');
    await rtlAct(async () => { fireEvent.click(screen.getByRole('button', { name: /Effacer la conversation/ })); });
    expect(useConversation.getState().exchanges).toEqual([]);
    expect(types()).toContain('ai.resetThread');
  });
});
