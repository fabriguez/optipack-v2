'use client';

import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createDebtSchema,
  type CreateDebtInput,
  type DebtType,
  DebtTypeValues,
} from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { AppTextarea } from '@/components/ui/AppTextarea';
import { searchers } from '@/lib/api/searchers';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  // Bucket courant : pre-selectionne le type approprie (CLIENT vs EMPLOYEE
  // par defaut quand on est dans l'onglet entreprise).
  defaultBucket?: 'client' | 'company';
}

const TYPE_LABEL: Record<DebtType, string> = {
  CLIENT: 'Client (colis retire sans paiement, paiement partiel)',
  EMPLOYEE: 'Personnel (avance salaire, remboursement frais)',
  AGENCY: 'Agence (charge non reglee : loyer, eau, ...)',
  CARRIER: 'Transporteur (compte transporteur, surcout)',
};

export function DebtFormDialog({ open, onClose, defaultBucket = 'client' }: Props) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: CreateDebtInput) => apiClient.post('/debts', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debts'] });
      toast.success('Dette creee');
      onClose();
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'Erreur a la creation de la dette');
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    formState: { errors },
  } = useForm<CreateDebtInput>({
    resolver: zodResolver(createDebtSchema),
    defaultValues: {
      type: defaultBucket === 'client' ? 'CLIENT' : 'EMPLOYEE',
    },
  });

  // Reset type quand le bucket change a l'ouverture.
  useEffect(() => {
    if (open) {
      reset({ type: defaultBucket === 'client' ? 'CLIENT' : 'EMPLOYEE' });
    }
  }, [open, defaultBucket, reset]);

  const type = watch('type');

  const onSubmit = (data: CreateDebtInput) => {
    // Nettoie les FK non pertinentes selon le type pour eviter d'envoyer du
    // bruit que le backend rejetterait avec la refine zod.
    const cleaned: CreateDebtInput = {
      ...data,
      ...(data.type !== 'CLIENT' && { clientId: undefined, parcelId: undefined, invoiceId: undefined }),
      ...(data.type !== 'EMPLOYEE' && { employeeId: undefined }),
      ...(data.type !== 'CARRIER' && { carrierId: undefined }),
      ...(data.type !== 'AGENCY' && { agencyChargeId: undefined, creditor: undefined }),
    };
    mutation.mutate(cleaned);
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Nouvelle dette"
      size="lg"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>
            Annuler
          </AppButton>
          <AppButton type="submit" form="debt-form" loading={mutation.isPending}>
            Creer
          </AppButton>
        </>
      }
    >
      <form id="debt-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <AppSelect
              label="Type de dette"
              value={field.value}
              onValueChange={(v) => field.onChange(v)}
              options={DebtTypeValues.map((v) => ({ value: v, label: TYPE_LABEL[v] }))}
              error={errors.type?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="agencyId"
          render={({ field }) => (
            <AppSearchSelect
              label="Agence"
              value={field.value}
              onChange={(v) => field.onChange(v ?? '')}
              search={searchers.myAgencies}
              error={errors.agencyId?.message}
              placeholder="Selectionner l'agence rattachee"
              required
            />
          )}
        />

        <AppInput
          label="Motif"
          {...register('motif')}
          error={errors.motif?.message}
          placeholder="Resume court (ex: colis retire sans paiement)"
        />

        <AppTextarea
          label="Description (optionnel)"
          rows={2}
          placeholder="Detail supplementaire"
          {...register('description')}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <AppInput
            label="Montant total"
            type="number"
            step="0.01"
            {...register('totalAmount', { valueAsNumber: true })}
            error={errors.totalAmount?.message}
          />
          <AppInput
            label="Echeance finale (optionnel)"
            type="date"
            {...register('dueDateFinal')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <AppSelect
            label="Categorie"
            {...register('category')}
            options={[
              { value: 'FREIGHT', label: 'Fret' },
              { value: 'CUSTOMS', label: 'Douane' },
              { value: 'STORAGE', label: 'Magasinage' },
              { value: 'DELIVERY', label: 'Livraison' },
              { value: 'TRANSIT', label: 'Transit' },
              { value: 'PENALTY', label: 'Penalite' },
              { value: 'ADVANCE', label: 'Avance' },
              { value: 'TRANSPORT', label: 'Transport' },
              { value: 'SUPPLY', label: 'Fourniture' },
              { value: 'PORT_FEES', label: 'Frais portuaires' },
              { value: 'FUEL', label: 'Carburant' },
              { value: 'LABOR', label: 'Main d\'oeuvre' },
              { value: 'TAXES', label: 'Taxes' },
              { value: 'MAINTENANCE', label: 'Entretien' },
              { value: 'RENT', label: 'Loyer' },
              { value: 'OTHER', label: 'Autre' },
            ]}
            placeholder="Selectionner"
          />
          <AppSelect
            label="Priorite"
            {...register('priority')}
            options={[
              { value: 'LOW', label: 'Faible' },
              { value: 'MEDIUM', label: 'Moyenne' },
              { value: 'CRITICAL', label: 'Critique' },
            ]}
            placeholder="Moyenne"
          />
        </div>

        {/* Champs typees -- affiches conditionnellement selon le type choisi.
            Le backend refuse explicitement les FK non coherentes. */}
        {type === 'CLIENT' && (
          <div className="space-y-4 rounded-xl border border-primary-100 bg-primary-50/30 p-3">
            <p className="text-xs font-semibold text-primary-900">Dette client</p>
            <Controller
              control={control}
              name="clientId"
              render={({ field }) => (
                <AppSearchSelect
                  label="Client"
                  value={field.value ?? null}
                  onChange={(v) => field.onChange(v ?? undefined)}
                  search={searchers.clients}
                  error={errors.clientId?.message}
                  required
                />
              )}
            />
            <Controller
              control={control}
              name="parcelId"
              render={({ field }) => (
                <AppSearchSelect
                  label="Colis lie (optionnel)"
                  value={field.value ?? null}
                  onChange={(v) => field.onChange(v ?? undefined)}
                  search={searchers.parcels}
                  placeholder="Cas typique : retrait sans paiement"
                />
              )}
            />
          </div>
        )}

        {type === 'EMPLOYEE' && (
          <div className="space-y-4 rounded-xl border border-primary-100 bg-primary-50/30 p-3">
            <p className="text-xs font-semibold text-primary-900">Dette personnel</p>
            <Controller
              control={control}
              name="employeeId"
              render={({ field }) => (
                <AppSearchSelect
                  label="Employe"
                  value={field.value ?? null}
                  onChange={(v) => field.onChange(v ?? undefined)}
                  search={searchers.employees}
                  required
                />
              )}
            />
          </div>
        )}

        {type === 'CARRIER' && (
          <div className="space-y-4 rounded-xl border border-primary-100 bg-primary-50/30 p-3">
            <p className="text-xs font-semibold text-primary-900">Dette transporteur</p>
            <Controller
              control={control}
              name="carrierId"
              render={({ field }) => (
                <AppSearchSelect
                  label="Transporteur"
                  value={field.value ?? null}
                  onChange={(v) => field.onChange(v ?? undefined)}
                  search={async (q, limit) => {
                    const r = await apiClient.get('/carriers', { params: { search: q, limit, activeOnly: true } });
                    return (r.data?.data || []).map((c: any) => ({
                      value: c.id,
                      label: c.name,
                      sublabel: c.carrierType,
                    }));
                  }}
                  required
                />
              )}
            />
          </div>
        )}

        {type === 'AGENCY' && (
          <div className="space-y-4 rounded-xl border border-primary-100 bg-primary-50/30 p-3">
            <p className="text-xs font-semibold text-primary-900">Dette agence</p>
            <p className="text-[11px] text-gray-500">
              Renseignez au moins l&apos;un des deux : une charge recurrente OU un creancier libre.
            </p>
            <Controller
              control={control}
              name="agencyChargeId"
              render={({ field }) => (
                <AppSearchSelect
                  label="Charge recurrente (optionnel)"
                  value={field.value ?? null}
                  onChange={(v) => field.onChange(v ?? undefined)}
                  search={async (q, limit) => {
                    const agencyId = watch('agencyId');
                    if (!agencyId) return [];
                    const r = await apiClient.get(`/agencies/${agencyId}/charges`, { params: { search: q, limit } });
                    return (r.data?.data || []).map((c: any) => ({
                      value: c.id,
                      label: c.label,
                      sublabel: c.type,
                    }));
                  }}
                  placeholder="Loyer, eau, electricite..."
                />
              )}
            />
            <AppInput
              label="Creancier libre (si pas de charge recurrente)"
              placeholder="Prestataire, fournisseur ponctuel..."
              {...register('creditor')}
            />
          </div>
        )}

        <AppInput
          label="Prochaine echeance (optionnel)"
          type="date"
          {...register('nextDueDate')}
        />
      </form>
    </AppDialog>
  );
}
