'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ExternalLink,
  Eye,
  ImagePlus,
  Loader2,
  Palette,
  RotateCcw,
  Save,
  Type as TypeIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { apiClient } from '@/lib/api/client';
import { useIsTenantAdmin } from '@/lib/hooks/usePermission';
import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';

interface SkinTokens {
  id: string;
  name: string;
  tagline: string;
  primary: string;
  secondary: string;
  accent: string;
  heroGradient: [string, string, string];
  fontBody: string;
  fontHeading: string;
  radius: number;
  mood: string;
  images?: {
    preview?: string;
    hero?: string;
    authShell?: string;
  };
}

interface SkinCustomization {
  primary?: string;
  accent?: string;
  radius?: number;
  fontBody?: string;
  fontHeading?: string;
  imageOverrides?: {
    hero?: string;
    authShell?: string;
    preview?: string;
  };
}

interface TenantMeta {
  id: string;
  slug: string;
  name: string;
  skin: string | null;
  skinCustomization: SkinCustomization | null;
}

const FONT_OPTIONS = [
  { value: 'Geist, system-ui, sans-serif', label: 'Geist' },
  { value: 'Inter, system-ui, sans-serif', label: 'Inter' },
  { value: '"Plus Jakarta Sans", system-ui, sans-serif', label: 'Plus Jakarta Sans' },
  { value: '"DM Sans", system-ui, sans-serif', label: 'DM Sans' },
  { value: 'Manrope, system-ui, sans-serif', label: 'Manrope' },
];

export default function SiteStudioPage() {
  return (
    <AdminGate>
      <SiteStudioContent />
    </AdminGate>
  );
}

function AdminGate({ children }: { children: React.ReactNode }) {
  const isAdmin = useIsTenantAdmin();
  const router = useRouter();
  // Garde stricte : seuls les admins du tenant peuvent ouvrir le Studio.
  // Backend renvoie 401/403 sur les mutations, mais sans gate front
  // l'utilisateur voit l'UI complete et essuie une erreur a la sauvegarde.
  // On isole le gate dans un composant parent pour eviter de conditionner
  // les hooks de SiteStudioContent (regle des hooks React).
  if (!isAdmin) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-xl py-16">
          <AppCard className="text-center p-10">
            <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-amber-500" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Accès reservé</h2>
            <p className="text-sm text-gray-600 mb-6">
              Le Studio site est reserve aux administrateurs du tenant. Contactez
              votre administrateur pour personnaliser l&apos;apparence du site.
            </p>
            <AppButton onClick={() => router.push('/')}>Retour au tableau de bord</AppButton>
          </AppCard>
        </div>
      </PageTransition>
    );
  }
  return <>{children}</>;
}

function SiteStudioContent() {
  const qc = useQueryClient();
  const [skinId, setSkinId] = useState<string | null>(null);
  const [custom, setCustom] = useState<SkinCustomization>({});
  const [hasChanges, setHasChanges] = useState(false);

  const meta = useQuery<TenantMeta>({
    queryKey: ['tenant-meta'],
    queryFn: async () => (await apiClient.get('/tenant-meta')).data?.data,
  });

  const skins = useQuery<SkinTokens[]>({
    queryKey: ['tenant-meta', 'skins'],
    queryFn: async () => (await apiClient.get('/tenant-meta/skins')).data?.data ?? [],
  });

  useEffect(() => {
    if (meta.data) {
      setSkinId(meta.data.skin ?? null);
      setCustom(meta.data.skinCustomization ?? {});
      setHasChanges(false);
    }
  }, [meta.data]);

  const save = useMutation({
    mutationFn: () =>
      apiClient.patch('/tenant-meta/skin', {
        skinId: skinId,
        skinCustomization: custom,
      }),
    onSuccess: () => {
      toast.success('Theme publie. Visible immediatement sur ton site public.');
      setHasChanges(false);
      qc.invalidateQueries({ queryKey: ['tenant-meta'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'Erreur a la sauvegarde');
    },
  });

  function patch<K extends keyof SkinCustomization>(key: K, value: SkinCustomization[K]) {
    setCustom((c) => ({ ...c, [key]: value }));
    setHasChanges(true);
  }

  function patchImage(slot: 'hero' | 'authShell' | 'preview', url: string) {
    setCustom((c) => ({
      ...c,
      imageOverrides: { ...c.imageOverrides, [slot]: url || undefined },
    }));
    setHasChanges(true);
  }

  function reset() {
    if (meta.data) {
      setSkinId(meta.data.skin ?? null);
      setCustom(meta.data.skinCustomization ?? {});
      setHasChanges(false);
    }
  }

  const selectedSkin = useMemo(
    () => skins.data?.find((s) => s.id === skinId) ?? skins.data?.[0],
    [skinId, skins.data],
  );

  // Couleurs effectives (skin + customization)
  const effective = useMemo(() => {
    if (!selectedSkin) return null;
    return {
      primary: custom.primary ?? selectedSkin.primary,
      secondary: selectedSkin.secondary,
      accent: custom.accent ?? selectedSkin.accent,
      radius: custom.radius ?? selectedSkin.radius,
      fontBody: custom.fontBody ?? selectedSkin.fontBody,
      fontHeading: custom.fontHeading ?? selectedSkin.fontHeading,
      heroGradient: selectedSkin.heroGradient,
      heroImage:
        custom.imageOverrides?.hero ?? selectedSkin.images?.hero ?? selectedSkin.images?.preview,
    };
  }, [selectedSkin, custom]);

  if (meta.isLoading || skins.isLoading) {
    return (
      <PageTransition>
        <div className="space-y-3">
          <div className="h-8 w-72 animate-pulse rounded bg-gray-100" />
          <div className="h-60 animate-pulse rounded-xl bg-gray-100" />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Studio - Site public</h1>
            <p className="mt-1 text-sm text-gray-500">
              Personnalise l&apos;apparence de ton site public (clients).
              Choisis une peau, ajuste les couleurs et la typographie.
            </p>
          </div>
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="hidden shrink-0 items-center gap-1 rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-gray-50 sm:inline-flex"
          >
            <ExternalLink className="h-4 w-4" />
            Voir mon site
          </a>
        </div>

        {/* Skin picker */}
        <AppCard>
          <AppCardHeader
            title="Peau de base"
            description="Chaque peau definit un trio de couleurs + des images d'ambiance. Tu peux ensuite affiner."
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {(skins.data ?? []).map((s) => {
              const active = s.id === skinId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSkinId(s.id);
                    setHasChanges(true);
                  }}
                  className={
                    'group flex flex-col overflow-hidden rounded-xl border text-left transition ' +
                    (active
                      ? 'border-primary-400 ring-2 ring-primary-200'
                      : 'border-gray-200 hover:border-gray-300')
                  }
                >
                  <div
                    className="h-20 w-full"
                    style={{
                      background: `linear-gradient(135deg, ${s.heroGradient[0]}, ${s.heroGradient[1]} 50%, ${s.heroGradient[2]})`,
                    }}
                  />
                  <div className="flex-1 space-y-1 p-3">
                    <p className="text-sm font-semibold">{s.name}</p>
                    <p className="line-clamp-2 text-xs text-gray-500">{s.tagline}</p>
                    <div className="flex items-center gap-1 pt-1">
                      {[s.primary, s.secondary, s.accent].map((c) => (
                        <span
                          key={c}
                          className="h-3 w-3 rounded-full border"
                          style={{ background: c }}
                        />
                      ))}
                      <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-400">
                        {s.mood}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </AppCard>

        {/* Color customization + preview */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <AppCard>
              <AppCardHeader
                title="Couleurs"
                description="Surcharge les couleurs de la peau. Vide = couleur d'origine de la peau."
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ColorOverrideField
                  label="Couleur primaire"
                  value={custom.primary}
                  defaultValue={selectedSkin?.primary}
                  onChange={(v) => patch('primary', v)}
                />
                <ColorOverrideField
                  label="Couleur d'accent"
                  value={custom.accent}
                  defaultValue={selectedSkin?.accent}
                  onChange={(v) => patch('accent', v)}
                />
              </div>
            </AppCard>

            <AppCard>
              <AppCardHeader
                title="Typographie et coins"
                description="Police d'ecriture + rayon des coins arrondis."
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Police - corps de texte
                  </label>
                  <select
                    value={custom.fontBody ?? selectedSkin?.fontBody ?? ''}
                    onChange={(e) => patch('fontBody', e.target.value)}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Police - titres
                  </label>
                  <select
                    value={custom.fontHeading ?? selectedSkin?.fontHeading ?? ''}
                    onChange={(e) => patch('fontHeading', e.target.value)}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <span>Rayon des coins</span>
                    <span className="font-mono text-[11px] normal-case text-gray-500">
                      {(custom.radius ?? selectedSkin?.radius ?? 0).toFixed(2)} rem
                    </span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={custom.radius ?? selectedSkin?.radius ?? 0.5}
                    onChange={(e) => patch('radius', Number(e.target.value))}
                    className="mt-1 w-full"
                  />
                </div>
              </div>
            </AppCard>

            <AppCard>
              <AppCardHeader
                title="Images"
                description="Surcharge les visuels d'ambiance de ton site public."
              />
              <div className="space-y-3">
                <ImageOverrideField
                  label="Image hero (page d'accueil)"
                  value={custom.imageOverrides?.hero ?? ''}
                  fallback={selectedSkin?.images?.hero}
                  onChange={(url) => patchImage('hero', url)}
                />
                <ImageOverrideField
                  label="Image auth (login/register)"
                  value={custom.imageOverrides?.authShell ?? ''}
                  fallback={selectedSkin?.images?.authShell}
                  onChange={(url) => patchImage('authShell', url)}
                />
                <ImageOverrideField
                  label="Vignette de previsualisation"
                  value={custom.imageOverrides?.preview ?? ''}
                  fallback={selectedSkin?.images?.preview}
                  onChange={(url) => patchImage('preview', url)}
                />
              </div>
            </AppCard>
          </div>

          {/* Live preview panel */}
          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <AppCard>
              <AppCardHeader title="Apercu" />
              {effective ? (
                <div
                  className="overflow-hidden rounded-xl border"
                  style={{
                    borderRadius: `${effective.radius}rem`,
                    background: '#fff',
                  }}
                >
                  <div
                    className="relative h-32 w-full"
                    style={{
                      background: `linear-gradient(135deg, ${effective.heroGradient[0]}, ${effective.heroGradient[1]} 50%, ${effective.heroGradient[2]})`,
                    }}
                  >
                    {effective.heroImage && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={effective.heroImage}
                        alt="Hero"
                        className="absolute inset-0 h-full w-full object-cover opacity-40 mix-blend-overlay"
                      />
                    )}
                  </div>
                  <div className="space-y-3 p-4" style={{ fontFamily: effective.fontBody }}>
                    <h3
                      className="text-lg font-bold"
                      style={{ fontFamily: effective.fontHeading, color: effective.primary }}
                    >
                      {meta.data?.name ?? 'Ton entreprise'}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Suivi de colis, paiements en ligne et notifications en temps reel.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="px-3 py-1.5 text-xs font-semibold text-white"
                        style={{
                          background: effective.primary,
                          borderRadius: `${effective.radius}rem`,
                        }}
                      >
                        Suivre un colis
                      </button>
                      <button
                        type="button"
                        className="border px-3 py-1.5 text-xs font-semibold"
                        style={{
                          color: effective.primary,
                          borderColor: effective.primary,
                          borderRadius: `${effective.radius}rem`,
                        }}
                      >
                        Creer un compte
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {[effective.primary, effective.accent].map((c) => (
                        <span
                          key={c}
                          className="h-4 w-4 rounded-full border"
                          style={{ background: c }}
                        />
                      ))}
                      <span className="ml-1 text-[10px] uppercase tracking-wide text-gray-400">
                        Palette effective
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Selectionne une peau pour voir l&apos;apercu.</p>
              )}
              <a
                href="/"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs text-primary-700 hover:underline"
              >
                <Eye className="h-3.5 w-3.5" />
                Voir le site complet apres publication
              </a>
            </AppCard>
          </aside>
        </div>

        {/* Sticky save bar */}
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-xl border bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
          <span className="mr-auto text-xs text-gray-500">
            {hasChanges ? (
              <span className="text-amber-700">Modifications non publiees</span>
            ) : (
              'Tout est a jour'
            )}
          </span>
          {hasChanges && (
            <AppButton variant="outline" onClick={reset} disabled={save.isPending}>
              <RotateCcw className="h-4 w-4" />
              Annuler
            </AppButton>
          )}
          <AppButton onClick={() => save.mutate()} loading={save.isPending} disabled={!hasChanges}>
            <Save className="h-4 w-4" />
            Publier
          </AppButton>
        </div>
      </div>
    </PageTransition>
  );
}

function ColorOverrideField({
  label,
  value,
  defaultValue,
  onChange,
}: {
  label: string;
  value: string | undefined;
  defaultValue: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const effective = value ?? defaultValue ?? '#000000';
  const hex = /^#[0-9a-fA-F]{6}$/.test(effective) ? effective : '#000000';
  const isOverride = value !== undefined && value !== '';
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
          <Palette className="mr-1 inline h-3 w-3" />
          {label}
        </label>
        {isOverride && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-[10px] text-gray-400 underline hover:text-gray-600"
          >
            Reinitialiser
          </button>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border bg-white"
        />
        <AppInput
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          placeholder={defaultValue ?? '#XXXXXX'}
          className="flex-1 font-mono text-xs"
        />
      </div>
    </div>
  );
}

function ImageOverrideField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string;
  fallback?: string;
  onChange: (url: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
        <ImagePlus className="mr-1 inline h-3 w-3" />
        {label}
      </label>
      <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <AppInput
          type="url"
          placeholder={fallback ?? 'https://...'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {(value || fallback) && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={value || fallback}
            alt="preview"
            className="h-9 w-16 rounded border object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = '0.3';
            }}
          />
        )}
      </div>
    </div>
  );
}
