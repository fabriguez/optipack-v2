import type { ReactNode } from 'react';
import { MarketingShell } from '@/components/marketing/shells/MarketingShell';
import { SkinPicker } from '@/components/marketing/SkinPicker';

/**
 * Layout marketing : delegue Nav + Footer + ambient bg au MarketingShell
 * qui dispatche selon le `layoutVariant` du skin. Changement de skin =
 * changement complet du site (pas juste de la home).
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MarketingShell>{children}</MarketingShell>
      <SkinPicker />
    </>
  );
}
