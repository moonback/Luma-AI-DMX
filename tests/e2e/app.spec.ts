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
