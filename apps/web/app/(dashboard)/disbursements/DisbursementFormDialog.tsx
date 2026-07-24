'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createDisbursementSchema, type CreateDisbursementInput } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { AppTextarea } from '@/components/ui/AppTextarea';
import { ImageInput } from '@/components/shared/ImageInput';
import { searchers } from '@/lib/api/searchers';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { disbursementsApi } from '@/lib/api/finance';
import { uploadImage } from '@/lib/api/uploads';
import { toast } from 'sonner';

interface Props { open: boolean; onClose: () => void; }

const ORDERER_PERMISSION = 'disbursement.order';

export function DisbursementFormDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: CreateDisbursementInput) => disbursementsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['disbursements'] });
      qc.invalidateQueries({ queryKey: ['cash-register'] });
      toast.success('Decaissement cree');
      reset();
      onClose();
    },
    onError: () => toast.error('Erreur (solde insuffisant ?)'),
  });

  const { register, handleSubmit, reset, control, setValue, watch, formState: { errors } } = useForm<CreateDisbursementInput>({
    resolver: zodResolver(createDisbursementSchema),
    defaultValues: {
      proofUrl: null,
      proofKey: null,
      ordererUserId: null,
      containerId: null,
      parcelId: null,
      clientId: null,
    },
  });

  const proofUrl = watch('proofUrl');

  // Cache id->label des ordonnateurs renvoyes par le searcher, pour
  // pouvoir auto-remplir `orderer` (nom snapshote) a la selection.
  const ordererCacheRef = useRef<Map<string, string>>(new Map());
  const ordererSearcher = useMemo(() => {
    const fn = async (q: string, limit?: number) => {
      const options = await searchers.employeesByPermission(q, limit, { key: ORDERER_PERMISSION });
      for (const o of options) ordererCacheRef.current.set(o.value, o.label);
      return options;
    };
    (fn as any).searchKey = `searchers.employeesByPermission.${ORDERER_PERMISSION}`;
    return fn;
  }, []);

  const handleProofUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const res = await uploadImage(file);
      setValue('proofUrl', res.url, { shouldValidate: true });
      setValue('proofKey', res.key);
    } finally {
      setUploading(false);
    }
  }, [setValue]);

  const onSubmit = (data: CreateDisbursementInput) => {
    mutation.mutate(data);
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Nouveau bon de decaissement"
      size="lg"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>Annuler</AppButton>
          <AppButton type="submit" form="disbursement-form" loading={mutation.isPending}>Creer</AppButton>
        </>
      }
    >
      <form id="disbursement-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Controller
          name="agencyId"
          control={control}
          render={({ field }) => (
            <AppSearchSelect
              label="Agence"
              value={field.value}
              onChange={(v) => field.onChange(v ?? '')}
              search={searchers.myAgencies}
              error={errors.agencyId?.message}
              required
              placeholder="Selectionner une agence"
            />
          )}
        />

        <AppInput label="Motif" {...register('reason')} error={errors.reason?.message} />
        <AppTextarea
          label="Description"
          rows={3}
          placeholder="Detail du decaissement (optionnel)"
          {...register('description')}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Controller
            name="ordererUserId"
            control={control}
            render={({ field }) => (
              <AppSearchSelect
                label="Ordonnateur (employe habilite)"
                value={field.value ?? undefined}
                onChange={(v) => {
                  field.onChange(v ?? null);
                  if (v) {
                    const name = ordererCacheRef.current.get(v);
                    if (name) setValue('orderer', name, { shouldValidate: true });
                  }
                }}
                search={ordererSearcher}
                error={errors.ordererUserId?.message}
                placeholder="Rechercher un ordonnateur"
              />
            )}
          />
          <AppInput
            label="Ordonnateur (nom snapshote)"
            {...register('orderer')}
            error={errors.orderer?.message}
            placeholder="Auto-rempli a la selection"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <AppInput label="Montant" type="number" step="0.01" {...register('amount', { valueAsNumber: true })} error={errors.amount?.message} />
          <AppInput label="Montant en lettres" {...register('amountInWords')} error={errors.amountInWords?.message} />
        </div>

        <div className="space-y-2">
          <ImageInput
            label="Justificatif (facture, recu...)"
            value={proofUrl ?? null}
            onFile={handleProofUpload}
            onClear={() => {
              setValue('proofUrl', null);
              setValue('proofKey', null);
            }}
            uploading={uploading}
          />
          <AppTextarea
            label="Commentaire justificatif"
            rows={2}
            placeholder="Numero de facture, devis, etc."
            {...register('justificationDescription')}
          />
        </div>

        <div className="border-t pt-3 space-y-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Imputation (optionnel)</p>
          <Controller
            name="containerId"
            control={control}
            render={({ field }) => (
              <AppSearchSelect
                label="Conteneur"
                value={field.value ?? undefined}
                onChange={(v) => field.onChange(v ?? null)}
                search={searchers.containers}
                error={errors.containerId?.message}
                placeholder="Rechercher un conteneur"
              />
            )}
          />
          <Controller
            name="parcelId"
            control={control}
            render={({ field }) => (
              <AppSearchSelect
                label="Colis"
                value={field.value ?? undefined}
                onChange={(v) => field.onChange(v ?? null)}
                search={searchers.parcels}
                error={errors.parcelId?.message}
                placeholder="Rechercher un colis"
              />
            )}
          />
          <Controller
            name="clientId"
            control={control}
            render={({ field }) => (
              <AppSearchSelect
                label="Client"
                value={field.value ?? undefined}
                onChange={(v) => field.onChange(v ?? null)}
                search={searchers.clients}
                error={errors.clientId?.message}
                placeholder="Rechercher un client"
              />
            )}
          />
        </div>
      </form>
    </AppDialog>
  );
}
