// @vitest-environment jsdom
import path from 'node:path';
import { render, screen, fireEvent, act as rtlAct, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import { Visualizer } from '../../src/renderer/features/Visualizer';
import { useStore } from '../../src/renderer/store';
import { addFixtureAt, placeAt } from '../../src/renderer/sceneActions';
import { commandSchema, type Command, type CommandInput } from '../../src/shared/commands';
import type { AppService } from '../../src/core/app/AppService';
import { loadProjectFile, saveProjectFile } from '../../src/core/project/store';
import { validatePatch } from '../../src/core/fixtures/patch';
import { ProfileLibrary } from '../../src/core/fixtures/profiles';
import { HANG_OFFSET } from '../../src/core/visualizer/truss';
import { demoProject, makeService, tempDir } from '../helpers';

/**
 * Stage workspace (Construire · plan / 3D · Sélection) against a real headless AppService: every placement, edit,
 * deletion and undo goes through the same validated commands as the main process.
 */
let svc: AppService;
let sent: Command[];

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
  Element.prototype.scrollIntoView ??= () => undefined;
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
  await run({ type: 'project.new', name: 'Test' });
  for (const f of demoProject().patch.slice(0, 2)) await run({ type: 'fixture.add', profileId: f.profileId, mode: f.mode, universe: f.universe, address: f.address, count: 1, namePrefix: f.name.replace(/ \d+$/u, ''), tags: [] });
  useStore.setState({
    project: svc.projectState(), runtime: svc.runtimeState(), values: {}, sources: {}, selection: [], sceneSel: null, placing: null,
    confirm: null, notice: null, toasts: [], stageMode: '2d', stagePanels: { build: true, inspect: false },
  });
});

afterEach(async () => {
  await svc.dispose();
});

const run = (raw: CommandInput) => svc.execute(commandSchema.parse(raw) as never) as Promise<{ ids: string[] }>;
const project = () => svc.getProject();
const click = async (id: string) => rtlAct(async () => { fireEvent.click(screen.getByTestId(id)); });

describe('Construire', () => {
  it('présente exactement les cinq catégories, chacune ouvre son catalogue et revient à la liste', async () => {
    render(<Visualizer />);
    const cats = within(screen.getByRole('navigation', { name: 'Catégories' })).getAllByRole('button');
    expect(cats.map((b) => b.dataset.testid)).toEqual(['build-cat-point', 'build-cat-structure', 'build-cat-decor', 'build-cat-performer', 'build-cat-screen']);
    for (const id of ['point', 'structure', 'decor', 'performer', 'screen']) {
      await click(`build-cat-${id}`);
      expect(screen.getByTestId(`catalogue-${id}`)).toBeTruthy();
      expect(screen.getByTestId(`build-cat-${id}`).getAttribute('aria-pressed')).toBe('true');
      expect(cats.filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
      await click('build-back');
      expect(screen.queryByTestId(`catalogue-${id}`)).toBeNull();
      expect(screen.getByTestId('shape-rect')).toBeTruthy();
    }
  });

  it('le catalogue Point liste les profils réels de la bibliothèque et la recherche filtre', async () => {
    render(<Visualizer />);
    await click('build-cat-point');
    const lib = new ProfileLibrary([...(useStore.getState().project!.library ?? []), ...project().profiles]);
    const tiles = () => screen.getByTestId('catalogue-point').querySelectorAll('.fixture-tile');
    expect(tiles()).toHaveLength(lib.all().length);
    const first = lib.all()[0]!;
    fireEvent.change(screen.getByTestId('lib-search'), { target: { value: first.name } });
    expect([...tiles()].map((x) => x.getAttribute('data-testid'))).toContain(`fixture-${first.id}`);
    fireEvent.change(screen.getByTestId('lib-search'), { target: { value: 'zzz-introuvable' } });
    expect(tiles()).toHaveLength(0);
    expect(screen.getByText(/Aucun élément ne correspond/u)).toBeTruthy();
  });

  it('recherche dans le catalogue Structure (accents ignorés)', async () => {
    render(<Visualizer />);
    await click('build-cat-structure');
    fireEvent.change(screen.getByTestId('lib-search'), { target: { value: 'TOTEM' } });
    expect(screen.getByTestId('catalogue-structure').querySelectorAll('.scene-lib-item')).toHaveLength(3);
  });
});

describe('Placement', () => {
  it('un projecteur du catalogue est patché (adresse libre), posé au point cliqué puis sélectionné et inspecté', async () => {
    render(<Visualizer />);
    await click('build-cat-point');
    const tile = screen.getByTestId('catalogue-point').querySelector('.fixture-tile')!;
    await rtlAct(async () => { fireEvent.click(tile); });
    const spec = useStore.getState().placing!;
    expect(spec.kind).toBe('fixture');
    expect(screen.getByTestId('placing').textContent).toContain(spec.label);
    const before = project().patch.length;
    await rtlAct(async () => { placeAt(spec, { x: 1.5, y: 2.25 }); });
    await waitFor(() => expect(project().patch).toHaveLength(before + 1));
    const added = project().patch.at(-1)!;
    expect(added.position).toEqual({ x: 1.5, y: 2.25 });
    expect(added.trussId ?? null).toBeNull();
    await waitFor(() => expect(useStore.getState().selection).toEqual([added.id]));
    expect(useStore.getState().placing).toBeNull();
    // Patch stays valid: no overlap with the existing fixtures.
    const lib = new ProfileLibrary([...(useStore.getState().project!.library ?? []), ...project().profiles]);
    expect(validatePatch(lib, project().patch).filter((i) => i.kind === 'overlap')).toEqual([]);
    await click('tab-dmx');
    expect(await screen.findByTestId('fixture-dmx')).toBeTruthy();
  });

  it('posé près d’une structure, le projecteur s’y accroche à la hauteur d’accroche', async () => {
    render(<Visualizer />);
    await rtlAct(async () => { placeAt({ kind: 'truss', label: 'Pont', preset: { name: 'Pont', shape: 'line', length: 8, height: 5, support: 'towers' } }, { x: 0, y: 4 }); });
    await waitFor(() => expect(project().visualizer.trusses).toHaveLength(1));
    const truss = project().visualizer.trusses[0]!;
    const profileId = project().patch[0]!.profileId, mode = project().patch[0]!.mode;
    const id = await rtlAct(async () => addFixtureAt(profileId, mode, { x: truss.x + 1, y: truss.y + 0.2 }));
    const f = project().patch.find((x) => x.id === id)!;
    expect(f.trussId).toBe(truss.id);
    expect(f.height).toBeCloseTo(5 - HANG_OFFSET);
    // Persisted relation: save then reload the project file.
    const file = path.join(tempDir(), 'stage.luma');
    await saveProjectFile(file, project());
    const loaded = (await loadProjectFile(file)).project;
    expect(loaded.patch.find((x) => x.id === id)?.trussId).toBe(truss.id);
    expect(loaded.visualizer.trusses.map((t) => t.id)).toEqual([truss.id]);
  });

  it('un élément de bibliothèque posé est créé une seule fois, sélectionné, et ne se duplique pas au changement de vue', async () => {
    render(<Visualizer />);
    await click('build-cat-structure');
    await click('lib-totem-3');
    expect(useStore.getState().placing?.label).toBe('Totem 3 m');
    await rtlAct(async () => { placeAt(useStore.getState().placing!, { x: 2, y: 3 }); });
    await waitFor(() => expect(project().visualizer.trusses).toHaveLength(1));
    const totem = project().visualizer.trusses[0]!;
    expect(totem).toMatchObject({ shape: 'totem', height: 3 });
    expect(useStore.getState().sceneSel).toEqual({ kind: 'truss', id: totem.id });
    expect(await screen.findByTestId('selection-element')).toBeTruthy();
    await click('stage-mode-split');
    await click('stage-mode-2d');
    expect(project().visualizer.trusses).toHaveLength(1);
    expect(screen.getAllByTestId('tree-row').filter((r) => r.classList.contains('on'))).toHaveLength(1);
  });
});

describe('Sélection et propriétés', () => {
  it('la hiérarchie reflète le modèle ; sélectionner, déplacer, pivoter, supprimer, annuler et rétablir', async () => {
    render(<Visualizer />);
    await rtlAct(async () => { placeAt({ kind: 'prop', label: 'Praticable', preset: { kind: 'riser', name: 'Praticable', width: 2, depth: 1, height: 0.4, color: '#2a2f3a', elevation: 0 } }, { x: 0, y: 2 }); });
    await waitFor(() => expect(project().visualizer.props).toHaveLength(1));
    const rows = () => screen.getAllByTestId('tree-row');
    expect(rows()).toHaveLength(project().patch.length + 1);
    await rtlAct(async () => { useStore.getState().setSceneSel(null); });
    const row = rows().find((r) => r.textContent?.includes('Praticable'))!;
    await rtlAct(async () => { fireEvent.click(within(row).getAllByRole('button')[0]!); });
    expect(useStore.getState().sceneSel?.kind).toBe('prop');
    // Position X and rotation through the inspector card (real scene model, not the mesh).
    const card = screen.getByTestId('selection-element');
    const input = (label: string) => within(card).getByTitle(new RegExp(label, 'u')).querySelector('input')!;
    fireEvent.change(input('jardin'), { target: { value: '3' } });
    await rtlAct(async () => { fireEvent.blur(input('jardin')); });
    await waitFor(() => expect(project().visualizer.props[0]!.x).toBe(3));
    fireEvent.change(input('Rotation'), { target: { value: '90' } });
    await rtlAct(async () => { fireEvent.blur(input('Rotation')); });
    await waitFor(() => expect(project().visualizer.props[0]!.rotation).toBe(90));
    // Delete from the row menu, then undo / redo.
    await rtlAct(async () => { fireEvent.click(within(rows().find((r) => r.textContent?.includes('Praticable'))!).getByTestId('tree-more')); });
    await click('tree-delete');
    await waitFor(() => expect(project().visualizer.props).toHaveLength(0));
    expect(useStore.getState().sceneSel).toBeNull();
    await click('scene-undo');
    await waitFor(() => expect(project().visualizer.props).toHaveLength(1));
    expect(project().visualizer.props[0]!.x).toBe(3);
    await click('scene-redo');
    await waitFor(() => expect(project().visualizer.props).toHaveLength(0));
  });

  it('l’inspecteur d’un projecteur édite son adresse DMX ; un chevauchement est refusé', async () => {
    const [a, b] = project().patch;
    useStore.getState().setSelection([b!.id]);
    render(<Visualizer />);
    await click('tab-dmx');
    const addr = within(await screen.findByTestId('fixture-address')).getByRole('textbox');
    fireEvent.change(addr, { target: { value: '400' } });
    await rtlAct(async () => { fireEvent.blur(addr); });
    await waitFor(() => expect(project().patch.find((x) => x.id === b!.id)!.address).toBe(400));
    fireEvent.change(addr, { target: { value: String(a!.address) } });
    await rtlAct(async () => { fireEvent.blur(addr); });
    expect(useStore.getState().notice?.detail).toBeTruthy();
    expect(project().patch.find((x) => x.id === b!.id)!.address).toBe(400);
  });

  it('supprimer un projecteur depuis la hiérarchie demande confirmation', async () => {
    useStore.setState({ stagePanels: { build: true, inspect: true } });
    render(<Visualizer />);
    const name = project().patch[0]!.name;
    const row = screen.getAllByTestId('tree-row').find((r) => r.textContent?.includes(name))!;
    await rtlAct(async () => { fireEvent.click(within(row).getByTestId('tree-more')); });
    await click('tree-delete');
    expect(useStore.getState().confirm?.title).toBe('Supprimer le projecteur');
    const before = project().patch.length;
    await rtlAct(async () => useStore.getState().confirm!.resolve(true));
    await waitFor(() => expect(project().patch).toHaveLength(before - 1));
  });

  it('états vides : scène vide et aucune sélection', async () => {
    for (const f of project().patch) await run({ type: 'fixture.remove', ids: [f.id] });
    useStore.setState({ project: svc.projectState(), stagePanels: { build: true, inspect: true } });
    render(<Visualizer />);
    expect(screen.getByTestId('hierarchy-empty')).toBeTruthy();
    expect(screen.getByTestId('selection-empty')).toBeTruthy();
  });
});

describe('Disposition', () => {
  it('les panneaux se replient et se rouvrent ; les modes 2D, 3D et divisé restent accessibles', async () => {
    render(<Visualizer />);
    await click('build-collapse');
    expect(screen.queryByTestId('stage-settings')).toBeNull();
    await click('stage-settings-toggle');
    expect(screen.getByTestId('stage-settings')).toBeTruthy();
    expect(screen.queryByTestId('hierarchy')).toBeNull();
    await click('stage-inspect-toggle');
    expect(screen.getByTestId('hierarchy')).toBeTruthy();
    await click('inspect-collapse');
    expect(screen.queryByTestId('hierarchy')).toBeNull();
    await click('stage-inspect-toggle');
    expect(screen.getByTestId('hierarchy')).toBeTruthy();
    await click('stage-mode-split');
    expect(document.querySelectorAll('.view-card')).toHaveLength(2);
    expect(screen.getByText('Plan 2D')).toBeTruthy();
    expect(screen.getByText('Vue 3D')).toBeTruthy();
    expect(useStore.getState().stageMode).toBe('split');
    await click('stage-mode-2d');
    expect(screen.getByTestId('stage-canvas')).toBeTruthy();
  });

  it('Échap annule le placement sans rien créer', async () => {
    render(<Visualizer />);
    await click('build-cat-decor');
    await click('lib-speaker');
    expect(useStore.getState().placing).not.toBeNull();
    await rtlAct(async () => { fireEvent.keyDown(document.body, { key: 'Escape' }); });
    expect(useStore.getState().placing).toBeNull();
    expect(project().visualizer.props).toHaveLength(0);
    expect(sent.filter((c) => c.type === 'project.update')).toHaveLength(0);
  });
});
