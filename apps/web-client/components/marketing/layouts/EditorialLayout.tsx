import { HeroEditorialTypographic } from '@/components/marketing/heroes/HeroEditorialTypographic';
import { Features } from '@/components/marketing/Features';
import { ParcelJourney } from '@/components/marketing/ParcelJourney';
import { CTA } from '@/components/marketing/CTA';

/**
 * Layout "Editorial" : dark premium asymetrique. Hero typographique geant
 * (pas d'image) + Features sur fond surface + Journey sur background +
 * CTA en gradient. Convient skin "midnight" (dark editorial).
 */
export function EditorialLayout() {
  return (
    <div className="space-y-0">
      <HeroEditorialTypographic />
      <section style={{ background: 'var(--skin-surface)' }}>
        <Features />
      </section>
      <section style={{ background: 'var(--skin-background)' }}>
        <ParcelJourney />
      </section>
      <section
        style={{
          background: `linear-gradient(135deg, var(--skin-gradient-2), var(--skin-gradient-3))`,
        }}
      >
        <CTA />
      </section>
    </div>
  );
}
