'use client';

import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Package, ArrowRight, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useTenantMeta } from '@/lib/providers/TenantMetaProvider';
import { BrandLogo } from '@/components/marketing/BrandLogo';

const LINKS = [
  { href: '/#journey', label: 'Le voyage' },
  { href: '/#features', label: 'Fonctionnalites' },
  { href: '/agencies', label: 'Agences' },
  { href: '/simulateur', label: 'Simulateur' },
  { href: '/track', label: 'Suivi' },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const { meta } = useTenantMeta();
  const orgName = meta?.name?.trim() || 'TransitSoftServices';
  const { scrollY } = useScroll();
  const bg = useTransform(
    scrollY,
    [0, 80],
    ['rgba(255,255,255,0)', 'color-mix(in oklab, var(--skin-surface) 82%, transparent)'],
  );
  const borderOpacity = useTransform(scrollY, [0, 80], [0, 1]);
  const blur = useTransform(scrollY, [0, 80], ['blur(0px)', 'blur(16px)']);

  return (
    <motion.header
      style={{ background: bg, backdropFilter: blur }}
      className="fixed inset-x-0 top-0 z-50"
    >
      <motion.div
        style={{ opacity: borderOpacity }}
        className="absolute inset-x-0 bottom-0 h-px"
        aria-hidden
      >
        <div className="h-full w-full" style={{ background: 'var(--skin-border)' }} />
      </motion.div>
      <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          {meta?.logoUrl?.trim() ? (
            // Logo present : il porte la marque a lui seul (pas de texte redondant).
            <BrandLogo className="h-10 w-auto max-w-[180px] object-contain" />
          ) : (
            <>
              <div
                className="flex h-9 w-9 items-center justify-center skin-radius"
                style={{ background: 'var(--skin-primary)' }}
              >
                <Package className="h-5 w-5 text-white" />
              </div>
              <span
                className="text-lg font-bold tracking-tight skin-font-heading"
                style={{ color: 'var(--skin-foreground)' }}
              >
                {orgName}
              </span>
            </>
          )}
        </Link>

        <ul className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="text-sm font-medium transition-opacity hover:opacity-70"
                style={{ color: 'var(--skin-foreground)' }}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden px-4 py-2 text-sm font-medium md:inline-flex skin-btn-ghost"
          >
            Se connecter
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold skin-btn-primary"
          >
            Commencer
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="ml-1 inline-flex p-2 md:hidden skin-btn-ghost"
            aria-label="Menu"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>
      {open && (
        <div
          className="md:hidden border-t px-4 py-3 space-y-2"
          style={{ background: 'var(--skin-surface)', borderColor: 'var(--skin-border)' }}
        >
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block py-2 text-sm font-medium"
              style={{ color: 'var(--skin-foreground)' }}
            >
              {l.label}
            </a>
          ))}
          <Link href="/login" className="block py-2 text-sm font-medium">
            Se connecter
          </Link>
        </div>
      )}
    </motion.header>
  );
}
