'use client';

import { useEffect } from 'react';
import { useTenantMeta } from '@/lib/providers/TenantMetaProvider';

/**
 * Met a jour le favicon du portail public avec le logo du tenant. Re-run
 * automatiquement quand le tenant change (apres ops update -> refetch via
 * focus/visibility/polling dans TenantMetaProvider).
 */
export function DynamicFavicon() {
  const { meta } = useTenantMeta();
  const logo = meta?.logoUrl ?? null;
  const name = (meta as any)?.name ?? null;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!logo) return;
    const head = document.head;
    head.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach((n) => n.remove());
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = logo;
    head.appendChild(link);
  }, [logo]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (name) document.title = name;
  }, [name]);

  return null;
}
