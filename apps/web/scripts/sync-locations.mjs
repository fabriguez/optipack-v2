#!/usr/bin/env node
/**
 * Telecharge les donnees pays / regions / villes et les place dans
 * apps/web/public/locations/, en splittant les villes par pays pour
 * un chargement lazy (~13 MB total, ~75 KB en moyenne par pays).
 *
 * Sources :
 *   1. CDN jsdelivr (rapide et fiable)
 *   2. GitHub Pages venkatmcajj.github.io (fallback historique)
 *
 * Usage :
 *   node apps/web/scripts/sync-locations.mjs           # telecharge si manquant
 *   node apps/web/scripts/sync-locations.mjs --force   # ecrase
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public', 'locations');
const CITIES_DIR = path.join(PUBLIC_DIR, 'cities');

const FILES = ['countriesminified', 'statesminified', 'regionsminified', 'languagesminified'];

// Le repo source ne publie les JSON que sous /data/ sur le master GitHub.
// On utilise jsdelivr (CDN qui mirror GitHub) en priorite, puis raw.githubusercontent
// en fallback. GitHub Pages (venkatmcajj.github.io) est instable et non utilisee.
const SOURCES = [
  (f) => `https://cdn.jsdelivr.net/gh/venkatmcajj/react-country-state-city@master/data/${f}.json`,
  (f) => `https://raw.githubusercontent.com/venkatmcajj/react-country-state-city/master/data/${f}.json`,
];

const FORCE = process.argv.includes('--force');

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function fetchWithFallback(filename) {
  let lastErr;
  for (const sourceBuilder of SOURCES) {
    const url = sourceBuilder(filename);
    try {
      console.log(`  -> ${url}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      console.warn(`     ${err.message}, fallback...`);
    }
  }
  throw lastErr ?? new Error('Tous les miroirs ont echoue');
}

async function downloadFile(name) {
  const dest = path.join(PUBLIC_DIR, `${name}.json`);
  if (!FORCE && (await exists(dest))) {
    console.log(`[skip] ${name}.json existe deja`);
    return dest;
  }
  console.log(`[get]  ${name}.json`);
  const text = await fetchWithFallback(name);
  await fs.writeFile(dest, text);
  console.log(`       ok (${(text.length / 1024).toFixed(0)} KB)`);
  return dest;
}

async function splitCities() {
  const sentinel = path.join(CITIES_DIR, '.synced');
  if (!FORCE && (await exists(sentinel))) {
    console.log('[skip] cities deja splittees');
    return;
  }

  console.log('[get]  citiesminified.json (volumineux ~34 MB)');
  const raw = await fetchWithFallback('citiesminified');
  console.log(`       ok (${(raw.length / 1024 / 1024).toFixed(1)} MB)`);

  console.log('[split] cities par pays...');
  const data = JSON.parse(raw);
  await fs.mkdir(CITIES_DIR, { recursive: true });
  let totalCities = 0;
  for (const country of data) {
    await fs.writeFile(
      path.join(CITIES_DIR, `${country.id}.json`),
      JSON.stringify(country),
    );
    for (const s of country.states || []) totalCities += (s.cities || []).length;
  }
  await fs.writeFile(sentinel, new Date().toISOString());
  console.log(`       ${data.length} pays, ${totalCities} villes`);
}

async function main() {
  await fs.mkdir(PUBLIC_DIR, { recursive: true });
  for (const f of FILES) {
    await downloadFile(f);
  }
  await splitCities();
  console.log('\n  Donnees locations pretes dans public/locations/');
}

main().catch((err) => {
  console.error('\nEchec :', err.message);
  process.exit(1);
});
