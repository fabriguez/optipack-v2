import { Hero } from '@/components/marketing/Hero';
import { ParcelJourney } from '@/components/marketing/ParcelJourney';
import { Features } from '@/components/marketing/Features';
import { Stats } from '@/components/marketing/Stats';
import { Pricing } from '@/components/marketing/Pricing';
import { CTA } from '@/components/marketing/CTA';

export default function HomePage() {
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
