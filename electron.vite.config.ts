import { resolve } from 'node:path';
import { copyFileSync, existsSync } from 'node:fs';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

/** Copies public/video.mp4 into out/renderer/ so the splash screen can load it in production. */
function copyVideoPlugin(): Plugin {
  return {
    name: 'luma-copy-video',
    apply: 'build',
    closeBundle() {
      const src = resolve('public/video.mp4');
      const dest = resolve('out/renderer/video.mp4');
      if (existsSync(src)) {
        copyFileSync(src, dest);
      }
    },
  };
}

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
    plugins: [react(), { name: 'luma-csp-prod', apply: 'build', transformIndexHtml: (html: string) => html.replace(' ws://localhost:*', '') }, copyVideoPlugin()],
  },
});
