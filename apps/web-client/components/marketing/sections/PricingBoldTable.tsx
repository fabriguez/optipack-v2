'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';

/**
 * Pricing pour skin Bold (sapphire / B2B). Table comparative dense :
 * 3 colonnes (Starter / Pro / Enterprise) x N lignes feature. Format
 * spreadsheet, pas cards. Convient acheteurs qui veulent comparer.
 */
const TIERS = [
  { id: 'starter', name: 'Starter', price: '50k', period: '/mois', highlight: false },
  { id: 'pro', name: 'Pro', price: '180k', period: '/mois', highlight: true },
  { id: 'enterprise', name: 'Enterprise', price: 'Sur devis', period: '', highlight: false },
];

const ROWS = [
  { feature: 'Colis / mois', values: ['500', '5 000', 'Illimite'] },
  { feature: 'Utilisateurs', values: ['3', '20', 'Illimite'] },
  { feature: 'Agences', values: ['1', '10', 'Illimite'] },
  { feature: 'API + webhooks', values: [false, true, true] },
  { feature: 'White-label app mobile', values: [false, false, true] },
  { feature: 'SLA 99.99%', values: [false, false, true] },
  { feature: 'Account manager dedie', values: [false, false, true] },
  { feature: 'Support', values: ['Email', '24/5 chat', '24/7 hotline'] },
];

export function PricingBoldTable() {
  return (
    <section className="py-20 sm:py-28" id="pricing">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-2xl">
          <p
            className="text-[11px] font-bold uppercase tracking-[0.25em]"
            style={{ color: 'var(--skin-primary)' }}
          >
            Pricing
          </p>
          <h2
            className="mt-3 text-4xl font-black tracking-tight"
            style={{ color: 'var(--skin-foreground)' }}
          >
            Trois plans. Aucune surprise.
          </h2>
        </div>
        <div className="overflow-x-auto border" style={{ borderColor: 'var(--skin-border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'color-mix(in oklab, var(--skin-primary) 5%, var(--skin-surface))' }}>
                <th className="w-1/3 px-6 py-5 text-left text-[11px] uppercase tracking-wider" style={{ color: 'var(--skin-foreground-muted)' }}>
                  Fonctionnalite
                </th>
                {TIERS.map((t) => (
                  <th
                    key={t.id}
                    className="px-6 py-5 text-center"
                    style={t.highlight ? { background: 'var(--skin-primary)', color: 'white' } : {}}
                  >
                    <div className="text-base font-bold" style={t.highlight ? { color: 'white' } : { color: 'var(--skin-foreground)' }}>
                      {t.name}
                    </div>
                    <div className="mt-1 text-2xl font-black">
                      {t.price}
                      <span className="text-xs font-normal opacity-70">{t.period}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, idx) => (
                <tr key={r.feature} style={{ background: idx % 2 ? 'var(--skin-surface)' : 'color-mix(in oklab, var(--skin-primary) 2%, var(--skin-surface))' }}>
                  <td className="px-6 py-4 font-medium" style={{ color: 'var(--skin-foreground)' }}>
                    {r.feature}
                  </td>
                  {r.values.map((v, i) => (
                    <td
                      key={i}
                      className="px-6 py-4 text-center"
                      style={i === 1 ? { background: 'color-mix(in oklab, var(--skin-primary) 5%, transparent)' } : {}}
                    >
                      {v === true ? (
                        <Check className="mx-auto h-5 w-5" style={{ color: 'var(--skin-primary)' }} />
                      ) : v === false ? (
                        <span style={{ color: 'var(--skin-border)' }}>—</span>
                      ) : (
                        <span style={{ color: 'var(--skin-foreground)' }}>{v}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td />
                {TIERS.map((t) => (
                  <td key={t.id} className="px-6 py-6 text-center" style={t.highlight ? { background: 'color-mix(in oklab, var(--skin-primary) 5%, transparent)' } : {}}>
                    <Link
                      href="/register"
                      className="inline-flex items-center px-4 py-2 text-xs font-semibold"
                      style={
                        t.highlight
                          ? { background: 'var(--skin-primary)', color: 'white' }
                          : { border: '1px solid var(--skin-border)', color: 'var(--skin-foreground)' }
                      }
                    >
                      {t.id === 'enterprise' ? 'Contact sales' : 'Choisir'}
                    </Link>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
