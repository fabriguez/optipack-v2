'use client';

import Link from 'next/link';
import { useTenantMeta } from '@/lib/providers/TenantMetaProvider';

/**
 * Footer Bold (sapphire) : dark complet, grille 4 colonnes structurée,
 * tagline minimale, mentions legales en bas.
 */
const COLS = [
  { title: 'Plateforme', links: ['Features', 'Pricing', 'API', 'Docs'] },
  { title: 'Entreprise', links: ['A propos', 'Equipe', 'Carrieres', 'Presse'] },
  { title: 'Ressources', links: ['Blog', 'Support', 'Status', 'Securite'] },
  { title: 'Legal', links: ['CGV', 'Confidentialite', 'Cookies', 'Mentions'] },
];

export function FooterBoldDark() {
  const { meta } = useTenantMeta();
  const orgName = meta?.name?.trim() || 'TransitSoftServices';
  const year = new Date().getFullYear();
  return (
    <footer style={{ background: 'var(--skin-foreground)', color: 'var(--skin-surface)' }}>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <div className="text-sm font-black uppercase tracking-[0.2em]">{orgName}</div>
            <p className="mt-4 text-xs opacity-60">Solutions transit entreprise.</p>
          </div>
          {COLS.map((c) => (
            <div key={c.title}>
              <h4 className="text-[10px] font-bold uppercase tracking-[0.25em] opacity-60">{c.title}</h4>
              <ul className="mt-4 space-y-2">
                {c.links.map((l) => (
                  <li key={l}>
                    <Link href="#" className="text-xs opacity-80 hover:opacity-100">{l}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex items-center justify-between border-t pt-6 text-[11px] opacity-60" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          <span>(c) {year} {orgName}</span>
          <span>
            Powered by{' '}
            <a href="https://transitsoftservices.com" target="_blank" rel="noopener noreferrer" className="underline font-semibold" style={{ color: 'var(--skin-primary)' }}>
              transitsoftservices.com
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
