import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFundTransferSchema, type CreateFundTransferInput } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { searchers } from '@/lib/api/searchers';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fundTransfersApi } from '@/lib/api/finance';
import { usePaymentMethods, type PaymentMethodItem } from '@/lib/hooks/usePaymentMethods';
import { toast } from 'sonner';

interface Props { open: boolean; onClose: () => void; }

export function FundTransferFormDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const { data: methodsData } = usePaymentMethods();
  const methodOptions = ((methodsData?.data ?? []) as PaymentMethodItem[])
    .filter((m) => m.isActive)
    .map((m) => ({ value: m.code, label: m.label }));
  const mutation = useMutation({
    mutationFn: (data: CreateFundTransferInput) => fundTransfersApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fund-transfers'] }); qc.invalidateQueries({ queryKey: ['cash-register'] }); toast.success('Transfert cree'); onClose(); },
    onError: () => toast.error('Erreur (solde insuffisant ?)'),
  });

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<CreateFundTransferInput>({
    resolver: zodResolver(createFundTransferSchema),
  });

  const onSubmit = (data: CreateFundTransferInput) => { mutation.mutate(data); reset(); };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Nouveau transfert de fonds"
      size="md"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>Annuler</AppButton>
          <AppButton type="submit" form="fund-transfer-form" loading={mutation.isPending}>Creer</AppButton>
        </>
      }
    >
      <form id="fund-transfer-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Controller
          name="sourceAgencyId"
          control={control}
          render={({ field }) => (
            <AppSearchSelect
              label="Agence source"
              value={field.value}
              onChange={(v) => field.onChange(v ?? '')}
              search={searchers.agencies}
              error={errors.sourceAgencyId?.message}
              required
              placeholder="Selectionner une agence"
            />
          )}
        />
        <AppSelect label="Destination" {...register('destinationType')} error={errors.destinationType?.message}
          options={[{ value: 'HQ', label: 'Siege' }, { value: 'BANK', label: 'Banque' }, { value: 'AGENCY', label: 'Autre agence' }]} placeholder="Selectionner" />
        <AppSelect
          label="Mode de transfert"
          {...register('transferMethod')}
          error={errors.transferMethod?.message}
          options={methodOptions}
          placeholder="Selectionner"
        />
        <div className="grid grid-cols-2 gap-3">
          <AppSelect
            label="Methode source (canal)"
            {...register('sourcePaymentMethod')}
            error={errors.sourcePaymentMethod?.message}
            options={methodOptions}
            placeholder="Selectionner"
          />
          <AppSelect
            label="Methode destination (canal)"
            {...register('destinationPaymentMethod')}
            error={errors.destinationPaymentMethod?.message}
            options={methodOptions}
            placeholder="Selectionner"
          />
        </div>
        <AppInput label="Montant" type="number" step="0.01" {...register('amount', { valueAsNumber: true })} error={errors.amount?.message} />
      </form>
    </AppDialog>
  );
}
