import type { ReactNode } from 'react';
import { MarketingShell } from '@/components/marketing/shells/MarketingShell';

/**
 * Layout marketing : delegue Nav + Footer + ambient bg au MarketingShell
 * qui dispatche selon le `layoutVariant` du skin. Le skin est dicte par le
 * tenant (Studio admin) -- le visiteur n'a plus de picker (un seul skin
 * cohérent par tenant).
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>;
}
