import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

const require = createRequire(import.meta.url);
const electronPath = require('electron') as unknown as string;
const shots = path.resolve('test-results/screens');

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await electron.launch({
    executablePath: electronPath,
    args: [path.resolve('out/main/index.js')],
    env: { ...process.env, LUMA_USER_DATA: mkdtempSync(path.join(tmpdir(), 'luma-e2e-')), LUMA_E2E: '1' },
  });
  page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId('mode')).toHaveText('SIMULATION');
});

test.afterAll(async () => {
  await app?.close();
});

const nav = (id: string) => page.getByTestId(`nav-${id}`).click();
const channel = (ch: number) => page.locator(`.dmx-cell[data-ch="${ch}"]`);

test('sécurité Electron : pas de Node dans le renderer, API minimale exposée', async () => {
  const exposed = await page.evaluate(() => ({
    require: typeof (window as unknown as { require?: unknown }).require,
    process: typeof (window as unknown as { process?: unknown }).process,
    api: Object.keys((window as unknown as { luma: object }).luma).sort(),
  }));
  expect(exposed).toEqual({ require: 'undefined', process: 'undefined', api: ['invoke', 'on'] });
  // Invalid commands are rejected by the main-process validator.
  const r = await page.evaluate(() => (window as unknown as { luma: { invoke: (c: unknown) => Promise<{ ok: boolean; error?: string }> } }).luma.invoke({ type: 'fixture.add', profileId: 'x', universe: 99 }));
  expect(r.ok).toBe(false);
  expect(r.error).toMatch(/Commande invalide/);
});

test('patch → console → sortie virtuelle → IA → rapport', async () => {
  await page.screenshot({ path: `${shots}/01-dashboard.png` });

  // Patch two RGBW PARs (6 ch each, auto addresses 1 and 7)
  await nav('fixtures');
  await page.getByTestId('add-fixture').click();
  await page.getByTestId('add-profile').selectOption('demo-par-rgbw');
  await page.locator('.modal input.input').nth(1).fill('2'); // quantity (universe, quantity, prefix, tags)
  await page.locator('.modal input.input').nth(1).blur();
  await page.getByTestId('add-confirm').click();
  await expect(page.getByTestId('patch-table').locator('tbody tr')).toHaveCount(2);
  await expect(page.getByTestId('patch-table')).toContainText('7–12');
  await page.screenshot({ path: `${shots}/02-fixtures.png` });

  // Live console: select first fixture, push the dimmer to full
  await nav('console');
  await page.getByTestId('fixture-tiles').locator('.fx-tile').first().click();
  await page.getByTestId('dimmer-fader').fill('255');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${shots}/03-console.png` });

  // DMX Output monitor: computed and transmitted states both show channel 1 = 255
  await nav('output');
  await page.getByRole('tab', { name: 'Moniteur 512 canaux' }).click();
  await expect(channel(1)).toHaveAttribute('data-v', '255');
  await expect(channel(7)).toHaveAttribute('data-v', '0');
  await page.getByTestId('monitor-source').selectOption({ label: 'Transmis : Sortie virtuelle' });
  await expect(channel(1)).toHaveAttribute('data-v', '255');
  await page.screenshot({ path: `${shots}/04-output-monitor.png` });

  // Release manual control (Escape), then let the AI build a look
  await page.keyboard.press('Escape');
  await nav('ai');
  await page.getByTestId('ai-prompt').fill('Crée une ambiance lounge violette et bleue.');
  await page.getByTestId('ai-send').click();
  await expect(page.getByTestId('proposal')).toContainText('Mode local déterministe');
  await expect(page.getByTestId('proposal')).toContainText('Ambiance lounge');
  await page.screenshot({ path: `${shots}/05-ai-proposal.png` });
  await page.getByTestId('ai-apply').click();
  await expect(page.getByTestId('ai-report')).toContainText('Vérification de l’état calculé');
  await page.waitForTimeout(3500); // AI fade (2 s) + output refresh
  await page.screenshot({ path: `${shots}/06-ai-report.png` });

  await nav('output');
  await page.getByRole('tab', { name: 'Moniteur 512 canaux' }).click();
  await expect(channel(1)).toHaveAttribute('data-v', String(Math.round(0.55 * 255))); // PAR 1 dimmer
  await expect(channel(4)).toHaveAttribute('data-v', '255'); // PAR 1 blue (violet)
  await expect(channel(10)).toHaveAttribute('data-v', '255'); // PAR 2 blue (bleu)

  // Visualizer reflects the look
  await nav('visualizer');
  await expect(page.getByTestId('stage-canvas')).toBeVisible();
  await page.screenshot({ path: `${shots}/07-visualizer.png` });

  // Scene created by the AI is listed in the programmer
  await nav('programmer');
  await expect(page.locator('body')).toContainText('Ambiance lounge');
  await page.screenshot({ path: `${shots}/08-programmer.png` });
});

test('blackout et STOP OUTPUT', async () => {
  await page.getByTestId('blackout').click();
  await nav('output');
  await page.getByRole('tab', { name: 'Moniteur 512 canaux' }).click();
  await expect(channel(1)).toHaveAttribute('data-v', '0');
  await page.getByTestId('blackout').click();
  await expect(channel(1)).not.toHaveAttribute('data-v', '0');
  await page.getByTestId('stop-output').click();
  await page.getByRole('tab', { name: 'Sorties' }).click();
  await expect(page.locator('body')).toContainText('STOP — émissions réelles arrêtées');
  await page.screenshot({ path: `${shots}/09-output-stop.png` });
  await page.getByRole('button', { name: 'Reprendre' }).first().click();
});

test('captures des autres espaces', async () => {
  for (const [id, n] of [['cues', '10'], ['effects', '11'], ['timeline', '12'], ['audio', '13'], ['settings', '14'], ['dashboard', '15']] as const) {
    await nav(id);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${shots}/${n}-${id}.png` });
  }
});

test('vue 3D du visualiseur : kit réel, faisceaux animés, caméras, sélection', async () => {
  type Inv = (c: unknown) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
  const inv = (cmd: unknown) => page.evaluate((x) => (window as unknown as { luma: { invoke: Inv } }).luma.invoke(x), cmd);
  const spots = (await inv({ type: 'fixture.add', profileId: 'demo-spot', mode: '13ch étendu', universe: 2, address: null, count: 4, namePrefix: 'Lyre', tags: [] })).data as { ids: string[] };
  const bars = (await inv({ type: 'fixture.add', profileId: 'demo-led-bar-4', mode: '14ch pixels', universe: 2, address: null, count: 2, namePrefix: 'Barre', tags: [] })).data as { ids: string[] };
  for (const [i, id] of bars.ids.entries()) await inv({ type: 'fixture.update', id, patch: { height: 0.2, position: { x: i ? 3 : -3, y: 7 } } });
  await inv({ type: 'programmer.set', fixtureIds: spots.ids, values: { dimmer: 1, tilt: 0.62, colorWheel: 65 / 255, gobo: 25 / 255, prism: 200 / 255 }, confirmSpecial: false });
  await inv({ type: 'programmer.set', fixtureIds: bars.ids, values: { dimmer: 1 }, confirmSpecial: false });
  const fx = (id: string, type: string, targets: string[], params: Record<string, unknown>) => inv({ type: 'effect.upsert', effect: { id, name: id, type, targets: { fixtureIds: targets, groupIds: [] }, params, priority: 50, blend: 'override', duration: null, trigger: 'manual', origin: 'user' } });
  await fx('mvt', 'panTilt', spots.ids, { speed: 0.2, amplitude: 0.5, phaseSpread: 0.5 });
  await fx('rbw', 'rainbow', bars.ids, { speed: 0.2, phaseSpread: 1 });
  await inv({ type: 'programmer.release', fixtureIds: spots.ids, attributes: ['pan'] });
  await inv({ type: 'effect.start', id: 'mvt' });
  await inv({ type: 'effect.start', id: 'rbw' });

  await nav('stage3d');
  await expect(page.getByTestId('stage-3d').locator('canvas')).toBeVisible();
  await expect(page.getByTestId('fps')).not.toHaveText('0 i/s', { timeout: 5000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${shots}/16-visualizer-3d-regie.png` });
  await page.getByTestId('cam-front').click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${shots}/16b-visualizer-3d-face.png` });
  await page.getByTestId('cam-top').click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${shots}/16c-visualizer-3d-dessus.png` });
  await page.getByTestId('cam-foh').click();
  // Select a moving head (shared selection with the console) → info panel shows its live data.
  await nav('console');
  await page.getByTestId('fixture-tiles').getByText('Lyre 1').click();
  await nav('stage3d');
  await expect(page.getByTestId('stage3d-info')).toContainText('Lyre 1');
  await expect(page.getByTestId('stage3d-info')).toContainText('prisme');
  await expect(page.getByTestId('stage3d-info')).toContainText('gobo 2');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/16d-visualizer-3d-selection.png` });
  // Detached second-screen window: chrome-less 3D view fed by the same live engine events.
  const [detached] = await Promise.all([app.waitForEvent('window'), page.getByTestId('stage3d-detach').click()]);
  await expect(detached.getByTestId('stage-3d').locator('canvas')).toBeVisible();
  await expect(detached.getByTestId('fps')).not.toHaveText('0 i/s', { timeout: 5000 });
  await expect(detached.getByTestId('nav-stage3d')).toHaveCount(0);
  await detached.screenshot({ path: `${shots}/16e-visualizer-3d-detache.png` });
  await detached.close();
  await inv({ type: 'effect.stopAll' });
});

test('raccourci reconfiguré : Blackout sur K', async () => {
  await nav('settings');
  await page.getByRole('tab', { name: 'Raccourcis' }).click();
  await page.getByTestId('rebind-blackout').click();
  await page.keyboard.press('k');
  await expect(page.getByTestId('shortcut-table')).toContainText('K');
  await page.screenshot({ path: `${shots}/17-shortcuts.png` });
  await page.getByTestId('settings-save').click();
  await nav('dashboard');
  await page.keyboard.press('k');
  await expect(page.getByTestId('blackout')).toHaveClass(/solid/);
  await page.keyboard.press('b'); // old binding no longer active
  await expect(page.getByTestId('blackout')).toHaveClass(/solid/);
  await page.keyboard.press('k');
  await expect(page.getByTestId('blackout')).not.toHaveClass(/solid/);
});

test('fournisseur OpenRouter sélectionnable avec choix du modèle', async () => {
  await nav('settings');
  await page.getByRole('tab', { name: 'IA et fournisseurs' }).click();
  await page.getByTestId('ai-provider').selectOption('openrouter');
  await expect(page.getByTestId('ai-model')).toHaveValue('openrouter/auto');
  await page.getByTestId('ai-model').fill('mistralai/mistral-small');
  await page.screenshot({ path: `${shots}/18-openrouter.png` });
});
