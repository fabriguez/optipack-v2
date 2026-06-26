'use client';

import Link from 'next/link';
import { useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Menu, X, ArrowRight } from 'lucide-react';
import { useTenantMeta } from '@/lib/providers/TenantMetaProvider';
import { BrandLogo } from '@/components/marketing/BrandLogo';

/**
 * Nav Magazine (sunset) : floating pill au-dessus du hero. Quand on scroll,
 * la pill se contracte + s'ancre top. Type serif, accent rond, gradient
 * background subtle.
 */
const LINKS = [
  { href: '#features', label: 'Histoire' },
  { href: '/track', label: 'Suivre' },
  { href: '#pricing', label: 'Tarifs' },
];

export function NavMagazineFloating() {
  const { meta } = useTenantMeta();
  const [open, setOpen] = useState(false);
  const orgName = meta?.name?.trim() || 'TransitSoftServices';
  const { scrollY } = useScroll();
  const w = useTransform(scrollY, [0, 200], ['min(96%,1100px)', 'min(80%,860px)']);
  const t = useTransform(scrollY, [0, 200], [12, 6]);
  return (
    <motion.header
      style={{ width: w, top: t }}
      className="fixed left-1/2 z-50 -translate-x-1/2"
    >
      <motion.nav
        className="flex items-center justify-between gap-4 px-5 py-2.5"
        style={{
          background: 'color-mix(in oklab, var(--skin-surface) 85%, transparent)',
          backdropFilter: 'blur(20px)',
          border: '1px solid color-mix(in oklab, var(--skin-primary) 12%, transparent)',
          borderRadius: 9999,
          boxShadow: '0 10px 40px -10px rgba(0,0,0,0.15)',
        }}
      >
        <Link href="/" className="flex items-center gap-2">
          {meta?.logoUrl?.trim() ? (
            // Logo present : il porte la marque (pas de nom redondant a cote).
            <BrandLogo className="h-9 w-auto max-w-[180px] object-contain" />
          ) : (
            <>
              <span
                className="h-7 w-7 rounded-full"
                style={{
                  background: `linear-gradient(135deg, var(--skin-gradient-1), var(--skin-gradient-3))`,
                }}
                aria-hidden
              />
              <span className="text-sm font-bold tracking-tight skin-font-heading" style={{ color: 'var(--skin-foreground)' }}>
                {orgName}
              </span>
            </>
          )}
        </Link>
        <ul className="hidden items-center gap-6 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="text-xs font-medium" style={{ color: 'var(--skin-foreground-muted)' }}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <Link
          href="/register"
          className="hidden items-center gap-1.5 px-4 py-1.5 text-xs font-semibold md:inline-flex"
          style={{
            background: 'var(--skin-primary)',
            color: 'white',
            borderRadius: 9999,
          }}
        >
          Commencer <ArrowRight className="h-3 w-3" />
        </Link>
        <button type="button" onClick={() => setOpen((v) => !v)} className="md:hidden" style={{ color: 'var(--skin-foreground)' }}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </motion.nav>
    </motion.header>
  );
}
