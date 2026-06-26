'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useTenantMeta } from '@/lib/providers/TenantMetaProvider';
import { BrandLogo } from '@/components/marketing/BrandLogo';

/**
 * Nav Editorial (midnight) : barre verticale fixe a gauche (desktop),
 * type rotation 90deg, numerotation comme un ours editorial. Dark.
 * Burger en haut a droite sur mobile.
 */
const LINKS = [
  { href: '/', n: '01', label: 'Sommaire' },
  { href: '/about', n: '02', label: 'Manifeste' },
  { href: '/track', n: '03', label: 'Suivi' },
  { href: '/team', n: '04', label: 'Auteurs' },
  { href: '/legal', n: '05', label: 'Colophon' },
];

export function NavEditorialVertical() {
  const { meta } = useTenantMeta();
  const [open, setOpen] = useState(false);
  const orgName = meta?.name?.trim() || 'TransitSoftServices';
  return (
    <>
      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b px-4 lg:hidden"
        style={{ background: 'var(--skin-background)', borderColor: 'var(--skin-border)' }}>
        <Link href="/" className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.3em]" style={{ color: 'var(--skin-foreground)' }}>
          <BrandLogo className="h-9 w-auto max-w-[160px] object-contain" />
          {!meta?.logoUrl?.trim() && orgName}
        </Link>
        <button onClick={() => setOpen((v) => !v)} aria-label="Menu" style={{ color: 'var(--skin-foreground)' }}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>
      {open && (
        <div className="fixed inset-x-0 top-14 z-40 border-b lg:hidden"
          style={{ background: 'var(--skin-background)', borderColor: 'var(--skin-border)' }}>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-6 py-4 text-sm"
              style={{ color: 'var(--skin-foreground)' }}>
              <span style={{ color: 'var(--skin-primary)' }}>{l.n}</span>
              <span>{l.label}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Desktop vertical rail */}
      <aside className="fixed left-0 top-0 z-50 hidden h-screen w-20 flex-col justify-between border-r py-8 lg:flex"
        style={{ background: 'var(--skin-background)', borderColor: 'var(--skin-border)' }}>
        <Link href="/" className="block text-center text-[10px] font-black uppercase tracking-[0.5em]"
          style={{ color: 'var(--skin-foreground)', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
          {orgName}
        </Link>
        <nav className="flex flex-col items-center gap-6">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} title={l.label}
              className="text-[10px] font-bold transition-colors"
              style={{ color: 'var(--skin-foreground-muted)' }}>
              <span className="block" style={{ color: 'var(--skin-primary)' }}>{l.n}</span>
            </Link>
          ))}
        </nav>
        <div className="text-center text-[9px] opacity-60" style={{ color: 'var(--skin-foreground-muted)', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
          Vol. {new Date().getFullYear()}
        </div>
      </aside>
    </>
  );
}
