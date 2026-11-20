import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(path.join(dir, 'icon-source.svg'));
const outDir = path.join(dir, '..', 'public', 'icons');

for (const [name, size] of [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['favicon-32.png', 32],
]) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(path.join(outDir, name));
  console.log('wrote', name);
}
