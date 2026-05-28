#!/usr/bin/env node
/**
 * Prend source.png (logo brut fourni) et le rend CARRE sans modification
 * (juste un padding transparent), puis le decline aux tailles requises
 * pour chaque app.
 *
 * Usage : `pnpm --filter @transitsoftservices/brand generate`
 */
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const brandDir = resolve(here, '..');
const sourcePath = join(brandDir, 'source.png');

// Construit un buffer PNG carre a partir de la source, avec padding transparent.
async function squareBuffer() {
  const img = sharp(sourcePath);
  const meta = await img.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const side = Math.max(w, h);
  const top = Math.floor((side - h) / 2);
  const bottom = side - h - top;
  const left = Math.floor((side - w) / 2);
  const right = side - w - left;
  return img
    .extend({ top, bottom, left, right, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

const squareSrc = await squareBuffer();

const mobileTargets = [
  { name: 'icon.png', size: 1024 },
  { name: 'adaptive-icon.png', size: 1024 },
  { name: 'splash.png', size: 2048 },
  { name: 'favicon.png', size: 96 },
];

const webApps = ['web', 'web-client', 'ops-admin'];

async function ensureDir(p) {
  if (!existsSync(p)) await mkdir(p, { recursive: true });
}

async function emit(filePath, buf) {
  await ensureDir(dirname(filePath));
  await writeFile(filePath, buf);
  console.log('  →', filePath.replace(root + '/', ''));
}

async function render(size) {
  return sharp(squareSrc).resize(size, size).png().toBuffer();
}

console.log('Generating brand assets (square, unmodified)...');

for (const app of ['mobile', 'tablet']) {
  for (const t of mobileTargets) {
    const out = join(root, 'apps', app, 'assets', t.name);
    await emit(out, await render(t.size));
  }
}

for (const app of webApps) {
  const pub = join(root, 'apps', app, 'public');
  await ensureDir(pub);
  // PNG original carre dispo dans public/
  await emit(join(pub, 'logo.png'), squareSrc);
  await emit(join(pub, 'favicon.png'), await render(512));
}

// Aussi : enregistre la version carree de reference dans brand/
await emit(join(brandDir, 'generated', 'logo-square.png'), squareSrc);

console.log('Done.');
