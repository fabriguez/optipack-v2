import { HeroBoldSplit } from '@/components/marketing/heroes/HeroBoldSplit';
import { Features } from '@/components/marketing/Features';
import { Pricing } from '@/components/marketing/Pricing';
import { CTA } from '@/components/marketing/CTA';

/**
 * Layout "Bold" : corporate / B2B. Hero split avec stats card + features
 * sur fond accent + pricing en avant + CTA gradient. Pas de storytelling
 * (Journey, Stats) -- on va droit a la decision. Convient skin "sapphire".
 */
export function BoldLayout() {
  return (
    <div className="space-y-0">
      <HeroBoldSplit />
      <div
        className="border-y"
        style={{
          background: 'color-mix(in oklab, var(--skin-primary) 4%, var(--skin-surface))',
          borderColor: 'var(--skin-border)',
        }}
      >
        <Features />
      </div>
      <Pricing />
      <div className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `linear-gradient(120deg, var(--skin-gradient-1), var(--skin-gradient-2), var(--skin-gradient-3))`,
            opacity: 0.95,
          }}
        />
        <div className="relative">
          <CTA />
        </div>
      </div>
    </div>
  );
}
