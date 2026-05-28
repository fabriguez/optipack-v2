import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import Constants from 'expo-constants';
import { apiClient } from '@/lib/api/client';
import { storage } from '@/lib/storage/storage';
import { colors as defaultColors } from '@/lib/theme/colors';

/**
 * Branding tenant dynamique. Trois sources :
 *
 *  1. `slug` build-time (EXPO_PUBLIC_TENANT_SLUG + app.config.ts) :
 *     determine nom + bundleId + scheme dans le binaire pour l'App Store.
 *  2. `slug` runtime saisi par l'utilisateur au premier lancement
 *     (fallback quand l'app generique est utilisee).
 *  3. Metadonnees serveur (logo, nom, couleurs) fetchees au demarrage :
 *     permet au tenant de changer son logo sans rebuild ni nouvelle release.
 */

export interface TenantMeta {
  slug: string;
  name: string;
  logoUrl?: string;
  primaryColor?: string;
  primaryColorDark?: string;
  websiteUrl?: string;
}

interface TenantContextValue {
  meta: TenantMeta | null;
  slug: string | null;
  setSlug: (slug: string) => Promise<void>;
  primary: string;
  loading: boolean;
}

const TenantContext = createContext<TenantContextValue | null>(null);

const SLUG_KEY = 'tenant.slug';

function getBuildSlug(): string | null {
  const extra = (Constants.expoConfig?.extra ?? {}) as { tenantSlug?: string };
  if (extra.tenantSlug && extra.tenantSlug !== 'default') return extra.tenantSlug;
  return null;
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [slug, setSlugState] = useState<string | null>(getBuildSlug());
  const [meta, setMeta] = useState<TenantMeta | null>(null);
  const [loading, setLoading] = useState(true);

  const setSlug = async (next: string) => {
    await storage.set(SLUG_KEY, next);
    setSlugState(next);
  };

  // Charge le slug stocke (cas app generique sans build-time slug).
  useEffect(() => {
    if (slug) return;
    storage.get<string>(SLUG_KEY).then((stored) => {
      if (stored) setSlugState(stored);
    });
  }, [slug]);

  // Fetch branding serveur quand slug connu.
  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }
    setLoading(true);
    apiClient
      .get('/tenant-meta/public', { headers: { 'X-Tenant': slug } })
      .then((r) => {
        const data = r.data?.data as TenantMeta | undefined;
        if (data) setMeta({ ...data, slug });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  const primary = meta?.primaryColor ?? defaultColors.primary[500];

  const value = useMemo<TenantContextValue>(
    () => ({ meta, slug, setSlug, primary, loading }),
    [meta, slug, primary, loading],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used inside TenantProvider');
  return ctx;
}
