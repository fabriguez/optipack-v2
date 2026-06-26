'use client';

import { useTenantMeta } from '@/lib/providers/TenantMetaProvider';

/**
 * Logo du tenant pour le site public. Affiche meta.logoUrl (URL publique servie
 * sans auth par l'API tenant) quand il existe, sinon ne rend rien -> chaque nav
 * garde son fallback (icone / nom). Plain <img> volontaire : l'URL est
 * cross-origin (api.<tenant>) et publique, pas besoin de next/image.
 */
export function BrandLogo({ className }: { className?: string }) {
  const { meta } = useTenantMeta();
  const logo = meta?.logoUrl?.trim() || null;
  if (!logo) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logo}
      alt={meta?.name?.trim() || 'logo'}
      className={className ?? 'h-8 w-auto object-contain'}
    />
  );
}
