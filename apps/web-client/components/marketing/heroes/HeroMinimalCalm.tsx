'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useSkin } from '@/lib/providers/SkinProvider';

/**
 * Hero "Minimal Calm" pour skin Pastel (B2C niche, less-is-more). Tout
 * centre, beaucoup de blanc, un seul CTA. Pas d'image, pas de stats.
 * Approche meditation : on lit, on respire, on clique (ou pas).
 */
export function HeroMinimalCalm() {
  const { resolved } = useSkin();
  return (
    <section
      className="relative flex min-h-[75vh] items-center justify-center px-4 py-24 sm:px-6 sm:py-32 lg:px-8"
      style={{ background: 'var(--skin-background)' }}
    >
      <div className="mx-auto w-full max-w-3xl text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="mx-auto h-12 w-12"
          style={{
            background: 'var(--skin-primary)',
            borderRadius: '50%',
            boxShadow: `0 0 60px color-mix(in oklab, var(--skin-primary) 40%, transparent)`,
          }}
          aria-hidden
        />

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="mt-10 text-4xl font-light leading-tight tracking-tight sm:text-5xl lg:text-6xl"
          style={{
            color: 'var(--skin-foreground)',
            fontFamily: resolved.fontHeading,
            letterSpacing: '-0.02em',
          }}
        >
          Envoyer un colis,
          <br />
          <span style={{ fontStyle: 'italic', color: 'var(--skin-primary)' }}>
            en toute simplicite.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="mx-auto mt-8 max-w-xl text-base leading-relaxed"
          style={{ color: 'var(--skin-foreground-muted)' }}
        >
          Pas de jargon. Pas de menus interminables. Juste l&apos;essentiel,
          pour que vos colis arrivent.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.55 }}
          className="mt-12"
        >
          <Link
            href="/register"
            className="inline-flex items-center justify-center px-8 py-3 text-sm font-medium transition-all"
            style={{
              background: 'var(--skin-primary)',
              color: 'var(--skin-on-primary, white)',
              borderRadius: 9999,
            }}
          >
            Commencer
          </Link>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          className="mt-6 text-xs"
          style={{ color: 'var(--skin-foreground-muted)' }}
        >
          Gratuit. Sans engagement.
        </motion.p>
      </div>
    </section>
  );
}
