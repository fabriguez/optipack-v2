'use client';

import { useSkin } from '@/lib/providers/SkinProvider';
import { useTenantMeta } from '@/lib/providers/TenantMetaProvider';
import { HOME_LAYOUTS, DEFAULT_HOME_LAYOUT } from '@/components/marketing/layouts';
import { SaaSInvitation } from '@/components/marketing/SaaSInvitation';
import type { LayoutVariant } from '@transitsoftservices/skins';

/**
 * Page d'accueil du portail public. Le layout (composition + ordre des
 * sections) depend du `layoutVariant` du skin actif.
 *
 * Tenant principal (transitsoftservices.com) : ajoute en bas la section
 * SaaSInvitation qui pitch la plateforme aux transitaires visiteurs.
 */
export default function HomePage() {
  const { resolved } = useSkin();
  const { meta } = useTenantMeta();
  const variant = ((resolved as { layoutVariant?: LayoutVariant } | undefined)?.layoutVariant ??
    'classic') as LayoutVariant;
  const Layout = HOME_LAYOUTS[variant] ?? DEFAULT_HOME_LAYOUT;
  return (
    <>
      <Layout />
      {meta?.isMain && <SaaSInvitation />}
    </>
  );
}
