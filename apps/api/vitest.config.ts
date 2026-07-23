import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: '../../coverage/api',
      include: ['src/domain/**/*.ts', 'src/security/**/*.ts', 'src/modules/**/*.ts', 'src/common/**/*.ts', 'src/infra/**/*.ts'],
      exclude: ['src/main.ts', 'src/app.module.ts'],
      thresholds: {
        lines: 75,
        functions: 50,
        statements: 75,
        branches: 70,
        'src/domain/**': { lines: 90 },
        'src/security/**': { lines: 90 },
        'src/modules/**': { lines: 80 },
      },
    },
  },
});
