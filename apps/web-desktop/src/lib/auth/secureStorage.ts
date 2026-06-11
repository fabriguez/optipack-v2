import { invoke } from '@tauri-apps/api/core';
import type { StateStorage } from 'zustand/middleware';

// Storage zustand adosse au trousseau OS via les commandes Tauri
// secure_get/secure_set/secure_del. Remplace localStorage pour les tokens
// d'auth (qui sont des secrets et ne doivent pas etre lisibles par le JS de
// la webview).
//
// Fallback localStorage uniquement hors Tauri (ex: `pnpm dev` ouvert dans un
// navigateur classique pour du debug rapide). En prod l'app tourne toujours
// dans la webview Tauri -> chemin trousseau.

const isTauri =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

export const secureStorage: StateStorage = {
  getItem: async (name) => {
    if (!isTauri) return localStorage.getItem(name);
    try {
      const v = await invoke<string | null>('secure_get', { key: name });
      return v ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    if (!isTauri) {
      localStorage.setItem(name, value);
      return;
    }
    try {
      await invoke('secure_set', { key: name, value });
    } catch {
      /* trousseau indispo : on echoue silencieusement, session non persistee */
    }
  },
  removeItem: async (name) => {
    if (!isTauri) {
      localStorage.removeItem(name);
      return;
    }
    try {
      await invoke('secure_del', { key: name });
    } catch {
      /* idempotent */
    }
  },
};
