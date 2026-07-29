'use client';

import { useEffect } from 'react';
import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import {
  createPromoCodeSchema,
  updatePromoCodeSchema,
  ParcelCategoryValues,
  type CreatePromoCodeInput,
} from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppTextarea } from '@/components/ui/AppTextarea';
import { AppDatePicker } from '@/components/ui/AppDatePicker';
import { AppCheckbox } from '@/components/ui/AppCheckbox';
import { apiClient } from '@/lib/api/client';
import { useCreatePromoCode, useUpdatePromoCode } from '@/lib/hooks/usePromoCodes';
import type { PromoCode } from '@/lib/api/promoCodes';
import {
  PARCEL_CATEGORY_LABELS,
  TRANSIT_TYPE_LABELS,
  VISIBILITY_HINTS,
  toDateInput,
} from './promoLabels';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Si fourni, le dialog passe en mode edition. */
  promoCode?: PromoCode | null;
}

const TRANSIT_TYPES = ['AIR', 'SEA', 'LAND'] as const;

/** Coche / decoche une valeur dans un tableau controle par RHF. */
function toggleIn<T>(list: T[] | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

export function PromoCodeFormDialog({ open, onClose, promoCode }: Props) {
  const isEdit = !!promoCode;
  const create = useCreatePromoCode();
  const update = useUpdatePromoCode();
  const pending = create.isPending || update.isPending;

  // Routes de transit actives : le perimetre "routes" du code se coche ici.
  const { data: routesData } = useQuery({
    queryKey: ['transit-routes', { forPromo: true }],
    queryFn: () =>
      apiClient.get('/transit-routes', { params: { limit: 200, isActive: 'true' } }).then((r) => r.data),
    enabled: open,
  });
  const routes: Array<{ id: string; name: string; type: string }> = routesData?.data ?? [];

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreatePromoCodeInput>({
    resolver: zodResolver((isEdit ? updatePromoCodeSchema : createPromoCodeSchema) as never),
  });

  const discountType = useWatch({ control, name: 'discountType' });
  const visibility = useWatch({ control, name: 'visibility' });

  useEffect(() => {
    if (!open) return;
    if (promoCode) {
      reset({
        code: promoCode.code,
        label: promoCode.label,
        description: promoCode.description ?? '',
        discountType: promoCode.discountType,
        discountValue: Number(promoCode.discountValue),
        maxDiscountAmount:
          promoCode.maxDiscountAmount != null ? Number(promoCode.maxDiscountAmount) : undefined,
        minOrderAmount:
          promoCode.minOrderAmount != null ? Number(promoCode.minOrderAmount) : undefined,
        maxOrderAmount:
          promoCode.maxOrderAmount != null ? Number(promoCode.maxOrderAmount) : undefined,
        parcelCategories: promoCode.parcelCategories as CreatePromoCodeInput['parcelCategories'],
        transitTypes: promoCode.transitTypes as CreatePromoCodeInput['transitTypes'],
        transitRouteIds: (promoCode.routes ?? []).map((r) => r.transitRoute.id),
        startsAt: toDateInput(promoCode.startsAt) as never,
        expiresAt: toDateInput(promoCode.expiresAt) as never,
        maxUses: promoCode.maxUses ?? undefined,
        maxUsesPerClient: promoCode.maxUsesPerClient ?? undefined,
        visibility: promoCode.visibility,
      } as CreatePromoCodeInput);
    } else {
      reset({
        discountType: 'PERCENT',
        visibility: 'PUBLIC',
        parcelCategories: [],
        transitTypes: [],
        transitRouteIds: [],
      } as unknown as CreatePromoCodeInput);
    }
  }, [open, promoCode, reset]);

  const onSubmit = (data: CreatePromoCodeInput) => {
    const payload = { ...data, description: data.description || null };
    if (isEdit) {
      update.mutate({ id: promoCode!.id, data: payload }, { onSuccess: onClose });
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier le code promo' : 'Nouveau code promo'}
      size="lg"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>
            Annuler
          </AppButton>
          <AppButton type="submit" form="promo-code-form" loading={pending}>
            {isEdit ? 'Enregistrer' : 'Creer'}
          </AppButton>
        </>
      }
    >
      <form id="promo-code-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AppInput
            label="Code"
            placeholder="ETE2026"
            {...register('code')}
            error={errors.code?.message}
          />
          <AppInput
            label="Libelle"
            placeholder="Promotion d'ete"
            {...register('label')}
            error={errors.label?.message}
          />
        </div>
        <AppTextarea
          label="Description (facultatif)"
          rows={2}
          placeholder="Visible par le client sur la page promotions."
          {...register('description')}
        />

        {/* Remise --------------------------------------------------------- */}
        <div className="space-y-3 rounded-xl border border-gray-100 p-4">
          <h4 className="text-sm font-semibold text-gray-700">Remise</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Controller
              control={control}
              name="discountType"
              render={({ field }) => (
                <AppSelect
                  label="Type"
                  value={field.value ?? 'PERCENT'}
                  onValueChange={field.onChange}
                  options={[
                    { value: 'PERCENT', label: 'Pourcentage' },
                    { value: 'AMOUNT', label: 'Montant fixe' },
                  ]}
                  error={errors.discountType?.message}
                />
              )}
            />
            <AppInput
              label={discountType === 'PERCENT' ? 'Valeur (%)' : 'Valeur (FCFA)'}
              type="number"
              step={discountType === 'PERCENT' ? '1' : '0.01'}
              {...register('discountValue', { valueAsNumber: true })}
              error={errors.discountValue?.message}
            />
            {discountType === 'PERCENT' && (
              <AppInput
                label="Plafond de remise (FCFA)"
                type="number"
                step="0.01"
                placeholder="Aucun"
                {...register('maxDiscountAmount', { valueAsNumber: true })}
                error={errors.maxDiscountAmount?.message}
              />
            )}
          </div>
        </div>

        {/* Perimetre ------------------------------------------------------ */}
        <div className="space-y-4 rounded-xl border border-gray-100 p-4">
          <div>
            <h4 className="text-sm font-semibold text-gray-700">Perimetre</h4>
            <p className="mt-0.5 text-xs text-gray-500">
              Ne rien cocher = le code s&apos;applique a toute la facture. Sinon la remise ne porte
              que sur les colis correspondants.
            </p>
          </div>

          <Controller
            control={control}
            name="parcelCategories"
            render={({ field }) => (
              <div>
                <p className="mb-2 text-xs font-medium text-gray-600">Types de colis</p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {ParcelCategoryValues.map((c) => (
                    <AppCheckbox
                      key={c}
                      label={PARCEL_CATEGORY_LABELS[c] ?? c}
                      checked={(field.value ?? []).includes(c)}
                      onCheckedChange={() => field.onChange(toggleIn(field.value, c))}
                    />
                  ))}
                </div>
              </div>
            )}
          />

          <Controller
            control={control}
            name="transitTypes"
            render={({ field }) => (
              <div>
                <p className="mb-2 text-xs font-medium text-gray-600">Modes de transport</p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {TRANSIT_TYPES.map((t) => (
                    <AppCheckbox
                      key={t}
                      label={TRANSIT_TYPE_LABELS[t]}
                      checked={(field.value ?? []).includes(t)}
                      onCheckedChange={() => field.onChange(toggleIn(field.value, t))}
                    />
                  ))}
                </div>
              </div>
            )}
          />

          <Controller
            control={control}
            name="transitRouteIds"
            render={({ field }) => (
              <div>
                <p className="mb-2 text-xs font-medium text-gray-600">Routes de transit</p>
                {routes.length === 0 ? (
                  <p className="text-xs text-gray-400">Aucune route active.</p>
                ) : (
                  <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg bg-gray-50 p-3">
                    {routes.map((r) => (
                      <AppCheckbox
                        key={r.id}
                        label={`${r.name} (${TRANSIT_TYPE_LABELS[r.type] ?? r.type})`}
                        checked={(field.value ?? []).includes(r.id)}
                        onCheckedChange={() => field.onChange(toggleIn(field.value, r.id))}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          />
        </div>

        {/* Intervalle de tarifs ------------------------------------------- */}
        <div className="space-y-3 rounded-xl border border-gray-100 p-4">
          <div>
            <h4 className="text-sm font-semibold text-gray-700">Intervalle de tarifs</h4>
            <p className="mt-0.5 text-xs text-gray-500">
              Le code ne s&apos;applique que si le montant concerne tombe dans cet intervalle.
              Laisser vide pour ne pas borner.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AppInput
              label="Montant minimum (FCFA)"
              type="number"
              step="0.01"
              {...register('minOrderAmount', { valueAsNumber: true })}
              error={errors.minOrderAmount?.message}
            />
            <AppInput
              label="Montant maximum (FCFA)"
              type="number"
              step="0.01"
              {...register('maxOrderAmount', { valueAsNumber: true })}
              error={errors.maxOrderAmount?.message}
            />
          </div>
        </div>

        {/* Validite et limites -------------------------------------------- */}
        <div className="space-y-3 rounded-xl border border-gray-100 p-4">
          <h4 className="text-sm font-semibold text-gray-700">Validite et limites</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AppDatePicker label="Debut de validite" {...register('startsAt')} />
            <AppDatePicker
              label="Date d'expiration"
              {...register('expiresAt')}
              error={errors.expiresAt?.message}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AppInput
              label="Utilisations totales (vide = illimite)"
              type="number"
              {...register('maxUses', { valueAsNumber: true })}
              error={errors.maxUses?.message}
            />
            <AppInput
              label="Utilisations par client (vide = illimite)"
              type="number"
              {...register('maxUsesPerClient', { valueAsNumber: true })}
              error={errors.maxUsesPerClient?.message}
            />
          </div>
        </div>

        {/* Visibilite ------------------------------------------------------ */}
        <div className="space-y-2">
          <Controller
            control={control}
            name="visibility"
            render={({ field }) => (
              <AppSelect
                label="Visibilite"
                value={field.value ?? 'PUBLIC'}
                onValueChange={field.onChange}
                options={[
                  { value: 'PUBLIC', label: 'Public' },
                  { value: 'PRIVATE', label: 'Prive' },
                  { value: 'ASSIGNED', label: 'Sur attribution' },
                ]}
              />
            )}
          />
          <p className="text-xs text-gray-500">{VISIBILITY_HINTS[visibility ?? 'PUBLIC']}</p>
        </div>
      </form>
    </AppDialog>
  );
}
