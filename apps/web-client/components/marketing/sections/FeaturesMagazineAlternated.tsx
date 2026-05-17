'use client';

import { motion } from 'framer-motion';
import { Camera, MapPin, Bell, Star } from 'lucide-react';

/**
 * Features pour skin Magazine (sunset / B2C grand public). Alternance
 * image-texte façon magazine. Cards larges, espace genereux, type serif.
 * Storytelling visuel, parle des emotions.
 */
const STORIES = [
  {
    Icon: Camera,
    eyebrow: 'TEMOIN VISUEL',
    title: 'Chaque etape en photo.',
    text: "Vos colis prennent la pose a chaque manipulation. Vous voyez ce qu'on voit -- pas un texte sec.",
    bg: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=1200&q=70',
  },
  {
    Icon: MapPin,
    eyebrow: 'GEOLOCALISATION',
    title: 'En direct, sur la carte.',
    text: 'Position des conteneurs en temps reel. Plus de "je sais pas ou ils en sont" -- juste un point qui avance.',
    bg: 'https://images.unsplash.com/photo-1530631673369-bc20fdb32288?auto=format&fit=crop&w=1200&q=70',
  },
  {
    Icon: Bell,
    eyebrow: 'NOTIFICATIONS INTELLIGENTES',
    title: 'Le bon message au bon moment.',
    text: 'Pas de spam. Juste les etapes qui comptent : depart, arrivee, mise a disposition.',
    bg: 'https://images.unsplash.com/photo-1611224923853-80b023f02d71?auto=format&fit=crop&w=1200&q=70',
  },
  {
    Icon: Star,
    eyebrow: 'FIDELITE',
    title: 'Recompense a chaque envoi.',
    text: 'Points cumulables, paliers, reductions. Vous expediez, vous gagnez.',
    bg: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1200&q=70',
  },
];

export function FeaturesMagazineAlternated() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="space-y-20">
          {STORIES.map(({ Icon, eyebrow, title, text, bg }, idx) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5 }}
              className={`grid gap-8 items-center lg:gap-12 lg:grid-cols-2 ${idx % 2 ? 'lg:[&>*:first-child]:order-2' : ''}`}
            >
              <div className="relative aspect-[4/3] overflow-hidden skin-radius">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bg} alt="" className="h-full w-full object-cover" loading="lazy" />
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(160deg, transparent 40%, color-mix(in oklab, var(--skin-primary) 70%, transparent))`,
                  }}
                  aria-hidden
                />
                <Icon
                  className="absolute bottom-4 left-4 h-8 w-8 text-white"
                  strokeWidth={1.5}
                />
              </div>
              <div>
                <p
                  className="text-[11px] font-bold uppercase tracking-[0.3em]"
                  style={{ color: 'var(--skin-primary)' }}
                >
                  {eyebrow}
                </p>
                <h3
                  className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl skin-font-heading"
                  style={{ color: 'var(--skin-foreground)' }}
                >
                  {title}
                </h3>
                <p
                  className="mt-4 text-base leading-relaxed"
                  style={{ color: 'var(--skin-foreground-muted)' }}
                >
                  {text}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
