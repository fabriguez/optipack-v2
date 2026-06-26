'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useTenantMeta } from '@/lib/providers/TenantMetaProvider';
import { BrandLogo } from '@/components/marketing/BrandLogo';

/**
 * Nav Bold corporate (sapphire) : barre top fixe, fond foreground sombre,
 * type sans-serif strict, border-radius 0, divider verticaux entre links,
 * un seul CTA pill carré "Contact sales".
 */
const LINKS = [
  { href: '/about', label: 'Solution' },
  { href: '/api-docs', label: 'API' },
  { href: '/docs', label: 'Documentation' },
  { href: '/team', label: 'Equipe' },
];

export function NavBoldCorporate() {
  const { meta } = useTenantMeta();
  const [open, setOpen] = useState(false);
  const orgName = meta?.name?.trim() || 'TransitSoftServices';
  return (
    <header
      className="sticky top-0 z-50"
      style={{ background: 'var(--skin-foreground)', color: 'var(--skin-surface)' }}
    >
      <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em]" style={{ color: 'var(--skin-surface)' }}>
          <BrandLogo className="h-9 w-auto max-w-[160px] object-contain" />
          {!meta?.logoUrl?.trim() && orgName}
        </Link>
        <ul className="hidden items-center md:flex">
          {LINKS.map((l, i) => (
            <li key={l.href} className="flex items-center">
              <Link href={l.href} className="px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] opacity-80 transition-opacity hover:opacity-100">
                {l.label}
              </Link>
              {i < LINKS.length - 1 && <span className="h-3 w-px opacity-30" style={{ background: 'currentColor' }} />}
            </li>
          ))}
        </ul>
        <div className="hidden items-center gap-2 md:flex">
          <Link href="/login" className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] opacity-80 hover:opacity-100">
            Login
          </Link>
          <Link
            href="/register"
            className="px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ background: 'var(--skin-primary)', color: 'white' }}
          >
            Contact sales
          </Link>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="md:hidden" aria-label="Menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>
      {open && (
        <div className="border-t md:hidden" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="block px-4 py-3 text-xs uppercase tracking-[0.2em] opacity-80">
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
