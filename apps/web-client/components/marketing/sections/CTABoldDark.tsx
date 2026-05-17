'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * CTA Bold (sapphire). Bloc sombre avec depth 3D : carte qui se penche
 * au scroll-into-view, lumiere directionnelle simulee.
 */
export function CTABoldDark() {
  return (
    <section className="py-24" style={{ background: 'var(--skin-foreground)' }}>
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8" style={{ perspective: 1200 }}>
        <motion.div
          initial={{ opacity: 0, rotateX: 12, y: 30 }}
          whileInView={{ opacity: 1, rotateX: 0, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="grid items-center gap-10 p-10 lg:grid-cols-[1.5fr_1fr]"
          style={{
            background: `linear-gradient(135deg, color-mix(in oklab, var(--skin-primary) 30%, transparent), transparent)`,
            border: `1px solid color-mix(in oklab, var(--skin-primary) 30%, transparent)`,
            transformStyle: 'preserve-3d',
            boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6)',
          }}
        >
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: 'var(--skin-primary)' }}>
              Demarrage rapide
            </p>
            <h3 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
              Onboardez votre equipe
              <br />
              <span style={{ color: 'var(--skin-primary)' }}>en moins de 2 heures.</span>
            </h3>
            <p className="mt-4 max-w-md text-base text-white/70">
              Demo personnalisee + setup compte + formation. Vous gerez votre 1er colis le jour meme.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Link
              href="/register"
              className="inline-flex items-center justify-between gap-3 px-6 py-4 text-sm font-bold"
              style={{ background: 'var(--skin-primary)', color: 'white', borderRadius: 2 }}
            >
              Reserver une demo <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/track"
              className="inline-flex items-center justify-between gap-3 px-6 py-4 text-sm font-bold"
              style={{ border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: 2 }}
            >
              Documentation API <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
