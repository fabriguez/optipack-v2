'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { recordPaymentSchema, type RecordPaymentInput } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppSearchSelect, type SearchOption } from '@/components/ui/AppSearchSelect';
import { searchers } from '@/lib/api/searchers';
import { useRecordPayment } from '@/lib/hooks/usePayments';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { uploadFile } from '@/lib/api/uploads';
import { toast } from 'sonner';
import { Paperclip, Camera, X, FileText, Image as ImageIcon } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  invoiceId?: string;
  parcelTracking?: string;
}

type PendingAttachment = {
  // Etat avant upload (file local) ou apres upload (url/key).
  localPreviewUrl?: string;
  fileName: string;
  // Apres upload :
  url?: string;
  key?: string;
  kind: 'IMAGE' | 'PDF' | 'OTHER';
  caption?: string;
  uploading?: boolean;
  error?: string;
};

function kindFromFile(file: File): 'IMAGE' | 'PDF' | 'OTHER' {
  if (file.type.startsWith('image/')) return 'IMAGE';
  if (file.type === 'application/pdf') return 'PDF';
  return 'OTHER';
}

export function PaymentFormDialog({ open, onClose, invoiceId, parcelTracking }: Props) {
  const mutation = useRecordPayment();
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);

  // Charge la facture pre-fixee (depuis page detail colis / facture) pour
  // afficher un libelle clair + permettre de scoper sur un colis precis.
  const { data: pinnedInvoiceData } = useQuery({
    queryKey: ['invoice-for-payment', invoiceId],
    queryFn: () => apiClient.get(`/invoices/${invoiceId}`).then((r) => r.data),
    enabled: open && !!invoiceId,
  });
  const pinnedInvoice = pinnedInvoiceData?.data;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
    formState: { errors },
  } = useForm<RecordPaymentInput>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: { invoiceId: invoiceId || '' },
  });

  // Quand on ouvre / change d'invoice pre-fixee, reset le state.
  useEffect(() => {
    if (open) {
      reset({ invoiceId: invoiceId || '' });
      setPendingAttachments([]);
    }
  }, [open, invoiceId, reset]);

  const watchedInvoiceId = watch('invoiceId');
  const watchedParcelId = watch('parcelId');

  // Quand l'utilisateur selectionne une facture via le search, on fetch les
  // colis lies pour proposer le sub-select "Colis".
  const { data: selectedInvoiceData } = useQuery({
    queryKey: ['invoice-for-payment', watchedInvoiceId],
    queryFn: () => apiClient.get(`/invoices/${watchedInvoiceId}`).then((r) => r.data),
    enabled: open && !!watchedInvoiceId && watchedInvoiceId !== invoiceId,
  });
  const activeInvoice = pinnedInvoice ?? selectedInvoiceData?.data;
  const linkedParcels: any[] = activeInvoice?.parcels || [];

  // Searcher facture : reference, client, telephone, tracking colis (le
  // backend gere les 4 dans /invoices?search=...).
  const invoiceSearcher = async (q: string, limit: number): Promise<SearchOption[]> => {
    const r = await apiClient.get('/invoices', {
      params: { search: q, limit, status: '!PAID' /* ignored by backend, harmless */ },
    });
    const list = (r.data?.data || []) as any[];
    return list
      .filter((inv) => inv.status !== 'PAID' && inv.status !== 'CANCELLED')
      .map((inv) => ({
        value: inv.id,
        label: `${inv.reference} - ${inv.client?.fullName || ''}`,
        sublabel: `Solde ${Number(inv.balance).toLocaleString()} XAF${inv.client?.phone ? ` - ${inv.client.phone}` : ''}`,
      }));
  };

  const onFilesPicked = (files: FileList | null) => {
    if (!files) return;
    const next: PendingAttachment[] = Array.from(files).map((f) => ({
      localPreviewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
      fileName: f.name,
      kind: kindFromFile(f),
      uploading: true,
    }));
    setPendingAttachments((prev) => [...prev, ...next]);
    // Upload chacun en arriere-plan ; on remplace l'item au fil des callbacks.
    Array.from(files).forEach((file, idx) => {
      const indexInBatch = pendingAttachments.length + idx;
      uploadFile(file)
        .then((up) => {
          setPendingAttachments((prev) => {
            const cp = [...prev];
            if (cp[indexInBatch]) {
              cp[indexInBatch] = {
                ...cp[indexInBatch],
                uploading: false,
                url: up.url,
                key: up.key,
              };
            }
            return cp;
          });
        })
        .catch((err) => {
          // L'erreur axios encapsule le message backend dans response.data.message.
          // On le surface plutot que le generique "Network Error" / "Echec upload".
          const reason =
            err?.response?.data?.message ||
            err?.response?.data?.error ||
            err?.message ||
            'Echec upload';
          setPendingAttachments((prev) => {
            const cp = [...prev];
            if (cp[indexInBatch]) {
              cp[indexInBatch] = {
                ...cp[indexInBatch],
                uploading: false,
                error: reason,
              };
            }
            return cp;
          });
          toast.error(`Justificatif "${file.name}" : ${reason}`);
        });
    });
  };

  const removeAttachment = (i: number) => {
    setPendingAttachments((prev) => {
      const cp = [...prev];
      const removed = cp.splice(i, 1)[0];
      if (removed?.localPreviewUrl) URL.revokeObjectURL(removed.localPreviewUrl);
      return cp;
    });
  };

  const onSubmit = (data: RecordPaymentInput) => {
    const stillUploading = pendingAttachments.some((a) => a.uploading);
    if (stillUploading) {
      toast.error('Upload des justificatifs encore en cours, patientez...');
      return;
    }
    const validAttachments = pendingAttachments
      .filter((a) => a.url && a.key && !a.error)
      .map((a) => ({
        url: a.url!,
        key: a.key!,
        kind: a.kind,
        caption: a.caption,
      }));
    mutation.mutate(
      {
        ...data,
        // Si invoiceId est pre-fixe, on l'enforce.
        invoiceId: invoiceId || data.invoiceId,
        attachments: validAttachments.length > 0 ? validAttachments : undefined,
      },
      { onSuccess: () => { reset(); setPendingAttachments([]); onClose(); } },
    );
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Enregistrer un paiement"
      size="lg"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>
            Annuler
          </AppButton>
          <AppButton type="submit" form="payment-form" loading={mutation.isPending}>
            Enregistrer
          </AppButton>
        </>
      }
    >
      <form id="payment-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {parcelTracking && (
          <div className="rounded-xl border border-primary-100 bg-primary-50/50 px-3 py-2 text-xs text-primary-900">
            Paiement enregistre pour le colis{' '}
            <span className="font-mono font-bold">{parcelTracking}</span>.
          </div>
        )}

        {/* Facture : pre-fixee ou recherche. Le searcher accepte
            reference / client / telephone / tracking colis. */}
        {invoiceId ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Facture</label>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm">
              <p className="font-semibold text-gray-900">{pinnedInvoice?.reference || invoiceId}</p>
              {pinnedInvoice?.client?.fullName && (
                <p className="text-xs text-gray-600">{pinnedInvoice.client.fullName}{pinnedInvoice.client.phone ? ` - ${pinnedInvoice.client.phone}` : ''}</p>
              )}
              {pinnedInvoice && (
                <p className="text-xs text-gray-500 mt-1">
                  Solde restant :{' '}
                  <span className="font-bold text-red-700">
                    {Number(pinnedInvoice.balance).toLocaleString()} XAF
                  </span>
                </p>
              )}
            </div>
            <input type="hidden" {...register('invoiceId')} value={invoiceId} />
          </div>
        ) : (
          <Controller
            control={control}
            name="invoiceId"
            render={({ field }) => (
              <AppSearchSelect
                label="Facture"
                value={field.value || null}
                onChange={(v) => {
                  field.onChange(v ?? '');
                  setValue('parcelId', undefined);
                }}
                search={invoiceSearcher}
                placeholder="Reference, client, telephone ou tracking colis..."
                error={errors.invoiceId?.message}
                required
              />
            )}
          />
        )}

        {/* Sous-selecteur colis : visible uniquement si la facture couvre
            au moins 2 colis (sinon pas de choix a faire). */}
        {linkedParcels.length > 1 && (
          <Controller
            control={control}
            name="parcelId"
            render={({ field }) => (
              <AppSelect
                label="Scoper le paiement sur un colis (optionnel)"
                value={field.value || ''}
                onValueChange={(v) => field.onChange(v || undefined)}
                options={[
                  { value: '', label: 'Toute la facture (repartition proportionnelle)' },
                  ...linkedParcels.map((p) => ({
                    value: p.id,
                    label: `${p.trackingNumber} - ${p.designation}`,
                  })),
                ]}
                placeholder="Toute la facture"
              />
            )}
          />
        )}

        <Controller
          name="agencyId"
          control={control}
          render={({ field }) => (
            <AppSearchSelect
              label="Agence encaisseuse"
              value={field.value}
              onChange={(v) => field.onChange(v ?? '')}
              search={searchers.agencies}
              error={errors.agencyId?.message}
              placeholder="Selectionner une agence"
              required
            />
          )}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AppInput
            label="Montant"
            type="number"
            step="0.01"
            {...register('amount', { valueAsNumber: true })}
            error={errors.amount?.message}
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
        </div>

        <AppInput
          label="Reference transaction (optionnel)"
          {...register('transactionReference')}
          placeholder="Ref MoMo, n cheque, ref virement..."
        />

        {/* Justificatifs : multi-fichier, capture camera supportee. Chaque
            fichier est uploade immediatement en arriere-plan. */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Justificatifs (images / PDF, plusieurs possibles)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
              <Paperclip className="h-4 w-4" />
              Choisir des fichiers
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={(e) => onFilesPicked(e.target.files)}
                className="hidden"
              />
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
              <Camera className="h-4 w-4" />
              Capturer (camera)
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={(e) => onFilesPicked(e.target.files)}
                className="hidden"
              />
            </label>
          </div>
          {pendingAttachments.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {pendingAttachments.map((a, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-2 py-1.5 text-xs"
                >
                  {a.kind === 'IMAGE' && a.localPreviewUrl ? (
                    <img src={a.localPreviewUrl} alt="" className="h-8 w-8 rounded object-cover" />
                  ) : a.kind === 'IMAGE' ? (
                    <ImageIcon className="h-4 w-4 text-gray-400" />
                  ) : (
                    <FileText className="h-4 w-4 text-gray-400" />
                  )}
                  <span className="flex-1 truncate font-mono">{a.fileName}</span>
                  {a.uploading && <span className="text-[10px] text-gray-500">Upload...</span>}
                  {a.error && <span className="text-[10px] text-red-600">{a.error}</span>}
                  {a.url && !a.uploading && (
                    <span className="text-[10px] text-primary-700">OK</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[11px] text-gray-500">
            Recommande pour MoMo / Virement / Cheque. Photos de recus, captures, ordres signes.
          </p>
        </div>
      </form>
    </AppDialog>
  );
}
