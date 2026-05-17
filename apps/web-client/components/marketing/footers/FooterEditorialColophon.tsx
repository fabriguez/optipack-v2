'use client';

import Link from 'next/link';
import { useTenantMeta } from '@/lib/providers/TenantMetaProvider';

/**
 * Footer Editorial (midnight) : colophon comme une publication. Marges
 * larges, type asymetrique, mentions sans hierarchie marketing.
 */
export function FooterEditorialColophon() {
  const { meta } = useTenantMeta();
  const orgName = meta?.name?.trim() || 'TransitSoftServices';
  const year = new Date().getFullYear();
  return (
    <footer className="border-t" style={{ borderColor: 'var(--skin-border)' }}>
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="text-[11px] uppercase tracking-[0.4em]" style={{ color: 'var(--skin-primary)' }}>
              Colophon
            </p>
            <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--skin-foreground-muted)' }}>
              {orgName} -- Publication n°{year}. Composee dans la fonte du systeme.
              Distribuee a {year}. Tous droits reserves.
            </p>
          </div>
          <div className="lg:col-span-3">
            <h4 className="text-[11px] uppercase tracking-[0.3em]" style={{ color: 'var(--skin-foreground)' }}>
              Rubriques
            </h4>
            <ul className="mt-4 space-y-1.5 text-sm" style={{ color: 'var(--skin-foreground-muted)' }}>
              <li><Link href="/about" className="hover:underline">Manifeste</Link></li>
              <li><Link href="/track" className="hover:underline">Suivi</Link></li>
              <li><Link href="/team" className="hover:underline">Auteurs</Link></li>
              <li><Link href="/blog" className="hover:underline">Archives</Link></li>
            </ul>
          </div>
          <div className="lg:col-span-4">
            <h4 className="text-[11px] uppercase tracking-[0.3em]" style={{ color: 'var(--skin-foreground)' }}>
              Mentions
            </h4>
            <ul className="mt-4 space-y-1.5 text-sm" style={{ color: 'var(--skin-foreground-muted)' }}>
              <li><Link href="/cgv" className="hover:underline">Conditions generales</Link></li>
              <li><Link href="/privacy" className="hover:underline">Vie privee</Link></li>
              <li><Link href="/legal" className="hover:underline">Mentions legales</Link></li>
            </ul>
            <p className="mt-8 text-[11px]" style={{ color: 'var(--skin-foreground-muted)' }}>
              Edite et hebergeé par{' '}
              <a href="https://transitsoftservices.com" target="_blank" rel="noopener noreferrer" className="underline font-semibold" style={{ color: 'var(--skin-primary)' }}>
                transitsoftservices.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
