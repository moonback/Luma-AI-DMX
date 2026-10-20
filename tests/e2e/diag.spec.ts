import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test, _electron as electron } from '@playwright/test';

const require = createRequire(import.meta.url);
const electronPath = require('electron') as unknown as string;

test.setTimeout(240_000);
test('diag 3D + IA', async () => {
  const app = await electron.launch({
    executablePath: electronPath,
    args: [path.resolve('out/main/index.js'), '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    env: { ...process.env, LUMA_USER_DATA: mkdtempSync(path.join(tmpdir(), 'luma-diag-')), LUMA_E2E: '1' },
  });
  const page = await app.firstWindow();
  const logs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 300)}`));
  page.on('framenavigated', (f) => logs.push(`[nav] ${f.url()}`));
  app.on('window', (w) => logs.push(`[window] ${w.url()}`));
  await page.setViewportSize({ width: 1440, height: 900 });
  console.log('STEP launched', page.url());
  await page.getByTestId('welcome-skip').click();
  console.log('STEP welcome skipped');
  type Inv = (c: unknown) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
  const inv = (cmd: unknown) => page.evaluate((x) => (window as unknown as { luma: { invoke: Inv } }).luma.invoke(x), cmd);
  await inv({ type: 'fixture.add', profileId: 'demo-spot', mode: '13ch étendu', universe: 2, address: null, count: 2, namePrefix: 'Lyre', tags: [] });
  const probe = async (label: string) => {
    const t0 = Date.now();
    const r = await Promise.race([page.evaluate(() => 1 + 1).then(() => 'ok'), new Promise((res) => setTimeout(() => res('FROZEN'), 8000))]);
    const t1 = Date.now();
    const m = await Promise.race([app.evaluate(() => 1 + 1).then(() => 'ok'), new Promise((res) => setTimeout(() => res('FROZEN'), 8000))]);
    const t2 = Date.now();
    const raf = r === 'ok' ? await page.evaluate(() => new Promise<number>((res) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); })) : -1;
    console.log('PROBE', label, `renderer=${r} ${t1 - t0}ms main=${m} ${t2 - t1}ms raf/s=${raf}`, logs.splice(0).join(' | ').slice(0, 400));
    return r === 'ok';
  };
  await probe('after fixture.add');
  await page.waitForTimeout(2000);
  await probe('dashboard settled');
  await page.getByTestId('nav-ai').click();
  await page.waitForTimeout(2500);
  await probe('ai page settled (theme on)');
  await page.addStyleTag({ content: '.app::after { will-change: transform; }' });
  await page.waitForTimeout(800);
  await probe('ai: grid layer promoted');
  await page.addStyleTag({ content: '.app::before { animation-play-state: paused !important; }' });
  await page.waitForTimeout(800);
  await probe('ai: + aurora paused');
  await page.addStyleTag({ content: '.app::before { display: none !important; }' });
  await page.waitForTimeout(800);
  await probe('ai: + aurora removed');
  await page.addStyleTag({ content: '.app::after { display: none !important; }' });
  await page.waitForTimeout(800);
  await probe('ai: + grid removed');
  await app.close();
});
