'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  Hammer,
  Loader2,
  Smartphone,
  Sparkles,
  Store,
} from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  MobileAppConfig,
  MobileAppMode,
} from '@transitsoftservices/shared';
import { apiClient, portalApi } from '@/lib/api/client';
import { Field } from '@/components/auth/Field';

const MODES: { id: MobileAppMode; label: string; desc: string }[] = [
  {
    id: 'shared',
    label: 'App partagee',
    desc: 'Application unique multi-tenant - votre nom, votre logo, vos couleurs charges au runtime. Inclus dans tous les plans.',
  },
  {
    id: 'white_label',
    label: 'App dediee (white-label)',
    desc: 'Build native dediee a vos couleurs sur les stores. Necessite Apple/Google Developer + ~2 semaines de review (plan Entreprise).',
  },
];

export function MobileAppTab() {
  const [cfg, setCfg] = useState<MobileAppConfig>({
    mode: 'shared',
    appName: 'Transit Soft Services',
    buildStatus: 'idle',
  });

  const { data: meta } = useQuery({
    queryKey: ['tenant-meta'],
    queryFn: () => apiClient.get('/tenant-meta').then((r) => r.data.data),
  });

  useEffect(() => {
    if (meta?.mobileAppConfig) setCfg(meta.mobileAppConfig as MobileAppConfig);
  }, [meta]);

  const save = useMutation({
    mutationFn: () => portalApi.patchMobileAppConfig(cfg),
    onSuccess: ({ mobileAppConfig }) => {
      setCfg(mobileAppConfig);
      toast.success("Config mobile mise a jour.");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Sauvegarde impossible.');
    },
  });

  const patch = (p: Partial<MobileAppConfig>) =>
    setCfg((prev) => ({ ...prev, ...p }));

  const showWhiteLabelFields = cfg.mode === 'white_label';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <header>
        <h2
          className="text-xl font-bold tracking-tight skin-font-heading"
          style={{ color: 'var(--skin-foreground)' }}
        >
          <Smartphone className="mr-2 inline h-5 w-5" />
          Application mobile
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--skin-muted)' }}>
          Distribuez l'app a vos clients avec votre identite - shared en mode
          rapide, white-label pour la marque maximale.
        </p>
      </header>

      <section className="space-y-3 p-5 skin-card">
        <h3
          className="text-xs font-bold uppercase tracking-[0.2em]"
          style={{ color: 'var(--skin-primary)' }}
        >
          Mode de distribution
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MODES.map((m) => {
            const active = cfg.mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => patch({ mode: m.id })}
                className="text-left p-3 transition-all"
                style={{
                  background: 'var(--skin-surface)',
                  border: `1px solid ${active ? 'var(--skin-primary)' : 'var(--skin-border)'}`,
                  borderRadius: 'var(--skin-radius-sm)',
                }}
              >
                <div className="flex items-center justify-between">
                  <p
                    className="text-sm font-semibold"
                    style={{ color: 'var(--skin-foreground)' }}
                  >
                    {m.label}
                  </p>
                  {active && (
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-white"
                      style={{ background: 'var(--skin-primary)' }}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </div>
                <p
                  className="mt-1 text-[11px] leading-snug"
                  style={{ color: 'var(--skin-muted)' }}
                >
                  {m.desc}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-4 p-5 skin-card">
        <h3
          className="text-xs font-bold uppercase tracking-[0.2em]"
          style={{ color: 'var(--skin-primary)' }}
        >
          Identite
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nom de l'application">
            <input
              type="text"
              value={cfg.appName ?? ''}
              onChange={(e) => patch({ appName: e.target.value })}
              placeholder="Acme Track"
              className="skin-input"
            />
          </Field>
          <Field label="Couleur native (splash + status bar)">
            <input
              type="color"
              value={cfg.primaryColor ?? '#1B5E20'}
              onChange={(e) => patch({ primaryColor: e.target.value })}
              className="h-10 w-full cursor-pointer skin-input"
              style={{ padding: 4 }}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Icone (URL, 1024x1024 PNG)">
            <input
              type="url"
              value={cfg.iconUrl ?? ''}
              onChange={(e) => patch({ iconUrl: e.target.value })}
              placeholder="https://cdn.acme.com/app-icon.png"
              className="skin-input"
            />
          </Field>
          <Field label="Splash (URL, 2732x2732 PNG)">
            <input
              type="url"
              value={cfg.splashUrl ?? ''}
              onChange={(e) => patch({ splashUrl: e.target.value })}
              placeholder="https://cdn.acme.com/app-splash.png"
              className="skin-input"
            />
          </Field>
        </div>
        {(cfg.iconUrl || cfg.splashUrl) && (
          <div className="grid grid-cols-2 gap-4">
            {cfg.iconUrl && (
              <Preview label="Icone" src={cfg.iconUrl} square />
            )}
            {cfg.splashUrl && <Preview label="Splash" src={cfg.splashUrl} />}
          </div>
        )}
      </section>

      {showWhiteLabelFields && (
        <section className="space-y-4 p-5 skin-card">
          <h3
            className="text-xs font-bold uppercase tracking-[0.2em]"
            style={{ color: 'var(--skin-primary)' }}
          >
            Identifiants stores
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="iOS Bundle ID"
              hint="Format reverse-DNS, ex: com.acme.transit"
            >
              <input
                type="text"
                value={cfg.bundleId ?? ''}
                onChange={(e) => patch({ bundleId: e.target.value })}
                placeholder="com.acme.transit"
                className="skin-input"
              />
            </Field>
            <Field label="Android Package ID">
              <input
                type="text"
                value={cfg.packageId ?? ''}
                onChange={(e) => patch({ packageId: e.target.value })}
                placeholder="com.acme.transit"
                className="skin-input"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Lien App Store">
              <input
                type="url"
                value={cfg.storeLinks?.ios ?? ''}
                onChange={(e) =>
                  patch({
                    storeLinks: { ...(cfg.storeLinks ?? {}), ios: e.target.value },
                  })
                }
                placeholder="https://apps.apple.com/..."
                className="skin-input"
              />
            </Field>
            <Field label="Lien Play Store">
              <input
                type="url"
                value={cfg.storeLinks?.android ?? ''}
                onChange={(e) =>
                  patch({
                    storeLinks: {
                      ...(cfg.storeLinks ?? {}),
                      android: e.target.value,
                    },
                  })
                }
                placeholder="https://play.google.com/..."
                className="skin-input"
              />
            </Field>
          </div>
          <div
            className="flex items-start gap-3 p-4 skin-radius-sm"
            style={{
              background:
                'color-mix(in oklab, var(--skin-primary) 8%, transparent)',
            }}
          >
            <Hammer
              className="mt-0.5 h-5 w-5 shrink-0"
              style={{ color: 'var(--skin-primary)' }}
            />
            <div className="text-sm" style={{ color: 'var(--skin-foreground)' }}>
              <p className="font-semibold">Build white-label</p>
              <p
                className="mt-1 text-xs"
                style={{ color: 'var(--skin-muted)' }}
              >
                Une fois enregistre, l'equipe Transit Soft Services declenche le build EAS
                dedie et soumet aux stores. Vous recevrez un email a chaque etape
                (queued -&gt; building -&gt; published).
              </p>
              <p
                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold"
                style={{ color: 'var(--skin-primary)' }}
              >
                <Store className="h-3 w-3" />
                Statut actuel : {(cfg.buildStatus ?? 'idle').toUpperCase()}
              </p>
            </div>
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold skin-btn-primary"
      >
        {save.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Enregistrer
          </>
        )}
      </button>
    </motion.div>
  );
}

function Preview({
  src,
  label,
  square,
}: {
  src: string;
  label: string;
  square?: boolean;
}) {
  return (
    <div>
      <p
        className="mb-1 text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: 'var(--skin-muted)' }}
      >
        {label}
      </p>
      <div
        className="overflow-hidden skin-radius-sm"
        style={{
          background: 'var(--skin-background)',
          border: '1px solid var(--skin-border)',
          aspectRatio: square ? '1 / 1' : '9 / 16',
        }}
      >
        <img
          src={src}
          alt={label}
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>
    </div>
  );
}
