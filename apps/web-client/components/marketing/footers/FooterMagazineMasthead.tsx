'use client';

import Link from 'next/link';
import { useTenantMeta } from '@/lib/providers/TenantMetaProvider';

/**
 * Footer Magazine (sunset) : grand titre de masthead a la une, comme la
 * derniere page d'un magazine. Type serif geant, separateur fluide en haut.
 */
export function FooterMagazineMasthead() {
  const { meta } = useTenantMeta();
  const orgName = meta?.name?.trim() || 'TransitSoftServices';
  const year = new Date().getFullYear();
  return (
    <footer className="relative overflow-hidden pt-24 pb-12">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1"
        style={{
          background: `linear-gradient(90deg, var(--skin-gradient-1), var(--skin-gradient-2), var(--skin-gradient-3))`,
        }}
      />
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <p className="text-[11px] uppercase tracking-[0.4em]" style={{ color: 'var(--skin-primary)' }}>
          A bientot
        </p>
        <h2
          className="mt-3 text-7xl font-bold leading-none tracking-tighter sm:text-8xl lg:text-[10rem] skin-font-heading"
          style={{ color: 'var(--skin-foreground)' }}
        >
          {orgName}.
        </h2>
        <div className="mt-12 flex flex-wrap items-end justify-between gap-6 text-sm" style={{ color: 'var(--skin-foreground-muted)' }}>
          <div className="flex flex-wrap gap-6">
            <Link href="/track" className="hover:underline">Suivre un colis</Link>
            <Link href="/about" className="hover:underline">A propos</Link>
            <Link href="/cgv" className="hover:underline">CGV</Link>
            <Link href="/privacy" className="hover:underline">Confidentialite</Link>
          </div>
          <div className="text-xs">
            (c) {year} - Powered by{' '}
            <a href="https://transitsoftservices.com" target="_blank" rel="noopener noreferrer" className="font-semibold underline" style={{ color: 'var(--skin-primary)' }}>
              transitsoftservices.com
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
