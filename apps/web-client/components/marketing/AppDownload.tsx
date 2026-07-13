'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { Apple, Bell, CreditCard, MapPin, Play } from 'lucide-react';
import { useTenantMeta } from '@/lib/providers/TenantMetaProvider';

const FEATURES = [
  { icon: MapPin, label: 'Suivi en temps reel de vos colis, ou que vous soyez' },
  { icon: Bell, label: 'Notifications push a chaque etape de la livraison' },
  { icon: CreditCard, label: 'Paiement de vos factures directement depuis le mobile' },
];

/**
 * Section "application mobile" de la home. Skin-aware (CSS vars), inseree
 * dans chaque home layout. Les liens stores viennent du mobileAppConfig du
 * tenant (Studio > App mobile) ; sans lien, le badge affiche "Bientot
 * disponible" non cliquable.
 */
export function AppDownload() {
  const { meta } = useTenantMeta();
  const appName = meta?.mobileAppConfig?.appName?.trim() || meta?.name?.trim() || 'Transit Soft Services';
  const ios = meta?.mobileAppConfig?.storeLinks?.ios;
  const android = meta?.mobileAppConfig?.storeLinks?.android;

  return (
    <section id="app" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span
              className="text-xs font-bold uppercase tracking-[0.2em]"
              style={{ color: 'var(--skin-primary)' }}
            >
              Application mobile
            </span>
            <h2
              className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl skin-font-heading"
              style={{ color: 'var(--skin-foreground)' }}
            >
              {appName} dans votre poche
            </h2>
            <p className="mt-4 text-base" style={{ color: 'var(--skin-foreground-muted)' }}>
              Retrouvez toutes les fonctionnalites du site dans l application mobile :
              suivez vos envois, recevez les alertes de livraison et gerez vos paiements
              depuis votre telephone.
            </p>
            <ul className="mt-6 space-y-3">
              {FEATURES.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-start gap-3">
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center skin-radius"
                    style={{
                      background: 'color-mix(in oklab, var(--skin-primary) 12%, transparent)',
                      color: 'var(--skin-primary)',
                    }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-sm" style={{ color: 'var(--skin-foreground)' }}>
                    {label}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <StoreBadge
                href={ios}
                icon={<Apple className="h-5 w-5" />}
                topLine={ios ? 'Telecharger sur' : 'Bientot disponible sur'}
                store="App Store"
              />
              <StoreBadge
                href={android}
                icon={<Play className="h-5 w-5" />}
                topLine={android ? 'Disponible sur' : 'Bientot disponible sur'}
                store="Google Play"
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="relative mx-auto w-full max-w-sm"
          >
            <div
              aria-hidden
              className="absolute inset-0 -z-10 blur-3xl"
              style={{
                background:
                  'radial-gradient(ellipse at center, color-mix(in oklab, var(--skin-primary) 25%, transparent), transparent 70%)',
              }}
            />
            <Image
              src="/preview-mobile.png"
              alt={`Application mobile ${appName} : ecran de suivi de colis`}
              width={640}
              height={1280}
              className="w-full skin-radius-xl skin-shadow"
              sizes="(max-width: 1024px) 90vw, 400px"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function StoreBadge({
  href,
  icon,
  topLine,
  store,
}: {
  href?: string;
  icon: React.ReactNode;
  topLine: string;
  store: string;
}) {
  const inner = (
    <>
      {icon}
      <span className="flex flex-col items-start leading-tight">
        <span className="text-[10px] uppercase tracking-wide opacity-70">{topLine}</span>
        <span className="text-sm font-semibold">{store}</span>
      </span>
    </>
  );
  const cls = 'inline-flex items-center gap-2.5 px-5 py-2.5 skin-radius transition-transform';
  const style = {
    background: 'var(--skin-foreground)',
    color: 'var(--skin-background)',
  } as React.CSSProperties;

  if (!href) {
    return (
      <span className={`${cls} cursor-default opacity-60`} style={style}>
        {inner}
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${cls} hover:-translate-y-0.5`} style={style}>
      {inner}
    </a>
  );
}
