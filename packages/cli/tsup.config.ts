import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  sourcemap: true,
  clean: true,
  target: 'node20',
  // reset.ts and project.ts are created in later tasks (18/19).
  // Mark their output paths as external so esbuild does not attempt to
  // resolve them at build time; the lazy import() is only executed at
  // runtime when the user actually invokes those subcommands.
  external: ['./reset.js', './project.js'],
});
