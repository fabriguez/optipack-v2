'use client';

import { motion } from 'framer-motion';
import { Package, Smartphone, CreditCard } from 'lucide-react';

/**
 * Features pour skin Minimal (pastel / B2C niche). 3 features seulement,
 * centrees, beaucoup d'espace. Pas de description longue -- titre + une
 * phrase. Less is more.
 */
const FEATURES = [
  { Icon: Package, title: 'Envoyer', text: 'Un formulaire, 3 champs. C\'est tout.' },
  { Icon: Smartphone, title: 'Suivre', text: 'Notifications au bon moment.' },
  { Icon: CreditCard, title: 'Payer', text: 'Mobile money. Carte. Cash.' },
];

export function FeaturesMinimalIcons() {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 text-center sm:grid-cols-3">
          {FEATURES.map(({ Icon, title, text }, idx) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              className="flex flex-col items-center"
            >
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full"
                style={{
                  background: 'color-mix(in oklab, var(--skin-primary) 12%, transparent)',
                  color: 'var(--skin-primary)',
                }}
              >
                <Icon className="h-6 w-6" strokeWidth={1.5} />
              </div>
              <h3
                className="mt-6 text-lg font-light tracking-tight skin-font-heading"
                style={{ color: 'var(--skin-foreground)' }}
              >
                {title}
              </h3>
              <p
                className="mt-2 text-sm"
                style={{ color: 'var(--skin-foreground-muted)' }}
              >
                {text}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
