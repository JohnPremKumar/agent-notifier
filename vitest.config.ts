import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.d.ts', '**/index.ts'],
      thresholds: { lines: 90, branches: 85, functions: 90, statements: 90 },
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/tests/**/*.test.ts'],
          exclude: ['packages/*/tests/integration/**'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['packages/*/tests/integration/**/*.test.ts'],
          testTimeout: 20000,
        },
      },
    ],
  },
});
