import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import Constants from 'expo-constants';
import { apiClient } from '@/lib/api/client';
import { storage } from '@/lib/storage/storage';
import { colors as defaultColors } from '@/lib/theme/colors';

export interface TenantMeta {
  slug: string;
  name: string;
  logoUrl?: string;
  primaryColor?: string;
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

  useEffect(() => {
    if (slug) return;
    storage.get<string>(SLUG_KEY).then((stored) => {
      if (stored) setSlugState(stored);
    });
  }, [slug]);

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
