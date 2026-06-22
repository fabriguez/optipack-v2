import { useEffect } from 'react';
import { useTenantMeta } from '@/lib/providers/TenantProvider';

export function DynamicFavicon() {
  const { meta } = useTenantMeta();
  const logo = meta?.logoUrl ?? null;
  const name = meta?.name ?? null;

  useEffect(() => {
    if (!logo) return;
    document.head
      .querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')
      .forEach((n) => n.remove());
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = logo;
    document.head.appendChild(link);
  }, [logo]);

  useEffect(() => {
    if (name) document.title = name;
  }, [name]);

  return null;
}
