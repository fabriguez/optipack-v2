'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, Star } from 'lucide-react';
import { HeroParcel } from './HeroParcel';
import { useSkin } from '@/lib/providers/SkinProvider';

export function Hero() {
  const { resolved } = useSkin();
  const avatars = resolved.images.testimonialAvatars ?? [];
  return (
    <section className="relative overflow-hidden pt-32 pb-24 sm:pt-40 sm:pb-32">
      {/* Background blobs */}
      <span
        className="skin-blob"
        style={{
          top: '-10%',
          left: '-5%',
          width: 380,
          height: 380,
          background: 'var(--skin-hero-2)',
        }}
      />
      <span
        className="skin-blob"
        style={{
          top: '20%',
          right: '-8%',
          width: 420,
          height: 420,
          background: 'var(--skin-hero-3)',
          animationDelay: '4s',
        }}
      />
      <div className="absolute inset-0 grid-bg" aria-hidden />

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div>
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold tracking-wide skin-radius-sm skin-card"
            style={{ color: 'var(--skin-primary)' }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Nouvelle generation - 2026
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl skin-font-heading"
            style={{ color: 'var(--skin-foreground)' }}
          >
            Vos colis,{' '}
            <span className="skin-gradient-text">en direct</span>
            <br />
            de l'enlevement a la livraison.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="mt-6 max-w-xl text-lg"
            style={{ color: 'var(--skin-muted)' }}
          >
            Declarez vos envois, suivez chaque etape en temps reel, et recevez
            une notification au moment ou votre colis change de main. Tout est
            visible. Tout est trace.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold skin-btn-primary"
            >
              Creer mon compte
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="#journey"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold skin-btn-ghost"
            >
              Voir la vie d'un colis
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-10 flex items-center gap-4"
          >
            <div className="flex -space-x-3">
              {avatars.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="h-9 w-9 rounded-full border-2 object-cover"
                  style={{ borderColor: 'var(--skin-surface)' }}
                />
              ))}
            </div>
            <div>
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className="h-3.5 w-3.5 fill-current"
                    style={{ color: 'var(--skin-primary)' }}
                  />
                ))}
              </div>
              <p className="text-xs" style={{ color: 'var(--skin-muted)' }}>
                4.9 / 5 - plus de 12 000 clients
              </p>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="flex justify-center lg:justify-end"
        >
          <HeroParcel />
        </motion.div>
      </div>
    </section>
  );
}
