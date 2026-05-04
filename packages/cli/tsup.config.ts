import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/reset.ts', 'src/project.ts'],
  format: ['esm'],
  sourcemap: true,
  clean: true,
  target: 'node20',
});
