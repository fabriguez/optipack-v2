'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

export function CTA() {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative overflow-hidden p-10 sm:p-16 skin-radius-xl skin-shadow skin-gradient-hero"
        >
          <span
            className="skin-blob"
            style={{
              top: '-40%',
              right: '-10%',
              width: 400,
              height: 400,
              background: 'rgba(255,255,255,0.25)',
            }}
          />
          <div className="relative max-w-2xl text-white">
            <span className="text-xs font-bold uppercase tracking-[0.2em] opacity-80">
              Pret a embarquer ?
            </span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl skin-font-heading">
              Un essai de 14 jours.
              <br />
              Sans carte. Sans engagement.
            </h2>
            <p className="mt-4 text-base text-white/85">
              Configurez votre premier envoi en moins de 3 minutes. Vous gardez
              tout votre historique meme si vous arretez.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 bg-white px-6 py-3 text-sm font-semibold skin-radius transition-transform hover:-translate-y-0.5"
                style={{ color: 'var(--skin-primary)' }}
              >
                Demarrer maintenant
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="mailto:contact@transitsoftservices.com"
                className="inline-flex items-center gap-2 border border-white/40 bg-white/10 px-6 py-3 text-sm font-semibold text-white skin-radius backdrop-blur hover:bg-white/20 transition-colors"
              >
                Parler a un humain
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
