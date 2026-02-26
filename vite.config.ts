import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron/simple';

export default defineConfig({
  root: path.resolve(__dirname, 'app/renderer'),
  plugins: [
    react(),
    electron({
      main: {
        entry: path.resolve(__dirname, 'app/main/index.ts'),
        vite: {
          build: {
            rollupOptions: {
              external: ['better-sqlite3', 'keytar']
            }
          }
        }
      },
      preload: {
        input: path.resolve(__dirname, 'app/preload/index.ts'),
        vite: {
          build: {
            rollupOptions: {
              external: ['better-sqlite3', 'keytar']
            }
          }
        }
      },
      renderer: {}
    })
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'app/shared'),
      '@renderer': path.resolve(__dirname, 'app/renderer/src'),
      '@main': path.resolve(__dirname, 'app/main')
    }
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true
  }
});
