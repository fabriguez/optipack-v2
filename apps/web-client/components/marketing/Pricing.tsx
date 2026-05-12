'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check, Sparkles } from 'lucide-react';

const PLANS = [
  {
    name: 'Particulier',
    price: 'Gratuit',
    body: "Envoyez et suivez vos colis personnels sans frais d'abonnement.",
    features: [
      'Suivi temps reel illimite',
      'Notifications SMS + email',
      'Historique 12 mois',
      'Support standard',
    ],
    cta: 'Creer un compte',
    href: '/register',
    featured: false,
  },
  {
    name: 'Pro',
    price: '15 000',
    suffix: '/mois',
    body: 'Pour les boutiques en ligne et les expediteurs reguliers.',
    features: [
      'Tout du plan Particulier',
      "Declarations groupees + import CSV",
      'API & webhooks',
      'Etiquettes personnalisees',
      'Support prioritaire',
    ],
    cta: 'Demarrer 14j gratuits',
    href: '/register?plan=pro',
    featured: true,
  },
  {
    name: 'Entreprise',
    price: 'Sur devis',
    body: 'Volume eleve, integrations avancees, SLA dedie.',
    features: [
      'Tout du plan Pro',
      'SSO + provisioning SCIM',
      'Gestionnaire de compte dedie',
      'Hebergement region',
      'SLA 99.99%',
    ],
    cta: 'Nous contacter',
    href: 'mailto:contact@transitsoftservices.com',
    featured: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-2xl text-center"
        >
          <span
            className="text-xs font-bold uppercase tracking-[0.2em]"
            style={{ color: 'var(--skin-primary)' }}
          >
            Tarification
          </span>
          <h2
            className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl skin-font-heading"
            style={{ color: 'var(--skin-foreground)' }}
          >
            Un plan{' '}
            <span className="skin-gradient-text">pour chaque etape.</span>
          </h2>
          <p className="mt-4 text-base" style={{ color: 'var(--skin-muted)' }}>
            Pas de frais caches. Annulez n'importe quand.
          </p>
        </motion.div>

        <div className="mt-14 grid items-stretch gap-6 lg:grid-cols-3">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="relative flex flex-col p-7 skin-card"
              style={
                plan.featured
                  ? {
                      borderColor: 'var(--skin-primary)',
                      boxShadow:
                        '0 30px 70px -30px var(--skin-glow), 0 0 0 1px var(--skin-primary)',
                    }
                  : undefined
              }
            >
              {plan.featured && (
                <span
                  className="absolute -top-3 right-6 inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] skin-radius-sm"
                  style={{ background: 'var(--skin-primary)', color: '#fff' }}
                >
                  <Sparkles className="h-3 w-3" />
                  Recommande
                </span>
              )}
              <h3
                className="text-sm font-bold uppercase tracking-widest skin-font-heading"
                style={{ color: 'var(--skin-primary)' }}
              >
                {plan.name}
              </h3>
              <div
                className="mt-4 text-4xl font-extrabold tracking-tight skin-font-heading"
                style={{ color: 'var(--skin-foreground)' }}
              >
                {plan.price}
                {plan.suffix && (
                  <span
                    className="ml-1 text-base font-medium"
                    style={{ color: 'var(--skin-muted)' }}
                  >
                    {plan.suffix}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm" style={{ color: 'var(--skin-muted)' }}>
                {plan.body}
              </p>
              <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm"
                    style={{ color: 'var(--skin-foreground)' }}
                  >
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0"
                      style={{ color: 'var(--skin-primary)' }}
                    />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={
                  'mt-7 inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold ' +
                  (plan.featured ? 'skin-btn-primary' : 'skin-btn-ghost')
                }
              >
                {plan.cta}
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
