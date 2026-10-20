import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  // The app runs on SwiftShader (software GL) in E2E: a 3D view renders at ~3 i/s there, so every step gets twice the usual budget.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [['list']],
  use: { screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
