'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { applyPaletteToDocument, generatePalette } from '@/lib/theme/palette-generator';

export interface TenantMeta {
  id: string;
  slug: string | null;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  modules: string[];
  supportEmail: string | null;
  defaultCurrency: string;
  defaultLanguage: string;
}

interface TenantContextValue {
  meta: TenantMeta | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Modules actives. Si meta.modules est vide -> tous actifs (compat). */
  isModuleEnabled: (moduleName: string) => boolean;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

const FALLBACK_META: TenantMeta = {
  id: 'fallback',
  slug: null,
  name: 'TransitSoftServices',
  logoUrl: null,
  primaryColor: '#1B5E20',
  secondaryColor: '#4CAF50',
  accentColor: '#E8F5E9',
  modules: [],
  supportEmail: null,
  defaultCurrency: 'XAF',
  defaultLanguage: 'fr',
};

async function fetchTenantMeta(): Promise<TenantMeta> {
  try {
    const res = await fetch(`${API_URL}/tenant-meta`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    return json.data as TenantMeta;
  } catch {
    return FALLBACK_META;
  }
}

function applyTheme(meta: TenantMeta) {
  // Genere et applique la palette principale
  const primary = generatePalette(meta.primaryColor);
  applyPaletteToDocument(primary, 'color-primary');
  // Couleurs additionnelles en CSS vars individuelles
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--color-secondary', meta.secondaryColor);
    document.documentElement.style.setProperty('--color-accent', meta.accentColor);
  }
}

export function TenantProvider({ children, initialMeta }: { children: ReactNode; initialMeta?: TenantMeta }) {
  const [meta, setMeta] = useState<TenantMeta | null>(initialMeta ?? null);
  const [loading, setLoading] = useState(!initialMeta);

  useEffect(() => {
    if (initialMeta) {
      applyTheme(initialMeta);
      return;
    }
    let cancelled = false;
    fetchTenantMeta().then((m) => {
      if (cancelled) return;
      setMeta(m);
      setLoading(false);
      applyTheme(m);
    });
    return () => {
      cancelled = true;
    };
  }, [initialMeta]);

  const value = useMemo<TenantContextValue>(
    () => ({
      meta,
      loading,
      refresh: async () => {
        setLoading(true);
        const m = await fetchTenantMeta();
        setMeta(m);
        applyTheme(m);
        setLoading(false);
      },
      isModuleEnabled: (moduleName: string) => {
        if (!meta) return true; // pas encore charge -> on autorise tout (UI)
        if (meta.modules.length === 0) return true; // vide = tous actifs
        return meta.modules.includes(moduleName);
      },
    }),
    [meta, loading],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenantMeta(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenantMeta doit etre utilise dans <TenantProvider>');
  return ctx;
}

export function useModuleEnabled(moduleName: string): boolean {
  return useTenantMeta().isModuleEnabled(moduleName);
}
