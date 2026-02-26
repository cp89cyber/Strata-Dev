import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html']
    }
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'app/shared'),
      '@main': path.resolve(__dirname, 'app/main')
    }
  }
});
