'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Star, Save, AlertCircle } from 'lucide-react';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppSwitch } from '@/components/ui/AppSwitch';
import { AppBadge } from '@/components/ui/AppBadge';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { useLoyaltyConfig, useUpdateLoyaltyConfig } from '@/lib/hooks/useLoyaltyConfig';
import type { LoyaltyConfigDTO } from '@/lib/api/loyaltyConfig';

interface FormValues {
  enabled: boolean;
  pointsPerXaf: number;
  fcfaPerPoint: number;
  silver: number;
  gold: number;
  vip: number;
}

export default function LoyaltyConfigPage() {
  const { data, isLoading } = useLoyaltyConfig();
  const update = useUpdateLoyaltyConfig();
  const cfg: LoyaltyConfigDTO | undefined = (data as any)?.data;

  const { register, handleSubmit, watch, reset, setValue } = useForm<FormValues>();

  useEffect(() => {
    if (!cfg) return;
    reset({
      enabled: cfg.enabled,
      pointsPerXaf: cfg.pointsPerXaf,
      fcfaPerPoint: cfg.fcfaPerPoint,
      silver: cfg.tierThresholds.SILVER,
      gold: cfg.tierThresholds.GOLD,
      vip: cfg.tierThresholds.VIP,
    });
  }, [cfg, reset]);

  const enabled = watch('enabled');
  const pointsPerXaf = Number(watch('pointsPerXaf') ?? 0);
  const fcfaPerPoint = Number(watch('fcfaPerPoint') ?? 0);

  const onSubmit = (data: FormValues) => {
    update.mutate({
      enabled: !!data.enabled,
      pointsPerXaf: Number(data.pointsPerXaf),
      fcfaPerPoint: Number(data.fcfaPerPoint),
      tierThresholds: {
        SILVER: Number(data.silver),
        GOLD: Number(data.gold),
        VIP: Number(data.vip),
      },
    });
  };

  if (isLoading) return <DashboardSkeleton />;

  // Exemples de calcul affiches en aide pedagogique.
  const exampleAmount = 50000;
  const exampleEarn = Math.floor(exampleAmount * pointsPerXaf);
  const examplePoints = 500;
  const exampleDiscount = Math.floor(examplePoints * fcfaPerPoint);

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Star className="h-6 w-6 text-amber-500" />
            Politique de fidelite
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Activez ou desactivez le systeme de fidelite et reglez les taux de gain et de conversion.
          </p>
        </div>
        {cfg && (
          <AppBadge variant={cfg.enabled ? 'success' : 'outline'}>
            {cfg.enabled ? 'Active' : 'Desactive'}
          </AppBadge>
        )}
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Toggle principal */}
        <AppCard>
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <h3 className="text-base font-semibold text-gray-900">Activer le systeme de fidelite</h3>
              <p className="mt-1 text-xs text-gray-500">
                Quand <strong>desactive</strong> : aucune accumulation de points sur les paiements,
                aucune conversion possible en remise. Les soldes existants sont conserves mais
                geles. Quand <strong>active</strong> : chaque paiement credite des points au
                client, qui peut les convertir en remise sur ses factures futures.
              </p>
            </div>
            <AppSwitch
              checked={enabled}
              onCheckedChange={(v) => setValue('enabled', v, { shouldDirty: true })}
            />
          </div>
        </AppCard>

        {/* Taux de gain */}
        <AppCard>
          <AppCardHeader
            title="Taux de gain"
            description="Combien de points le client gagne par FCFA paye."
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AppInput
              label="Points par FCFA"
              type="number"
              step="0.0001"
              {...register('pointsPerXaf', { valueAsNumber: true })}
              disabled={!enabled}
            />
            <div className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
              <p className="font-semibold text-gray-800">Exemple</p>
              <p className="mt-1">
                Un paiement de <strong>{exampleAmount.toLocaleString('fr-FR')} FCFA</strong>{' '}
                credite <strong>{exampleEarn.toLocaleString('fr-FR')} point(s)</strong> au client.
              </p>
              <p className="mt-1 text-[11px] text-gray-400">
                Astuce : 0.001 = 1 point pour 1 000 FCFA payes.
              </p>
            </div>
          </div>
        </AppCard>

        {/* Taux de conversion */}
        <AppCard>
          <AppCardHeader
            title="Taux de conversion"
            description="Valeur FCFA d'un point quand le client convertit ses points en remise."
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AppInput
              label="FCFA par point"
              type="number"
              step="0.01"
              {...register('fcfaPerPoint', { valueAsNumber: true })}
              disabled={!enabled}
            />
            <div className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
              <p className="font-semibold text-gray-800">Exemple</p>
              <p className="mt-1">
                Un client qui convertit <strong>{examplePoints} points</strong> obtient une
                remise de <strong>{exampleDiscount.toLocaleString('fr-FR')} FCFA</strong>.
              </p>
              <p className="mt-1 text-[11px] text-gray-400">
                Astuce : 1 = 1 point vaut 1 FCFA de remise (le plus simple a comprendre).
              </p>
            </div>
          </div>
        </AppCard>

        {/* Seuils de palier */}
        <AppCard>
          <AppCardHeader
            title="Seuils de palier"
            description="Points cumules necessaires pour atteindre chaque palier. Le palier sert d'indicateur commercial."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <AppInput
              label="Silver (points)"
              type="number"
              min={0}
              {...register('silver', { valueAsNumber: true })}
              disabled={!enabled}
            />
            <AppInput
              label="Gold (points)"
              type="number"
              min={0}
              {...register('gold', { valueAsNumber: true })}
              disabled={!enabled}
            />
            <AppInput
              label="VIP (points)"
              type="number"
              min={0}
              {...register('vip', { valueAsNumber: true })}
              disabled={!enabled}
            />
          </div>
          {!enabled && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Le systeme est desactive : les taux et seuils restent enregistres mais ne
                seront appliques qu&apos;a l&apos;activation.
              </span>
            </p>
          )}
        </AppCard>

        <div className="flex justify-end">
          <AppButton type="submit" loading={update.isPending}>
            <Save className="h-4 w-4" />
            Enregistrer
          </AppButton>
        </div>
      </form>
    </div>
  );
}
