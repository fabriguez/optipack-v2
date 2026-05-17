'use client';

import { motion } from 'framer-motion';
import { ShieldCheck, BarChart3, Globe2, Zap, Lock, Headphones } from 'lucide-react';

/**
 * Features pour skin Bold (sapphire / corporate B2B).
 * Grille 3x2 stricte, cards angulaires (radius 4px), icones outline,
 * fond gris-bleu doux. Aucune decoration superflue. SLA + securite mis
 * en avant comme valeurs prioritaires.
 */
const ITEMS = [
  { Icon: ShieldCheck, title: 'SLA 99.99%', text: 'Disponibilite garantie par contrat. Compensation si breach.' },
  { Icon: BarChart3, title: 'Reporting executif', text: 'Tableaux de bord consolidates par filiale, region, route.' },
  { Icon: Globe2, title: 'Multi-pays', text: '50+ juridictions douanieres. Compliance integree.' },
  { Icon: Zap, title: 'API entreprise', text: 'REST + webhooks. Integration ERP en 2 sprints.' },
  { Icon: Lock, title: 'SOC2 ready', text: 'Audit trail complet. Chiffrement at-rest + in-transit.' },
  { Icon: Headphones, title: 'Support 24/7', text: 'Hotline dediee + account manager nomme.' },
];

export function FeaturesBoldGrid() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-2xl">
          <p
            className="text-[11px] font-bold uppercase tracking-[0.25em]"
            style={{ color: 'var(--skin-primary)' }}
          >
            Capabilities
          </p>
          <h2
            className="mt-3 text-4xl font-black tracking-tight"
            style={{ color: 'var(--skin-foreground)' }}
          >
            Ce que vous obtenez.
          </h2>
        </div>
        <div className="grid gap-px overflow-hidden border" style={{ background: 'var(--skin-border)', borderColor: 'var(--skin-border)' }}>
          <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-3" style={{ background: 'var(--skin-border)' }}>
            {ITEMS.map(({ Icon, title, text }, idx) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
                className="p-8"
                style={{ background: 'var(--skin-surface)' }}
              >
                <Icon className="h-6 w-6" style={{ color: 'var(--skin-primary)' }} strokeWidth={1.5} />
                <h3 className="mt-4 text-base font-bold" style={{ color: 'var(--skin-foreground)' }}>
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--skin-foreground-muted)' }}>
                  {text}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
