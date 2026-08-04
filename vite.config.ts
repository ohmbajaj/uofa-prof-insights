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
    // Single source of truth for the version shown in the popup.
    __APP_VERSION__: JSON.stringify(manifest.version),
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
