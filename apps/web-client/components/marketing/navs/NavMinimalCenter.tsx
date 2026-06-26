'use client';

import Link from 'next/link';
import { useTenantMeta } from '@/lib/providers/TenantMetaProvider';
import { BrandLogo } from '@/components/marketing/BrandLogo';

/**
 * Nav Minimal (pastel) : nom centre, 3 liens espaces a gauche/droite,
 * pas de bg, pas de fixed scroll. Discret au max.
 */
const LEFT = [{ href: '/about', label: 'A propos' }];
const RIGHT = [
  { href: '/track', label: 'Suivre' },
  { href: '/login', label: 'Connexion' },
];

export function NavMinimalCenter() {
  const { meta } = useTenantMeta();
  const orgName = meta?.name?.trim() || 'TransitSoftServices';
  return (
    <header className="border-b py-6" style={{ borderColor: 'color-mix(in oklab, var(--skin-border) 50%, transparent)' }}>
      <nav className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <ul className="flex flex-1 gap-6">
          {LEFT.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="text-xs font-light" style={{ color: 'var(--skin-foreground-muted)' }}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/" className="flex items-center gap-2 text-sm font-light tracking-[0.2em] skin-font-heading" style={{ color: 'var(--skin-foreground)' }}>
          <BrandLogo className="h-9 w-auto max-w-[160px] object-contain" />
          {!meta?.logoUrl?.trim() && orgName.toUpperCase()}
        </Link>
        <ul className="flex flex-1 justify-end gap-6">
          {RIGHT.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="text-xs font-light" style={{ color: 'var(--skin-foreground-muted)' }}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
