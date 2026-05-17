'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  ShieldCheck,
  Layers,
  Sparkles,
  Globe,
  Zap,
  Package,
} from 'lucide-react';

/**
 * Section affichee UNIQUEMENT sur le site du tenant principal
 * (transitsoftservices.com). Invite les transitaires visiteurs a creer
 * leur propre tenant : plateforme white-label avec leur branding, leur
 * domaine, leur stack docker isolee.
 *
 * Screenshots du dashboard utilises comme proof (renommes au prealable
 * dans public/preview-*.png).
 */
const BENEFITS = [
  {
    icon: Globe,
    title: 'Votre marque, votre domaine',
    text: "Logo, couleurs, polices, layout du site. Aucune mention TransitSoftServices visible pour vos clients.",
  },
  {
    icon: ShieldCheck,
    title: 'Stack isolee, donnees a vous',
    text: 'Postgres + Redis + MinIO dedies par tenant. Aucune fuite cross-tenant.',
  },
  {
    icon: Layers,
    title: 'Modules a la carte',
    text: 'Activez seulement ce qui sert : colis, paiements, comptabilite, fidelite, RH.',
  },
  {
    icon: Zap,
    title: 'Provisionning en 2 minutes',
    text: 'Du formulaire de creation a votre site en ligne. Pas de devops a faire.',
  },
  {
    icon: Sparkles,
    title: 'Mises a jour gerees',
    text: "Nouvelles versions deployees automatiquement (ou en mode manuel). Vous decidez.",
  },
  {
    icon: Package,
    title: 'API + app mobile inclus',
    text: 'API REST complete + app mobile/tablette en mode shared ou white-label.',
  },
];

const SCREENSHOTS = [
  { src: '/preview-dashboard.png', alt: 'Dashboard de gestion transit avec metriques temps reel' },
  { src: '/preview-parcels.png', alt: 'Liste des colis avec recherche + filtres avances' },
  { src: '/preview-tracking.png', alt: 'Suivi public d\'un colis avec timeline' },
  { src: '/preview-mobile.png', alt: 'App mobile branding tenant' },
];

export function SaaSInvitation() {
  return (
    <section
      className="relative overflow-hidden border-t py-20 sm:py-28"
      style={{
        borderColor: 'var(--skin-border)',
        background: `linear-gradient(180deg, var(--skin-background), color-mix(in oklab, var(--skin-primary) 6%, var(--skin-background)))`,
      }}
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-3xl text-center"
        >
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.25em]"
            style={{
              color: 'var(--skin-primary)',
              background: 'color-mix(in oklab, var(--skin-primary) 10%, transparent)',
              borderRadius: 999,
            }}
          >
            <Sparkles className="h-3 w-3" />
            Plateforme SaaS
          </span>
          <h2
            className="mt-6 text-4xl font-bold leading-tight tracking-tight sm:text-5xl skin-font-heading"
            style={{ color: 'var(--skin-foreground)' }}
          >
            Lancez votre propre societe de transit
            <br />
            <span style={{ color: 'var(--skin-primary)' }}>en moins de 5 minutes.</span>
          </h2>
          <p
            className="mx-auto mt-4 max-w-2xl text-base leading-relaxed"
            style={{ color: 'var(--skin-foreground-muted)' }}
          >
            TransitSoftServices fournit l&apos;infrastructure complete pour
            operer un service de transit aerien, maritime et terrestre.
            Branding personnalise, donnees isolees, modules a la carte.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="mailto:contact@transitsoftservices.com?subject=Demande%20d%27ouverture%20de%20tenant"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold transition-colors skin-btn-primary"
            >
              Demander un tenant
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="https://transitsoftservices.com"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold transition-colors skin-btn-ghost"
            >
              En savoir plus
            </a>
          </div>
        </motion.div>

        {/* Screenshots aperçu */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {SCREENSHOTS.map((s, idx) => (
            <motion.div
              key={s.src}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: idx * 0.08 }}
              className="overflow-hidden rounded-2xl border shadow-sm transition-transform hover:scale-[1.02]"
              style={{
                borderColor: 'var(--skin-border)',
                background: 'var(--skin-surface)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.src}
                alt={s.alt}
                className="aspect-[16/10] w-full object-cover"
                loading="lazy"
              />
              <p
                className="px-3 py-2 text-[11px] line-clamp-2"
                style={{ color: 'var(--skin-foreground-muted)' }}
              >
                {s.alt}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Benefits grid */}
        <div className="mt-20 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b, idx) => {
            const Icon = b.icon;
            return (
              <motion.div
                key={b.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
                className="rounded-2xl border p-6"
                style={{
                  borderColor: 'var(--skin-border)',
                  background: 'var(--skin-surface)',
                }}
              >
                <div
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{
                    background: 'color-mix(in oklab, var(--skin-primary) 12%, transparent)',
                    color: 'var(--skin-primary)',
                  }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h3
                  className="mt-4 text-base font-semibold"
                  style={{ color: 'var(--skin-foreground)' }}
                >
                  {b.title}
                </h3>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: 'var(--skin-foreground-muted)' }}
                >
                  {b.text}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Closing CTA banner */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5 }}
          className="mt-20 overflow-hidden rounded-3xl p-10 text-center"
          style={{
            background: `linear-gradient(120deg, var(--skin-gradient-1), var(--skin-gradient-2), var(--skin-gradient-3))`,
            color: 'white',
          }}
        >
          <h3 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Pret a lancer votre service ?
          </h3>
          <p className="mx-auto mt-3 max-w-xl text-base opacity-90">
            Un seul email pour reserver votre slug + onboarding accompagne.
            Vous etes en ligne le jour meme.
          </p>
          <Link
            href="mailto:contact@transitsoftservices.com?subject=Reservation%20tenant"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-semibold shadow-lg"
            style={{ color: 'var(--skin-primary)' }}
          >
            Reserver mon tenant
            <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
