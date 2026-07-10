
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldCheck, ShieldAlert, Clock, IdCard } from 'lucide-react';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { apiClient } from '@/lib/api/client';
import { extractApiError } from '@/lib/api/errorMessage';
import { AuthedImage, openAuthedFile } from '@/components/shared/AuthedImage';
import { Can } from '@/lib/components/Can';

interface PendingClient {
  id: string;
  fullName: string;
  phone: string;
  email?: string | null;
  idNumber?: string | null;
  imageUrl?: string | null;
  idDocumentUrl?: string | null;
  idDocumentBackUrl?: string | null;
  updatedAt: string;
  agency?: { id: string; name: string } | null;
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export default function ClientsKycPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['clients', 'kyc', 'pending'],
    queryFn: () => apiClient.get('/clients/kyc/pending').then((r) => r.data),
  });

  const items = (data?.data ?? []) as PendingClient[];
  const total = data?.total ?? items.length;

  const [target, setTarget] = useState<PendingClient | null>(null);
  const [mode, setMode] = useState<'approve' | 'reject' | null>(null);

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Validation KYC</h1>
          <p className="text-sm text-gray-500 mt-1">Pièces d'identité clients en attente</p>
        </div>
        <AppBadge variant="warning">
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{total} en attente</span>
        </AppBadge>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Chargement...</p>
      ) : items.length === 0 ? (
        <AppCard className="text-center py-12 text-gray-500">
          <ShieldCheck className="h-10 w-10 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">Aucune validation en attente</p>
        </AppCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => (
            <AppCard key={c.id}>
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-full bg-primary-50 flex items-center justify-center overflow-hidden shrink-0">
                  <AuthedImage
                    src={c.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    fallback={<IdCard className="h-5 w-5 text-primary-600" />}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{c.fullName}</p>
                  <p className="text-xs text-gray-500">{c.phone}</p>
                  {c.agency?.name && <p className="text-xs text-gray-400 mt-0.5">{c.agency.name}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4">
                <DocPreview label="Recto" uri={c.idDocumentUrl} />
                <DocPreview label="Verso" uri={c.idDocumentBackUrl} />
              </div>

              {/* Decision KYC : reservee aux detenteurs de kyc.validate */}
              <Can permission="kyc.validate">
                <div className="flex gap-2 mt-4">
                  <AppButton
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setTarget(c);
                      setMode('reject');
                    }}
                  >
                    Refuser
                  </AppButton>
                  <AppButton
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setTarget(c);
                      setMode('approve');
                    }}
                  >
                    Valider
                  </AppButton>
                </div>
              </Can>
            </AppCard>
          ))}
        </div>
      )}

      {target && mode && (
        <VerifyDialog
          client={target}
          mode={mode}
          onClose={() => {
            setTarget(null);
            setMode(null);
          }}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ['clients', 'kyc', 'pending'] });
            setTarget(null);
            setMode(null);
          }}
        />
      )}
    </div>
  );
}

function DocPreview({ label, uri }: { label: string; uri?: string | null }) {
  if (!uri) {
    return (
      <div className="aspect-[3/2] rounded-lg border border-dashed border-gray-200 flex items-center justify-center text-xs text-gray-400">
        {label} manquant
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => openAuthedFile(uri).catch(() => {})}
      className="aspect-[3/2] rounded-lg overflow-hidden bg-gray-100 block group relative w-full"
    >
      <AuthedImage
        src={uri}
        alt={label}
        className="h-full w-full object-cover"
        fallback={
          <span className="flex h-full w-full items-center justify-center text-xs text-gray-400">
            {label}
          </span>
        }
      />
      <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
        {label}
      </span>
    </button>
  );
}

function VerifyDialog({
  client,
  mode,
  onClose,
  onDone,
}: {
  client: PendingClient;
  mode: 'approve' | 'reject';
  onClose: () => void;
  onDone: () => void;
}) {
  const defaultExpiry = new Date(Date.now() + ONE_YEAR_MS).toISOString().slice(0, 10);
  const [expiry, setExpiry] = useState(defaultExpiry);
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      apiClient
        .post(`/clients/${client.id}/verify`, {
          decision: mode === 'approve' ? 'APPROVED' : 'REJECTED',
          ...(mode === 'approve' ? { expiryDate: new Date(expiry).toISOString() } : { reason }),
        })
        .then((r) => r.data),
    onSuccess: () => {
      toast.success(mode === 'approve' ? 'Client validé' : 'Documents refusés');
      onDone();
    },
    onError: (e) => toast.error(extractApiError(e, 'Échec')),
  });

  return (
    <AppDialog
      open
      onClose={onClose}
      title={mode === 'approve' ? `Valider ${client.fullName}` : `Refuser ${client.fullName}`}
      description={mode === 'approve' ? "Définir la date d'expiration" : 'Motif du refus'}
      footer={
        <>
          <AppButton variant="outline" onClick={onClose}>
            Annuler
          </AppButton>
          <AppButton
            variant={mode === 'approve' ? 'primary' : 'destructive'}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
            disabled={mode === 'reject' && reason.trim().length === 0}
          >
            <span className="inline-flex items-center gap-1.5">
              {mode === 'approve' ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
              {mode === 'approve' ? 'Valider' : 'Refuser'}
            </span>
          </AppButton>
        </>
      }
    >
      {mode === 'approve' ? (
        <div className="space-y-3">
          <AppInput
            label="Date d'expiration"
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
            required
          />
          <p className="text-xs text-gray-500">
            Après validation, le profil + documents seront verrouillés jusqu'à cette date.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="text-xs font-medium text-gray-700">Motif du refus</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none"
            placeholder="Ex : document illisible, recto/verso manquant..."
          />
        </div>
      )}
    </AppDialog>
  );
}
