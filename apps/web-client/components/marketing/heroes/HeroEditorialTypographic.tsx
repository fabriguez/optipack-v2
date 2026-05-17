'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { useSkin } from '@/lib/providers/SkinProvider';

/**
 * Hero "Editorial Typographic" pour skin Midnight (dark premium). Type
 * geant, asymetrique, marge gauche genereuse. Pas d'image hero -- la
 * typographie EST le visuel. Approche art-direction magazine.
 */
export function HeroEditorialTypographic() {
  const { resolved } = useSkin();
  return (
    <section
      className="relative overflow-hidden pt-28 pb-24 sm:pt-40 sm:pb-32"
      style={{ background: 'var(--skin-background)' }}
    >
      {/* Mark vertical gauche (gimmick editorial) */}
      <div
        className="absolute left-4 top-32 hidden flex-col gap-3 text-[10px] uppercase tracking-[0.4em] sm:flex lg:left-8"
        style={{ color: 'var(--skin-foreground-muted)', writingMode: 'vertical-rl' }}
        aria-hidden
      >
        <span>VOL. 26</span>
        <span>·</span>
        <span>2026</span>
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="text-xs uppercase tracking-[0.4em]"
          style={{ color: 'var(--skin-primary)' }}
        >
          Chapitre 01 · Le transit reinvente
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="mt-8 text-6xl font-black leading-[0.85] tracking-tighter sm:text-8xl lg:text-[10rem]"
          style={{
            color: 'var(--skin-foreground)',
            fontFamily: resolved.fontHeading,
          }}
        >
          Le futur
          <br />
          <span style={{ color: 'var(--skin-primary)', fontStyle: 'italic' }}>
            arrive
          </span>
          <br />
          en colis.
        </motion.h1>

        <div className="mt-16 grid items-end gap-10 lg:grid-cols-12">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-base leading-relaxed lg:col-span-5 lg:col-start-7"
            style={{ color: 'var(--skin-foreground-muted)' }}
          >
            Une plateforme pensee pour les acteurs du commerce transcontinental.
            Chaque envoi raconte une histoire. Nous la suivons, page apres
            page, jusqu&apos;a son denouement.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="lg:col-span-5"
          >
            <Link
              href="/register"
              className="group inline-flex items-center gap-3 border-b pb-2 text-sm font-semibold uppercase tracking-[0.2em]"
              style={{
                color: 'var(--skin-foreground)',
                borderColor: 'var(--skin-primary)',
              }}
            >
              Lire le manifeste
              <ArrowUpRight
                className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                style={{ color: 'var(--skin-primary)' }}
              />
            </Link>
          </motion.div>
        </div>

        {/* Index editorial bas de section */}
        <div className="mt-20 grid grid-cols-2 gap-4 border-t pt-6 text-[11px] uppercase tracking-[0.2em] sm:grid-cols-4" style={{ borderColor: 'var(--skin-border)' }}>
          {['Suivi', 'Notifications', 'Documents', 'Facturation'].map((t, i) => (
            <div key={t} style={{ color: 'var(--skin-foreground-muted)' }}>
              <span style={{ color: 'var(--skin-primary)' }}>0{i + 1}.</span>{' '}
              {t}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
