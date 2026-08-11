/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { crx, type ManifestV3Export } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };

const srcPath = (dir: string) => fileURLToPath(new URL(`./src/${dir}`, import.meta.url));

export default defineConfig({
  plugins: [react(), crx({ manifest: manifest as ManifestV3Export })],
  define: {
    // Keep the popup version in sync with the manifest.
    __APP_VERSION__: JSON.stringify(manifest.version),
  },
  build: {
    /*
     * `UPI_DEBUG=1 npm run build` produces a readable bundle. A minified stack
     * from inside an extension names functions like `p`, which is useless when
     * the failure is a module that throws while Chrome is evaluating it.
     */
    // `true` keeps Vite's own default minifier; naming esbuild explicitly
    // breaks on Vite 8, which ships oxc and no longer bundles esbuild.
    minify: !process.env.UPI_DEBUG,
    sourcemap: process.env.UPI_DEBUG ? 'inline' : false,

    // Module preloads produce cross-world warnings on extension pages.
    modulePreload: false,
  },
  resolve: {
    alias: {
      '@shared': srcPath('shared'),
      '@background': srcPath('background'),
      '@content': srcPath('content'),
      '@popup': srcPath('popup'),
    },
  },
  server: {
    // CRXJS needs a stable port so the unpacked extension can reconnect for HMR.
    port: 5173,
    strictPort: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
