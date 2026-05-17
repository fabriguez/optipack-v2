import { Hero } from '@/components/marketing/Hero';
import { ParcelJourney } from '@/components/marketing/ParcelJourney';
import { Features } from '@/components/marketing/Features';
import { Stats } from '@/components/marketing/Stats';
import { Pricing } from '@/components/marketing/Pricing';
import { CTA } from '@/components/marketing/CTA';

/**
 * Layout "Classic" : composition originale, equilibree.
 * Skin par defaut "forest". Convient logistique B2C / B2B mainstream.
 *
 * Ordre : Hero centre -> Parcel journey -> Features grid -> Stats -> Pricing
 * cards -> CTA. Sections separees par scroll-padding standard.
 */
export function ClassicLayout() {
  return (
    <>
      <Hero />
      <ParcelJourney />
      <Features />
      <Stats />
      <Pricing />
      <CTA />
    </>
  );
}
