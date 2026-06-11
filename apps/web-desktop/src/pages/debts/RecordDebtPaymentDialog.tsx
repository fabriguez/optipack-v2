import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  recordDebtPaymentSchema,
  type RecordDebtPaymentInput,
} from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { AppTextarea } from '@/components/ui/AppTextarea';
import { searchers } from '@/lib/api/searchers';
import { apiClient } from '@/lib/api/client';
import { uploadFile } from '@/lib/api/uploads';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Paperclip } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  debtId: string;
  defaultAgencyId?: string | null;
  remainingAmount: number;
  onRecorded?: () => void;
}

export function RecordDebtPaymentDialog({
  open,
  onClose,
  debtId,
  defaultAgencyId,
  remainingAmount,
  onRecorded,
}: Props) {
  const qc = useQueryClient();
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<RecordDebtPaymentInput>({
    resolver: zodResolver(recordDebtPaymentSchema),
    defaultValues: {
      agencyId: defaultAgencyId ?? undefined,
    },
  });

  // Reset a chaque ouverture pour eviter de garder l'etat d'un debt precedent.
  useEffect(() => {
    if (open) {
      reset({ agencyId: defaultAgencyId ?? undefined });
      setProofFile(null);
    }
  }, [open, defaultAgencyId, reset]);

  const mutation = useMutation({
    mutationFn: async (data: RecordDebtPaymentInput) => {
      // Si un fichier est selectionne, on l'upload d'abord pour recuperer
      // l'URL/key MinIO et les inclure dans le payload paiement.
      let proofUrl: string | undefined;
      let proofKey: string | undefined;
      if (proofFile) {
        setUploading(true);
        try {
          const up = await uploadFile(proofFile);
          proofUrl = up.url;
          proofKey = up.key;
        } finally {
          setUploading(false);
        }
      }
      const payload = { ...data, proofUrl, proofKey };
      const res = await apiClient.post(`/debts/${debtId}/payments`, payload);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debts', debtId] });
      qc.invalidateQueries({ queryKey: ['debts'] });
      toast.success('Paiement enregistre');
      onRecorded?.();
      onClose();
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || "Echec de l'enregistrement");
    },
  });

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Enregistrer un paiement"
      size="md"
      footer={
        <>
          <AppButton variant="ghost" onClick={onClose}>
            Annuler
          </AppButton>
          <AppButton
            type="submit"
            form="record-debt-payment-form"
            loading={mutation.isPending || uploading}
          >
            Enregistrer
          </AppButton>
        </>
      }
    >
      <form
        id="record-debt-payment-form"
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        className="space-y-4"
      >
        <div className="rounded-xl bg-gray-50 p-3 text-xs text-gray-700">
          Solde restant a payer :{' '}
          <span className="font-bold text-red-700">{remainingAmount.toLocaleString()} XAF</span>
        </div>

        <AppInput
          label="Montant"
          type="number"
          step="0.01"
          {...register('amount', { valueAsNumber: true })}
          error={errors.amount?.message}
          placeholder={`Max ${remainingAmount}`}
        />

        <AppSelect
          label="Mode de paiement"
          {...register('paymentMethod')}
          error={errors.paymentMethod?.message}
          options={[
            { value: 'CASH', label: 'Especes' },
            { value: 'MOBILE_MONEY', label: 'Mobile Money' },
            { value: 'BANK_TRANSFER', label: 'Virement' },
            { value: 'CARD', label: 'Carte' },
            { value: 'CHECK', label: 'Cheque' },
          ]}
          placeholder="Selectionner"
        />

        <Controller
          control={control}
          name="agencyId"
          render={({ field }) => (
            <AppSearchSelect
              label="Agence encaisseuse"
              value={field.value || null}
              onChange={(v) => field.onChange(v ?? '')}
              search={searchers.agencies}
              error={errors.agencyId?.message}
              required
            />
          )}
        />

        <AppInput
          label="Reference transaction (optionnel)"
          {...register('transactionReference')}
          placeholder="Ref MoMo, n cheque, ref virement..."
        />

        {/* Justificatif : photo ou PDF. Le fichier est uploade au submit ;
            l'URL MinIO renvoyee est attachee au paiement (proofUrl). */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Justificatif (image ou PDF, optionnel)
          </label>
          <div className="flex items-center gap-2">
            <input
              id="debt-payment-proof"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <label
              htmlFor="debt-payment-proof"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
            >
              <Paperclip className="h-4 w-4" />
              {proofFile ? proofFile.name : 'Choisir un fichier'}
            </label>
            {proofFile && (
              <button
                type="button"
                onClick={() => setProofFile(null)}
                className="text-xs text-red-600 hover:underline"
              >
                Retirer
              </button>
            )}
          </div>
          <p className="mt-1 text-[11px] text-gray-500">
            Recommande pour MoMo / Virement / Cheque (preuve de transaction).
          </p>
        </div>

        <AppTextarea
          label="Commentaire (optionnel)"
          rows={2}
          {...register('comment')}
          placeholder="Note interne, contexte du paiement"
        />
      </form>
    </AppDialog>
  );
}
