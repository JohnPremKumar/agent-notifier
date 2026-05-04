import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/*.d.ts',
        '**/index.ts',
        'packages/cli/src/disable.ts',
        'packages/cli/src/doctor.ts',
        'packages/cli/src/enable.ts',
        'packages/cli/src/hook.ts',
        'packages/cli/src/install.ts',
        'packages/cli/src/logs.ts',
        'packages/cli/src/mute.ts',
        'packages/cli/src/schedule.ts',
        'packages/cli/src/status.ts',
        'packages/cli/src/uninstall.ts',
      ],
      thresholds: { lines: 85, branches: 85, functions: 85, statements: 85 },
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/tests/**/*.test.ts'],
          exclude: ['packages/*/tests/integration/**'],
          // Unit tests are fast (<100ms each) on macOS, but the FIRST
          // `await import('../src/...')` in a file pays cold-resolution cost
          // for the workspace's transitive ESM graph. On Windows + Node 20 in
          // CI we observed this exceeding the 5s default. 15s is generous
          // headroom; truly slow tests still surface in summary output.
          testTimeout: 15000,
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
