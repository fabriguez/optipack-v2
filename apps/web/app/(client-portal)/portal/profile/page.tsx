'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Camera, IdCard, ShieldCheck, ShieldAlert, Clock, Lock } from 'lucide-react';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppBadge } from '@/components/ui/AppBadge';
import { clientPortalApi } from '@/lib/api/client-portal';

interface PortalMe {
  id: string;
  fullName: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  imageUrl?: string | null;
  idDocumentUrl?: string | null;
  idDocumentBackUrl?: string | null;
  idVerificationStatus?: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  idVerifiedAt?: string | null;
  idExpiryDate?: string | null;
  idRejectionReason?: string | null;
}

function StatusBadge({ status }: { status: PortalMe['idVerificationStatus'] }) {
  switch (status) {
    case 'APPROVED':
      return (
        <AppBadge variant="success">
          <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />Validé</span>
        </AppBadge>
      );
    case 'PENDING':
      return (
        <AppBadge variant="warning">
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />En attente</span>
        </AppBadge>
      );
    case 'REJECTED':
      return (
        <AppBadge variant="error">
          <span className="inline-flex items-center gap-1"><ShieldAlert className="h-3.5 w-3.5" />Refusé</span>
        </AppBadge>
      );
    default:
      return <AppBadge variant="default">Non soumis</AppBadge>;
  }
}

export default function PortalProfilePage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['portal', 'me'],
    queryFn: () => clientPortalApi.me(),
  });
  const me = (data?.data ?? {}) as PortalMe;

  const isApproved = me.idVerificationStatus === 'APPROVED';
  const expiryFuture = me.idExpiryDate ? new Date(me.idExpiryDate) > new Date() : false;
  const locked = isApproved && (!me.idExpiryDate || expiryFuture);

  const [form, setForm] = useState({ fullName: '', phone: '', email: '', address: '' });
  useEffect(() => {
    setForm({
      fullName: me.fullName ?? '',
      phone: me.phone ?? '',
      email: me.email ?? '',
      address: me.address ?? '',
    });
  }, [me.fullName, me.phone, me.email, me.address]);

  const updateMutation = useMutation({
    mutationFn: (v: typeof form) => clientPortalApi.updateProfile(v),
    onSuccess: () => {
      toast.success('Profil mis à jour');
      qc.invalidateQueries({ queryKey: ['portal', 'me'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Échec'),
  });

  const uploadMutation = useMutation({
    mutationFn: ({ slot, file }: { slot: 'avatar' | 'idDocument' | 'idDocumentBack'; file: File }) =>
      clientPortalApi.uploadDocument(slot, file),
    onSuccess: () => {
      toast.success('Document envoyé');
      qc.invalidateQueries({ queryKey: ['portal', 'me'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Échec envoi'),
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-500">Chargement...</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Mon profil</h1>
          <p className="text-sm text-gray-500 mt-1">Coordonnées et vérification d'identité</p>
        </div>
        <StatusBadge status={me.idVerificationStatus} />
      </div>

      {locked && (
        <AppCard className="border-primary-200 bg-primary-50/40">
          <div className="flex items-start gap-3">
            <Lock className="h-5 w-5 text-primary-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-primary-900">Profil verrouillé</p>
              <p className="text-xs text-primary-800 mt-1">
                Vos documents sont validés{me.idExpiryDate ? ` jusqu'au ${me.idExpiryDate.slice(0, 10)}` : ''}.
                Modification possible après péremption.
              </p>
            </div>
          </div>
        </AppCard>
      )}

      {me.idVerificationStatus === 'REJECTED' && me.idRejectionReason && (
        <AppCard className="border-red-200 bg-red-50/40">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-red-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-900">Documents refusés</p>
              <p className="text-xs text-red-800 mt-1">{me.idRejectionReason}</p>
              <p className="text-xs text-red-800 mt-1">Téléversez de nouveaux documents pour resoumettre.</p>
            </div>
          </div>
        </AppCard>
      )}

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <AppCard className="lg:col-span-1 flex flex-col items-center text-center">
          <AvatarSlot
            uri={me.imageUrl}
            uploading={uploadMutation.isPending && uploadMutation.variables?.slot === 'avatar'}
            onPick={(file) => uploadMutation.mutate({ slot: 'avatar', file })}
          />
          <p className="mt-3 text-base font-semibold text-gray-900">{me.fullName}</p>
          <p className="text-xs text-gray-500">{me.phone}</p>
          {me.email && <p className="text-xs text-gray-500">{me.email}</p>}
        </AppCard>

        <AppCard className="lg:col-span-2">
          <AppCardHeader title="Informations" description="Coordonnées de contact" />
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              updateMutation.mutate(form);
            }}
          >
            <AppInput
              label="Nom complet"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              disabled={locked}
              required
            />
            <AppInput
              label="Téléphone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              disabled={locked}
              required
            />
            <AppInput
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              disabled={locked}
            />
            <AppInput
              label="Adresse"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              disabled={locked}
            />
            <div className="sm:col-span-2 flex justify-end">
              <AppButton type="submit" loading={updateMutation.isPending} disabled={locked}>
                {locked ? 'Verrouillé' : 'Enregistrer'}
              </AppButton>
            </div>
          </form>
        </AppCard>
      </div>

      <AppCard>
        <AppCardHeader
          title="Pièce d'identité"
          description="Recto + verso. Validation par nos équipes après envoi."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <DocSlot
            label="Recto"
            uri={me.idDocumentUrl}
            disabled={locked}
            uploading={uploadMutation.isPending && uploadMutation.variables?.slot === 'idDocument'}
            onPick={(file) => uploadMutation.mutate({ slot: 'idDocument', file })}
          />
          <DocSlot
            label="Verso"
            uri={me.idDocumentBackUrl}
            disabled={locked}
            uploading={uploadMutation.isPending && uploadMutation.variables?.slot === 'idDocumentBack'}
            onPick={(file) => uploadMutation.mutate({ slot: 'idDocumentBack', file })}
          />
        </div>
        {!locked && (
          <p className="mt-3 text-xs text-gray-500">
            JPG, PNG ou WEBP. 5 Mo max. À chaque modification, statut revient en attente.
          </p>
        )}
      </AppCard>
    </div>
  );
}

function AvatarSlot({
  uri,
  uploading,
  onPick,
}: {
  uri?: string | null;
  uploading: boolean;
  onPick: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="relative h-28 w-28 rounded-full overflow-hidden bg-primary-50 flex items-center justify-center border border-primary-100"
      >
        {uri ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={uri} alt="avatar" className="h-full w-full object-cover" />
        ) : (
          <Camera className="h-8 w-8 text-primary-600" />
        )}
        {uploading && <div className="absolute inset-0 bg-black/40 animate-pulse" />}
        <div className="absolute bottom-1 right-1 h-7 w-7 rounded-full bg-primary-500 text-white flex items-center justify-center border-2 border-white">
          <Camera className="h-3.5 w-3.5" />
        </div>
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = '';
        }}
      />
    </>
  );
}

function DocSlot({
  label,
  uri,
  uploading,
  disabled,
  onPick,
}: {
  label: string;
  uri?: string | null;
  uploading: boolean;
  disabled?: boolean;
  onPick: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      disabled={disabled || uploading}
      onClick={() => ref.current?.click()}
      className="group relative rounded-xl border border-dashed border-gray-300 p-4 flex items-center gap-3 hover:border-primary-400 hover:bg-primary-50/30 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <div className="h-16 w-16 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
        {uri ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={uri} alt={label} className="h-full w-full object-cover" />
        ) : (
          <IdCard className="h-6 w-6 text-gray-400" />
        )}
      </div>
      <div className="text-left">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{uri ? 'Modifier' : 'Cliquer pour ajouter'}</p>
        {uploading && <p className="text-xs text-primary-600 mt-1">Envoi en cours...</p>}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = '';
        }}
      />
    </button>
  );
}
