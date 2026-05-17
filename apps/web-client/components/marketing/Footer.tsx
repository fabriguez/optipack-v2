'use client';

import Link from 'next/link';
import { Package } from 'lucide-react';
import { useTenantMeta } from '@/lib/providers/TenantMetaProvider';

const SECTIONS = [
  {
    title: 'Produit',
    links: [
      { label: 'Fonctionnalites', href: '#features' },
      { label: 'Tarifs', href: '#pricing' },
      { label: 'Suivre un colis', href: '/track' },
      { label: 'Status', href: '/status' },
    ],
  },
  {
    title: 'Entreprise',
    links: [
      { label: 'A propos', href: '/about' },
      { label: 'Equipe', href: '/team' },
      { label: 'Carrieres', href: '/careers' },
      { label: 'Presse', href: '/press' },
    ],
  },
  {
    title: 'Ressources',
    links: [
      { label: 'Blog', href: '/blog' },
      { label: 'Documentation', href: '/docs' },
      { label: 'API', href: '/api-docs' },
      { label: 'Support', href: '/support' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'CGV', href: '/cgv' },
      { label: 'Confidentialite', href: '/privacy' },
      { label: 'Cookies', href: '/cookies' },
      { label: 'Mentions legales', href: '/legal' },
    ],
  },
];

export function Footer() {
  const { meta } = useTenantMeta();
  const orgName = meta?.name?.trim() || 'TransitSoftServices';
  const year = new Date().getFullYear();
  return (
    <footer
      className="relative mt-10 border-t pt-16 pb-10"
      style={{ borderColor: 'var(--skin-border)' }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2">
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
            </Link>
            <p
              className="mt-4 max-w-sm text-sm"
              style={{ color: 'var(--skin-muted)' }}
            >
              La nouvelle facon de suivre vos envois en Afrique. Construit avec
              des transitaires, pour des transitaires.
            </p>
          </div>

          {SECTIONS.map((s) => (
            <div key={s.title}>
              <h4
                className="text-xs font-bold uppercase tracking-[0.2em]"
                style={{ color: 'var(--skin-foreground)' }}
              >
                {s.title}
              </h4>
              <ul className="mt-4 space-y-2">
                {s.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm transition-colors hover:underline"
                      style={{ color: 'var(--skin-muted)' }}
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className="mt-12 flex flex-col items-center justify-between gap-4 border-t pt-6 sm:flex-row"
          style={{ borderColor: 'var(--skin-border)' }}
        >
          <p className="text-xs" style={{ color: 'var(--skin-muted)' }}>
            (c) {year} {orgName}. Tous droits reserves.
          </p>
          <p className="text-xs" style={{ color: 'var(--skin-muted)' }}>
            Powered by{' '}
            <a
              href="https://transitsoftservices.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline-offset-2 hover:underline"
              style={{ color: 'var(--skin-primary)' }}
            >
              transitsoftservices.com
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
