import { HeroMagazineFullBleed } from '@/components/marketing/heroes/HeroMagazineFullBleed';
import { ParcelJourney } from '@/components/marketing/ParcelJourney';
import { Features } from '@/components/marketing/Features';
import { Stats } from '@/components/marketing/Stats';
import { Pricing } from '@/components/marketing/Pricing';
import { CTA } from '@/components/marketing/CTA';

/**
 * Layout "Magazine" : storytelling visuel. Hero image fullbleed + Stats
 * inline pour ancrer le trust + Journey scroll-driven + Features alternees
 * + Pricing + CTA. Convient skin "sunset" B2C grand public.
 */
export function MagazineLayout() {
  const divider = (
    <div
      aria-hidden
      className="h-2 w-full"
      style={{
        background: `linear-gradient(90deg, transparent, color-mix(in oklab, var(--skin-accent) 40%, transparent), transparent)`,
      }}
    />
  );
  return (
    <div className="space-y-0">
      <HeroMagazineFullBleed />
      <Stats />
      {divider}
      <ParcelJourney />
      {divider}
      <Features />
      <Pricing />
      <CTA />
    </div>
  );
}
