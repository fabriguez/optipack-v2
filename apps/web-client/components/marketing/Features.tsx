'use client';

import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Bell,
  Globe2,
  Wallet,
  QrCode,
  Headphones,
} from 'lucide-react';

const FEATURES = [
  {
    Icon: Bell,
    title: 'Notifications en temps reel',
    body: "Chaque scan, chaque etape - SMS, email, push. Vous n'avez plus besoin d'appeler.",
  },
  {
    Icon: QrCode,
    title: 'QR code partout',
    body: 'Scannez votre colis depuis l\'agence ou la rue. Tout l\'historique en un instant.',
  },
  {
    Icon: ShieldCheck,
    title: 'Trace immuable',
    body: 'Chaque mouvement est signe et horodate. Litiges et reclamations ne sont plus un cauchemar.',
  },
  {
    Icon: Globe2,
    title: 'Multi-pays, multi-monnaie',
    body: 'Envoyez du Cameroun vers le Tchad, le Gabon ou la France - tarification et fiscalite gerees.',
  },
  {
    Icon: Wallet,
    title: 'Paiement flexible',
    body: 'Mobile money, virement, especes a la livraison ou compte client - on s\'adapte a vous.',
  },
  {
    Icon: Headphones,
    title: 'Support humain',
    body: 'Une vraie equipe sur Whatsapp et au telephone. Une reponse en moins de 5 minutes.',
  },
];

export function Features() {
  return (
    <section id="features" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-2xl"
        >
          <span
            className="text-xs font-bold uppercase tracking-[0.2em]"
            style={{ color: 'var(--skin-primary)' }}
          >
            Tout ce qu'il vous faut
          </span>
          <h2
            className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl skin-font-heading"
            style={{ color: 'var(--skin-foreground)' }}
          >
            Une plateforme qui pense{' '}
            <span className="skin-gradient-text">a votre place.</span>
          </h2>
          <p className="mt-4 text-base" style={{ color: 'var(--skin-muted)' }}>
            On a passe 18 mois sur le terrain avec des transitaires, des
            destinataires et des coursiers pour aboutir a cet outil.
          </p>
        </motion.div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ Icon, title, body }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              whileHover={{ y: -4 }}
              className="group relative overflow-hidden p-6 skin-card"
            >
              <div
                className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                style={{
                  background:
                    'radial-gradient(circle, var(--skin-glow), transparent 70%)',
                }}
              />
              <div
                className="inline-flex h-11 w-11 items-center justify-center skin-radius"
                style={{
                  background: 'color-mix(in oklab, var(--skin-primary) 12%, transparent)',
                  color: 'var(--skin-primary)',
                }}
              >
                <Icon className="h-5 w-5" />
              </div>
              <h3
                className="mt-4 text-lg font-semibold skin-font-heading"
                style={{ color: 'var(--skin-foreground)' }}
              >
                {title}
              </h3>
              <p className="mt-1.5 text-sm" style={{ color: 'var(--skin-muted)' }}>
                {body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
