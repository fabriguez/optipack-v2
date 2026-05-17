'use client';

import Link from 'next/link';
import { useTenantMeta } from '@/lib/providers/TenantMetaProvider';

/**
 * Footer Minimal (pastel) : une seule ligne centree. Pas de liens
 * marketing, juste le mention legale + powered-by.
 */
export function FooterMinimalLine() {
  const { meta } = useTenantMeta();
  const orgName = meta?.name?.trim() || 'TransitSoftServices';
  const year = new Date().getFullYear();
  return (
    <footer className="border-t py-12 text-center" style={{ borderColor: 'color-mix(in oklab, var(--skin-border) 40%, transparent)' }}>
      <p className="text-xs font-light" style={{ color: 'var(--skin-foreground-muted)' }}>
        {orgName} (c) {year} ·{' '}
        <Link href="/cgv" className="hover:underline">CGV</Link>
        {' · '}
        <Link href="/privacy" className="hover:underline">Confidentialite</Link>
        {' · '}
        Powered by{' '}
        <a href="https://transitsoftservices.com" target="_blank" rel="noopener noreferrer" className="font-semibold" style={{ color: 'var(--skin-primary)' }}>
          transitsoftservices.com
        </a>
      </p>
    </footer>
  );
}
