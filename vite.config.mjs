// @ts-check
/**
 * Vite config. Two builds plus the dev server:
 *   npm run dev           → development server (http://localhost:5173/)
 *   npm run build:single  → dist/valheim-checkup.html, everything inlined, opens from file://
 *   npm run build:site    → dist/site/, separate files for hosting later
 * scripts/build.cjs still builds the flat original into dist/original.html (DECISIONS point 7).
 */
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import inlineLegacy from './tools/vite-plugin-inline-legacy.mjs';

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    publicDir: false,
    plugins: [
      inlineLegacy(),
      ...(single ? [viteSingleFile({ outputFileName: 'valheim-checkup.html' })] : []),
    ],
    build: single
      ? { outDir: 'dist', emptyOutDir: false, target: 'es2022' }
      : { outDir: 'dist/site', emptyOutDir: true, target: 'es2022' },
    server: { open: false },
  };
});
