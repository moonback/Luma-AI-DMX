import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/components/**/*.test.tsx', 'tests/eval/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    // Synthetic audio/video scenes are CPU-heavy; with parallel workers 5 s is too tight.
    testTimeout: 20_000,
    // Same for beforeAll hooks: the synthetic songs take longer to analyse under coverage instrumentation.
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/core/**'],
      reporter: ['text-summary', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      // Ratchet: a little under the measured level (lines 90 %, branches 74 % on 18/10/2026).
      thresholds: { lines: 85, statements: 80, functions: 80, branches: 70 },
    },
  },
});
