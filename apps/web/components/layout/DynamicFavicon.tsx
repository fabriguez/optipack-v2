'use client';

import { useEffect } from 'react';
import { useTenantMeta } from '@/lib/providers/TenantProvider';

/**
 * Met a jour le favicon du document avec le logo du tenant. A monter haut
 * dans l'arbre (root layout), sous TenantProvider. Re-run au refresh meta
 * (apres changement skin/logo dans ops-admin -> TenantProvider refetch ->
 * meta.logoUrl change -> ce composant met a jour le favicon en direct).
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
