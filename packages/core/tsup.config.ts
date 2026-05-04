import { defineConfig } from 'tsup';
import { copyFile, mkdir, rm } from 'node:fs/promises';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  // Copy bundled icon binaries (src/assets/icon.{png,icns,ico}) up to the
  // package root (assets/) so they ship in the published tarball alongside
  // dist/. notify.ts resolves them via dist/../assets/icon.* at runtime.
  // The src/assets/source/ SVG is intentionally excluded — it's a build-time
  // source-of-truth, not a runtime dependency.
  onSuccess: async () => {
    await rm('assets', { recursive: true, force: true });
    await mkdir('assets', { recursive: true });
    for (const name of ['icon.png', 'icon.icns', 'icon.ico']) {
      await copyFile(`src/assets/${name}`, `assets/${name}`);
    }
  },
});
