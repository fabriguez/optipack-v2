import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { applyPaletteToDocument, generatePalette } from '@/lib/theme/palette-generator';
import {
  applySkinById,
  applyThemeById,
  type SkinCustomization,
  isKnownSkinId,
  isKnownThemeId,
  getTheme,
} from '@transitsoftservices/skins';

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
  skin?: string | null;
  theme?: string | null;
  skinCustomization?: SkinCustomization | null;
}

interface TenantContextValue {
  meta: TenantMeta | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Modules actives. Si meta.modules est vide -> tous actifs (compat). */
  isModuleEnabled: (moduleName: string) => boolean;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

// Desktop (Vite) : variables d'env via import.meta.env. Mirroir du
// NEXT_PUBLIC_API_URL cote web.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

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
  // 1) Skin (police, radius, palette par defaut, images) si configure.
  //    Skin = layout cote web-client, mais expose aussi des CSS vars
  //    pour les couleurs/typo. On applique en premier, le theme passera
  //    dessus.
  if (meta.skin && isKnownSkinId(meta.skin)) {
    applySkinById(meta.skin, (meta.skinCustomization ?? undefined) as SkinCustomization | undefined);
  }

  // 2) Theme (palette de couleurs) -- independant du skin. Si defini,
  //    surcharge les --skin-* couleurs ecrites par le skin. C'est le
  //    nouveau canal recommande pour la palette tenant (vs primary/
  //    secondary/accentColor legacy qui restent compatibles).
  const themeId = meta.theme;
  if (themeId && isKnownThemeId(themeId)) {
    applyThemeById(themeId);
    // Synchronise aussi la palette Tailwind primary-* avec la couleur
    // primaire du theme : sans ca, le dashboard garde l'ancien vert.
    const theme = getTheme(themeId);
    const palette = generatePalette(theme.primary);
    applyPaletteToDocument(palette, 'color-primary');
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--color-secondary', theme.secondary);
      document.documentElement.style.setProperty('--color-accent', theme.accent);
      // Sidebar : derive du theme primary (pas plus l'hardcode vert).
      document.documentElement.style.setProperty('--color-sidebar-bg', palette[900]);
      document.documentElement.style.setProperty('--color-sidebar-hover', palette[800]);
      document.documentElement.style.setProperty('--color-sidebar-active', palette[700]);
      document.documentElement.style.setProperty('--color-sidebar-muted', palette[200]);
      document.title = meta.name || 'TransitSoftServices';
    }
    return;
  }

  // 3) Fallback legacy : palette derivee de meta.primaryColor (avant
  //    introduction des themes nommes). Conserve la compat ascendante.
  const primary = generatePalette(meta.primaryColor);
  applyPaletteToDocument(primary, 'color-primary');
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--color-secondary', meta.secondaryColor);
    document.documentElement.style.setProperty('--color-accent', meta.accentColor);

    // 3) Palette sidebar derivee de la primary (assure que la sidebar
    //    epouse les couleurs du tenant et non plus le vert hardcode).
    document.documentElement.style.setProperty('--color-sidebar-bg', primary[900]);
    document.documentElement.style.setProperty('--color-sidebar-hover', primary[800]);
    document.documentElement.style.setProperty('--color-sidebar-active', primary[700]);
    document.documentElement.style.setProperty('--color-sidebar-muted', primary[200]);

    // 4) Police effective : applique au body pour qu'elle se voie dans le
    //    dashboard, pas seulement sur le site public.
    const fontBody = meta.skinCustomization?.fontBody;
    const fontHeading = meta.skinCustomization?.fontHeading;
    if (fontBody) {
      document.documentElement.style.setProperty('--font-body', fontBody);
      document.body.style.fontFamily = fontBody;
    }
    if (fontHeading) {
      document.documentElement.style.setProperty('--font-heading', fontHeading);
    }

    // 5) Titre document : remplace "TransitSoftServices" hardcode du layout
    //    par le nom reel du tenant. Avant : tous les tenants affichaient
    //    "TransitSoftServices" dans l'onglet du navigateur.
    if (meta.name) {
      document.title = meta.name;
    }
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

  // Bridge realtime : le composant `TenantMetaSocketSync` (monte sous le
  // SocketProvider dans (dashboard)/layout.tsx) appelle window.dispatchEvent
  // d'un CustomEvent 'tenant:meta:updated' a chaque broadcast socket. On
  // ecoute ici pour refetch + reapplyer le theme sans reload.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onUpdated = () => {
      fetchTenantMeta().then((m) => {
        setMeta(m);
        applyTheme(m);
      });
    };
    window.addEventListener('tenant:meta:updated', onUpdated);
    return () => window.removeEventListener('tenant:meta:updated', onUpdated);
  }, []);

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
