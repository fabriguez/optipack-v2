'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { AppCheckbox } from '@/components/ui/AppCheckbox';
import { AuthedImage } from '@/components/shared/AuthedImage';
import { searchers } from '@/lib/api/searchers';
import { toast } from 'sonner';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Mode 1 : remise d'un colis enregistre */
  parcel?: {
    id: string;
    trackingNumber: string;
    designation: string;
    recipientId?: string | null;
    recipient?: { id: string; fullName: string; phone?: string | null } | null;
  } | null;
  /** Mode 2 : remise d'un colis non enregistre. Fournir agencyId + warehouseId. */
  untracked?: {
    agencyId: string;
    warehouseId: string;
  } | null;
  onSuccess?: () => void;
}

export function ParcelHandoverDialog({ open, onClose, parcel, untracked, onSuccess }: Props) {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState<string>('');
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [note, setNote] = useState('');
  // Pour le mode untracked
  const [designation, setDesignation] = useState('');
  const [observation, setObservation] = useState('');

  useEffect(() => {
    if (!open) return;
    setClientId(parcel?.recipientId ?? '');
    setIdentityConfirmed(false);
    setNote('');
    setDesignation('');
    setObservation('');
  }, [open, parcel]);

  // Fetch du client selectionne pour afficher ses photos.
  const { data: clientData } = useQuery({
    queryKey: ['clients', clientId],
    queryFn: () => apiClient.get(`/clients/${clientId}`).then((r) => r.data),
    enabled: !!clientId,
  });
  const client = clientData?.data;

  const handoverMutation = useMutation({
    mutationFn: async () => {
      if (parcel) {
        return apiClient.post(`/parcels/${parcel.id}/handover`, {
          receivedByClientId: clientId,
          identityConfirmed,
          note: note || undefined,
        });
      }
      if (untracked) {
        return apiClient.post('/parcels/handover-untracked', {
          agencyId: untracked.agencyId,
          warehouseId: untracked.warehouseId,
          receivedByClientId: clientId,
          designation,
          observation: observation || undefined,
          identityConfirmed,
        });
      }
      throw new Error('Mode invalide');
    },
    onSuccess: () => {
      toast.success('Colis remis au client');
      qc.invalidateQueries({ queryKey: ['parcels'] });
      onSuccess?.();
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur'),
  });

  const canSubmit =
    !!clientId &&
    identityConfirmed &&
    (parcel || (untracked && designation.trim().length > 0));

  const dialogTitle = parcel
    ? `Remettre ${parcel.trackingNumber}`
    : 'Remettre un colis non enregistre';

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={dialogTitle}
      size="lg"
      footer={
        <>
          <AppButton variant="ghost" onClick={onClose}>Annuler</AppButton>
          <AppButton
            onClick={() => handoverMutation.mutate()}
            loading={handoverMutation.isPending}
            disabled={!canSubmit}
          >
            <CheckCircle2 className="h-4 w-4" />
            Confirmer la remise
          </AppButton>
        </>
      }
    >
      <div className="space-y-4">
        {parcel && (
          <div className="rounded-xl bg-gray-50 p-3 text-sm">
            <p className="text-xs text-gray-500">Colis</p>
            <p className="font-mono font-bold text-primary-700">{parcel.trackingNumber}</p>
            <p className="text-gray-700">{parcel.designation}</p>
            {parcel.recipient && (
              <p className="mt-1 text-xs text-gray-500">
                Destinataire enregistre :{' '}
                <span className="font-medium">{parcel.recipient.fullName}</span>
              </p>
            )}
          </div>
        )}

        {untracked && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-amber-900">
              <AlertTriangle className="h-4 w-4" /> Colis non enregistre
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Ce colis n&apos;existe pas dans le systeme. Il sera cree et marque comme remis
              avec tracabilite complete.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <AppInput
                label="Designation"
                placeholder="Ex : Carton bleu sans etiquette"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
              />
              <AppInput
                label="Observation"
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
              />
            </div>
          </div>
        )}

        <AppSearchSelect
          label="Client recepteur (qui retire le colis)"
          value={clientId}
          onChange={(v) => setClientId(v ?? '')}
          search={searchers.clients}
          required
          placeholder="Rechercher un client..."
        />

        {client && (
          <div className="rounded-2xl border border-gray-100 p-3">
            <div className="mb-3 flex items-center gap-3">
              <AuthedImage
                src={client.imageUrl}
                alt={client.fullName}
                className="h-14 w-14 rounded-full object-cover"
                fallback={
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-700">
                    {client.fullName?.[0] ?? '?'}
                  </div>
                }
              />
              <div>
                <p className="font-semibold">{client.fullName}</p>
                <p className="text-xs text-gray-500">
                  {client.phone}
                  {client.idNumber && ` · CNI : ${client.idNumber}`}
                </p>
              </div>
            </div>
            <p className="mb-2 text-xs font-medium text-gray-500">
              Confrontez ces photos avec la personne en face de vous :
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <PhotoSlot title="CNI - Recto" url={client.idDocumentUrl} />
              <PhotoSlot title="CNI - Verso" url={client.idDocumentBackUrl} />
            </div>
          </div>
        )}

        <AppInput
          label="Note de remise (optionnelle)"
          placeholder="Ressemblance OK, procuration verifiee, etc."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <label className="flex items-start gap-2 rounded-xl bg-primary-50 p-3 text-sm">
          <AppCheckbox
            checked={identityConfirmed}
            onCheckedChange={(v) => setIdentityConfirmed(!!v)}
          />
          <span>
            Je confirme avoir confronte l&apos;identite (photo CNI + personne en face) et
            valide la remise du colis.
            <span className="block text-[11px] text-primary-700">
              Cette confirmation est tracee dans l&apos;historique et engage votre
              responsabilite.
            </span>
          </span>
        </label>
      </div>
    </AppDialog>
  );
}

function PhotoSlot({ title, url }: { title: string; url?: string | null }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-2">
      <p className="mb-1 text-xs font-medium text-gray-700">{title}</p>
      {url ? (
        <AuthedImage
          src={url}
          alt={title}
          className="h-40 w-full rounded-lg bg-white object-contain"
          fallback={
            <div className="flex h-40 w-full items-center justify-center rounded-lg bg-white text-xs text-gray-400">
              Photo non chargee
            </div>
          }
        />
      ) : (
        <div className="flex h-40 w-full items-center justify-center rounded-lg bg-white text-xs text-gray-400">
          Pas de photo
        </div>
      )}
    </div>
  );
}
