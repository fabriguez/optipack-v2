'use client';

import { motion } from 'framer-motion';

/**
 * Features pour skin Editorial (midnight / premium dark). Liste verticale
 * numerotee, type geant. Pas d'icones, pas de cards. Juste de la
 * typographie qui parle. Inspiration : magazine d'art / publication.
 */
const CHAPTERS = [
  {
    n: '01',
    title: 'Le tracking devient narration.',
    text: "Chaque colis ecrit son histoire. Vous la lisez page apres page, de l'expedition a la livraison.",
  },
  {
    n: '02',
    title: 'La carte comme metaphore.',
    text: "Pas un simple point GPS. Un voyage dessine, des routes qui se croisent, des escales qui marquent.",
  },
  {
    n: '03',
    title: 'L\'attention au detail.',
    text: 'Photos en haute resolution. Documents douaniers archives. Timing precis. La rigueur d\'un editeur.',
  },
  {
    n: '04',
    title: 'Le silence quand il faut.',
    text: 'Pas de notification inutile. Pas de bruit. Juste les moments qui valent d\'etre annonces.',
  },
];

export function FeaturesEditorialList() {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <p
          className="mb-16 text-[11px] uppercase tracking-[0.4em]"
          style={{ color: 'var(--skin-primary)' }}
        >
          Chapitre 02 · La methode
        </p>
        <div className="space-y-16">
          {CHAPTERS.map((c, idx) => (
            <motion.article
              key={c.n}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.5, delay: idx * 0.05 }}
              className="grid items-baseline gap-6 lg:grid-cols-12"
            >
              <span
                className="text-6xl font-black tracking-tighter lg:col-span-2 lg:text-7xl"
                style={{ color: 'var(--skin-primary)', fontFamily: 'serif' }}
              >
                {c.n}
              </span>
              <div className="lg:col-span-10 lg:pl-8">
                <h3
                  className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl skin-font-heading"
                  style={{ color: 'var(--skin-foreground)' }}
                >
                  {c.title}
                </h3>
                <p
                  className="mt-3 max-w-2xl text-base leading-relaxed"
                  style={{ color: 'var(--skin-foreground-muted)' }}
                >
                  {c.text}
                </p>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
