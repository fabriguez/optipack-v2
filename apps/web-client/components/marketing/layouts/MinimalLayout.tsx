import { HeroMinimalCalm } from '@/components/marketing/heroes/HeroMinimalCalm';
import { Features } from '@/components/marketing/Features';
import { CTA } from '@/components/marketing/CTA';

/**
 * Layout "Minimal" : 3 sections, beaucoup d'espace. Hero centre+rond+1CTA,
 * Features compactes, CTA discret. Pas de pricing/stats/journey. Convient
 * skin "pastel" niche B2C.
 */
export function MinimalLayout() {
  return (
    <div className="space-y-0">
      <HeroMinimalCalm />
      <div className="py-16 sm:py-24" style={{ background: 'var(--skin-background)' }}>
        <Features />
      </div>
      <div className="py-16 sm:py-24">
        <CTA />
      </div>
    </div>
  );
}
