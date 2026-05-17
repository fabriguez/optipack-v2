'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, ShieldCheck, BarChart3, Zap } from 'lucide-react';
import { useSkin } from '@/lib/providers/SkinProvider';

/**
 * Hero "Bold Split" pour skin Sapphire (corporate B2B). Layout split 60/40 :
 *  - gauche : titre serif imposant + 3 metrics en colonne + 2 CTA
 *  - droite : card sombre stat avec graphique stylise
 * Pas de blobs decoratifs, pas d'avatars : ton corporate strict.
 */
export function HeroBoldSplit() {
  const { resolved } = useSkin();
  return (
    <section
      className="relative pt-28 pb-20 sm:pt-36 sm:pb-28"
      style={{ background: 'var(--skin-background)' }}
    >
      <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-5 lg:gap-12 lg:px-8">
        <div className="lg:col-span-3">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{
              color: 'var(--skin-primary)',
              border: `1px solid color-mix(in oklab, var(--skin-primary) 30%, transparent)`,
            }}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Solution B2B certifiee
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-6 text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl"
            style={{
              color: 'var(--skin-foreground)',
              fontFamily: resolved.fontHeading,
            }}
          >
            Operations de transit a l&apos;echelle entreprise.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mt-6 max-w-xl text-base leading-relaxed"
            style={{ color: 'var(--skin-foreground-muted)' }}
          >
            SLA garantis, visibilite multi-agences, integration ERP. Conformite
            douaniere et tracabilite chaine logistique pour groupes 50+ pays.
          </motion.p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold transition-colors skin-btn-primary"
              style={{ borderRadius: 4 }}
            >
              Demander une demo
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/track"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold transition-colors skin-btn-ghost"
              style={{ borderRadius: 4 }}
            >
              Documentation API
            </Link>
          </div>

          <dl className="mt-10 grid grid-cols-3 gap-6 border-t pt-6" style={{ borderColor: 'var(--skin-border)' }}>
            {[
              { k: '99.99%', v: 'SLA dispo' },
              { k: '<2h', v: 'Onboarding' },
              { k: '50+', v: 'Pays couverts' },
            ].map((m) => (
              <div key={m.k}>
                <dt className="text-2xl font-bold" style={{ color: 'var(--skin-primary)' }}>{m.k}</dt>
                <dd className="text-xs uppercase tracking-wider" style={{ color: 'var(--skin-foreground-muted)' }}>
                  {m.v}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <motion.aside
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="lg:col-span-2"
        >
          <div
            className="overflow-hidden p-6"
            style={{
              background: 'var(--skin-foreground)',
              color: 'var(--skin-surface)',
              borderRadius: 4,
              boxShadow: '0 20px 60px -20px rgba(0,0,0,0.4)',
            }}
          >
            <div className="flex items-center justify-between text-xs uppercase tracking-wider opacity-70">
              <span>Trafic temps reel</span>
              <BarChart3 className="h-4 w-4" />
            </div>
            <p className="mt-4 text-5xl font-black tracking-tight">12 482</p>
            <p className="mt-1 text-xs opacity-70">colis en transit ce mois</p>
            <div className="mt-6 flex items-end gap-1.5">
              {[40, 55, 35, 70, 45, 80, 60, 90, 75, 95, 70, 100].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{
                    height: `${h}%`,
                    minHeight: 8,
                    background: i === 11 ? 'var(--skin-primary)' : 'rgba(255,255,255,0.2)',
                  }}
                />
              ))}
            </div>
            <div className="mt-6 flex items-center gap-2 text-xs">
              <Zap className="h-3.5 w-3.5" style={{ color: 'var(--skin-primary)' }} />
              <span className="opacity-80">+34% vs mois dernier</span>
            </div>
          </div>
        </motion.aside>
      </div>
    </section>
  );
}
