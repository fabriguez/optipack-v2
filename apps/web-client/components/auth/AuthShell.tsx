'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Package } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSkin } from '@/lib/providers/SkinProvider';

/**
 * Split-screen auth layout : storytelling image on one side, form on the other.
 * The image defaults to the active skin's `authShell` slot (per-skin), but can
 * be overridden per page.
 */
export function AuthShell({
  children,
  side = 'right',
  imageSrc,
  badge,
  title,
  subtitle,
}: {
  children: ReactNode;
  side?: 'left' | 'right';
  imageSrc?: string;
  badge?: string;
  title: string;
  subtitle: string;
}) {
  const { resolved } = useSkin();
  const formFirst = side === 'left';
  const finalImage = imageSrc ?? resolved.images.authShell;
  return (
    <div className="relative grid min-h-screen lg:grid-cols-2">
      <motion.aside
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className={
          'relative hidden overflow-hidden lg:block ' +
          (formFirst ? 'lg:order-2' : '')
        }
      >
        <img
          src={finalImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in oklab, var(--skin-hero-1) 78%, transparent), color-mix(in oklab, var(--skin-hero-2) 35%, transparent))',
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Link href="/" className="flex items-center gap-2 w-fit">
            <div
              className="flex h-9 w-9 items-center justify-center skin-radius bg-white/15 backdrop-blur"
            >
              <Package className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight skin-font-heading">
              OptiPack
            </span>
          </Link>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/70">
              Suivi en temps reel
            </p>
            <h2 className="mt-3 text-4xl font-bold leading-tight skin-font-heading">
              Chaque colis, chaque etape.<br />Sans appel, sans stress.
            </h2>
            <p className="mt-4 max-w-md text-white/80">
              Plus de 12 000 clients suivent leurs envois quotidiennement avec
              OptiPack. Rejoignez-les en 2 minutes.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-white/70">
            <span>"L'app la plus claire que j'ai vue en logistique."</span>
            <span>- Lucie M., Pro</span>
          </div>
        </div>
      </motion.aside>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className={'flex items-center justify-center px-6 py-12 ' + (formFirst ? 'lg:order-1' : '')}
      >
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="flex items-center gap-2 lg:hidden"
          >
            <div
              className="flex h-8 w-8 items-center justify-center skin-radius"
              style={{ background: 'var(--skin-primary)' }}
            >
              <Package className="h-4 w-4 text-white" />
            </div>
            <span
              className="text-base font-bold tracking-tight skin-font-heading"
              style={{ color: 'var(--skin-foreground)' }}
            >
              OptiPack
            </span>
          </Link>

          {badge && (
            <span
              className="mt-8 inline-block text-xs font-bold uppercase tracking-[0.2em]"
              style={{ color: 'var(--skin-primary)' }}
            >
              {badge}
            </span>
          )}
          <h1
            className="mt-2 text-3xl font-bold tracking-tight skin-font-heading"
            style={{ color: 'var(--skin-foreground)' }}
          >
            {title}
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--skin-muted)' }}>
            {subtitle}
          </p>

          <div className="mt-8">{children}</div>
        </div>
      </motion.section>
    </div>
  );
}
