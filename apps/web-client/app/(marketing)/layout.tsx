import type { ReactNode } from 'react';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { Footer } from '@/components/marketing/Footer';
import { SkinPicker } from '@/components/marketing/SkinPicker';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <MarketingNav />
      <main>{children}</main>
      <Footer />
      <SkinPicker />
    </div>
  );
}
