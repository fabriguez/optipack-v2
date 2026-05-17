'use client';

import { useSkin } from '@/lib/providers/SkinProvider';
import { HOME_LAYOUTS, DEFAULT_HOME_LAYOUT } from '@/components/marketing/layouts';
import type { LayoutVariant } from '@transitsoftservices/skins';

/**
 * Page d'accueil du portail public. Le layout (composition + ordre des
 * sections) depend du `layoutVariant` du skin actif :
 *   - forest    -> ClassicLayout    (logistique mainstream)
 *   - sapphire  -> BoldLayout       (corporate B2B)
 *   - sunset    -> MagazineLayout   (B2C grand public, storytelling)
 *   - midnight  -> EditorialLayout  (dark premium asymetrique)
 *   - pastel    -> MinimalLayout    (B2C niche, less-is-more)
 *
 * Changer de skin dans le Studio change la disposition complete + les
 * couleurs/typo via les CSS vars `--skin-*` (gere par SkinProvider).
 */
export default function HomePage() {
  const { resolved } = useSkin();
  const variant = ((resolved as { layoutVariant?: LayoutVariant } | undefined)?.layoutVariant ??
    'classic') as LayoutVariant;
  const Layout = HOME_LAYOUTS[variant] ?? DEFAULT_HOME_LAYOUT;
  return <Layout />;
}
