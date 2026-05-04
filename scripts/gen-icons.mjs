import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import png2icons from 'png2icons';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../packages/core/src/assets/source/icon.svg');
const OUT = resolve(here, '../packages/core/src/assets');

mkdirSync(OUT, { recursive: true });

const svg = readFileSync(SRC);

// 512×512 base for PNG and ICNS (macOS asks for high-res); 256×256 for ICO (Windows max).
const png512 = await sharp(svg).resize(512, 512).png().toBuffer();
const png256 = await sharp(svg).resize(256, 256).png().toBuffer();

writeFileSync(resolve(OUT, 'icon.png'), png512);

const icns = png2icons.createICNS(png512, png2icons.BILINEAR, 0);
if (!icns) throw new Error('ICNS generation failed');
writeFileSync(resolve(OUT, 'icon.icns'), icns);

const ico = png2icons.createICO(png256, png2icons.BILINEAR, 0, true);
if (!ico) throw new Error('ICO generation failed');
writeFileSync(resolve(OUT, 'icon.ico'), ico);

console.log(`Generated:
  ${resolve(OUT, 'icon.png')}  (${png512.length} bytes)
  ${resolve(OUT, 'icon.icns')} (${icns.length} bytes)
  ${resolve(OUT, 'icon.ico')}  (${ico.length} bytes)`);
