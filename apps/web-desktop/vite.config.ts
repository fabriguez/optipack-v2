import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// Tauri attend un port fixe + host fixe pour le devUrl.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Aligne sur le web : "@/*" -> racine du front. Ici la racine = src/.
      '@': path.resolve(__dirname, './src'),
      // Mirroir de `transpilePackages` du web : on consomme les SOURCES TS du
      // package skins (ESM, exports nommes traces par esbuild) plutot que son
      // dist CJS, dont Rollup ne trace pas les `export *`.
      '@transitsoftservices/skins': path.resolve(
        __dirname,
        '../../packages/skins/src/index.ts',
      ),
      // Idem pour shared (types/schemas/utils). Consomme les sources TS.
      '@transitsoftservices/shared': path.resolve(
        __dirname,
        '../../packages/shared/src/index.ts',
      ),
    },
  },
  // Empeche Vite de masquer les erreurs Rust dans le terminal Tauri.
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 5174 } : undefined,
    watch: {
      // src-tauri est gere par cargo, pas par Vite.
      ignored: ['**/src-tauri/**'],
    },
  },
});
