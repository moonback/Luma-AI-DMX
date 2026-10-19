import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    build: { externalizeDeps: true },
  },
  preload: {
    build: {
      externalizeDeps: true,
      // Sandboxed preloads must be CommonJS.
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html'), splash: resolve('src/renderer/splash.html'), updating: resolve('src/renderer/updating.html') } } },
    // The dev server's hot reload needs ws://localhost in the CSP; a packaged build must not allow it.
    plugins: [react(), { name: 'luma-csp-prod', apply: 'build', transformIndexHtml: (html: string) => html.replace(' ws://localhost:*', '') }],
  },
});
