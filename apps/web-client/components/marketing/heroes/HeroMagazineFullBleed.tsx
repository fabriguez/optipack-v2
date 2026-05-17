'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Search } from 'lucide-react';
import { useSkin } from '@/lib/providers/SkinProvider';

/**
 * Hero "Magazine FullBleed" pour skin Sunset (B2C grand public). Image
 * fullscreen avec overlay degrade + titre serif + tracker integre.
 * Format edito : photo plein cadre, message court, action immediate.
 */
export function HeroMagazineFullBleed() {
  const { resolved } = useSkin();
  const heroImg = resolved.images.hero ?? resolved.images.preview ?? '';
  return (
    <section className="relative h-[80vh] min-h-[600px] w-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={heroImg}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        loading="eager"
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, color-mix(in oklab, var(--skin-gradient-1) 90%, transparent) 0%, color-mix(in oklab, var(--skin-gradient-2) 70%, transparent) 60%, transparent 100%)`,
        }}
      />

      <div className="relative mx-auto flex h-full w-full max-w-7xl flex-col justify-end px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8 lg:pb-24">
        <motion.span
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-block self-start px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.25em]"
          style={{
            background: 'rgba(255,255,255,0.95)',
            color: 'var(--skin-primary)',
            borderRadius: 999,
          }}
        >
          Edition speciale
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="mt-6 max-w-4xl text-5xl font-bold leading-[1.05] tracking-tight text-white sm:text-7xl lg:text-8xl"
          style={{ fontFamily: resolved.fontHeading, textShadow: '0 4px 30px rgba(0,0,0,0.3)' }}
        >
          Votre colis fait
          <br />
          le tour du monde.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-6 max-w-2xl text-lg leading-relaxed text-white/90"
        >
          Suivez chaque etape en direct. Du depart a la livraison, en photos,
          en cartes, en notifications instantanees.
        </motion.p>

        {/* Tracker integre — pas un bouton mais un input pret a coller */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45 }}
          action="/track"
          className="mt-8 flex max-w-xl items-stretch overflow-hidden shadow-xl"
          style={{ borderRadius: 9999, background: 'white' }}
        >
          <div className="flex items-center pl-5 pr-2 text-gray-400">
            <Search className="h-5 w-5" />
          </div>
          <input
            name="q"
            type="text"
            placeholder="Numero de suivi (ex: TR-2026-...)"
            className="flex-1 bg-transparent px-2 py-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
          <button
            type="submit"
            className="m-1.5 flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white"
            style={{
              background: 'var(--skin-primary)',
              borderRadius: 9999,
            }}
          >
            Suivre
            <ArrowRight className="h-4 w-4" />
          </button>
        </motion.form>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-6 flex items-center gap-4 text-xs text-white/80"
        >
          <Link href="/register" className="underline-offset-4 hover:underline">
            Pas encore inscrit ? Creer un compte
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
