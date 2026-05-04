import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/reset.ts', 'src/project.ts'],
  format: ['esm'],
  sourcemap: true,
  clean: true,
  target: 'node20',
  // Bundle the workspace `@agent-notifier/core` package into the CLI dist
  // so we publish a single self-contained `agent-notifier` package on npm
  // (no separate core package to publish or version-sync).
  noExternal: [/^@agent-notifier\/core$/],
});
