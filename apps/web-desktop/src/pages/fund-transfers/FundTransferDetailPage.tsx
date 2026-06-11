import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRightLeft, Building2, UserCircle, CheckCircle, AlertTriangle, Ban } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { AttachmentsCard } from '@/components/shared/AttachmentsCard';
import { toast } from 'sonner';

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'error'> = {
  PENDING: 'warning', CONFIRMED: 'success', VOIDED: 'error',
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'En attente', CONFIRMED: 'Confirme', VOIDED: 'Annule',
};

const DEST_LABEL: Record<string, string> = {
  HQ: 'Siege', BANK: 'Banque', AGENCY: 'Agence',
};

export default function FundTransferDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);
  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['fund-transfers', id],
    queryFn: () => apiClient.get(`/fund-transfers/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const confirmMutation = useMutation({
    mutationFn: () => apiClient.post(`/fund-transfers/${id}/confirm`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fund-transfers'] });
      qc.invalidateQueries({ queryKey: ['fund-transfers', id] });
      qc.invalidateQueries({ queryKey: ['cash-register'] });
      toast.success('Transfert confirme');
      setShowConfirm(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur lors de la confirmation'),
  });

  const voidMutation = useMutation({
    mutationFn: (reason: string) => apiClient.post(`/fund-transfers/${id}/void`, { reason }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fund-transfers'] });
      toast.success('Transfert annule');
      setShowVoid(false);
      setVoidReason('');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Erreur lors de l'annulation"),
  });

  const transfer = data?.data;
  if (isLoading) return <DashboardSkeleton />;
  if (!transfer) return <p className="p-6 text-gray-500">Transfert introuvable</p>;

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="rounded-xl p-2 hover:bg-gray-100 transition-colors">
              <ArrowLeft className="h-5 w-5 text-gray-500" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">Transfert {transfer.reference}</h1>
                <AppBadge variant={STATUS_VARIANT[transfer.status] || 'default'}>
                  {STATUS_LABEL[transfer.status] || transfer.status}
                </AppBadge>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">Cree le {formatDate(transfer.createdAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {transfer.status === 'PENDING' && (
              <AppButton onClick={() => setShowConfirm(true)}>
                <CheckCircle className="h-4 w-4" />
                Confirmer
              </AppButton>
            )}
            {!transfer.isVoided && transfer.status !== 'VOIDED' && (
              <AppButton variant="outline" onClick={() => setShowVoid(true)}>
                <Ban className="h-4 w-4 text-red-600" />
                Annuler
              </AppButton>
            )}
          </div>
        </div>

        {/* Voided warning */}
        {transfer.isVoided && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">Ce transfert a ete annule</p>
              {transfer.voidReason && <p className="text-sm text-red-600 mt-1">Motif : {transfer.voidReason}</p>}
            </div>
          </div>
        )}

        {/* Amount */}
        <AppCard>
          <div className="text-center py-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Montant du transfert</p>
            <p className="text-3xl font-bold text-gray-900">{formatAmount(Number(transfer.amount))}</p>
            <p className="text-sm text-gray-500 mt-1">Methode: {transfer.transferMethod}</p>
          </div>
        </AppCard>

        {/* Transfer visual */}
        <AppCard>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50">
                <Building2 className="h-6 w-6 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Source</p>
                {transfer.sourceAgency ? (
                  <Link to={`/agencies/${transfer.sourceAgency.id}`} className="text-lg font-bold text-primary-700 hover:underline">
                    {transfer.sourceAgency.name}
                  </Link>
                ) : (
                  <p className="text-lg font-bold text-gray-900">{transfer.sourceAgencyId}</p>
                )}
              </div>
            </div>

            <div className="flex flex-col items-center px-6">
              <ArrowRightLeft className="h-8 w-8 text-primary-400" />
            </div>

            <div className="flex items-center gap-3">
              <div>
                <p className="text-xs text-gray-400 text-right">Destination ({DEST_LABEL[transfer.destinationType] || transfer.destinationType})</p>
                {transfer.destinationAgency ? (
                  <Link to={`/agencies/${transfer.destinationAgency.id}`} className="text-lg font-bold text-primary-700 hover:underline text-right block">
                    {transfer.destinationAgency.name}
                  </Link>
                ) : (
                  <p className="text-lg font-bold text-gray-900 text-right">{transfer.destinationLabel || DEST_LABEL[transfer.destinationType] || '-'}</p>
                )}
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50">
                <Building2 className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>
        </AppCard>

        {/* Details */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AppCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Initie par</h3>
            <div className="flex items-center gap-3">
              <UserCircle className="h-5 w-5 text-gray-400" />
              <p className="text-sm font-medium text-gray-900">
                {transfer.initiatedBy?.firstName
                  ? `${transfer.initiatedBy.firstName} ${transfer.initiatedBy.lastName}`
                  : transfer.initiatedByUserId}
              </p>
            </div>
          </AppCard>

          <AppCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Confirme par</h3>
            <div className="flex items-center gap-3">
              <UserCircle className="h-5 w-5 text-gray-400" />
              <p className="text-sm font-medium text-gray-900">
                {transfer.confirmedBy?.firstName
                  ? `${transfer.confirmedBy.firstName} ${transfer.confirmedBy.lastName}`
                  : transfer.status === 'PENDING' ? 'En attente de confirmation' : '-'}
              </p>
            </div>
          </AppCard>
        </div>

        <AttachmentsCard
          parentType="fund-transfer"
          parentId={transfer.id}
          readonly={!!transfer.isVoided}
        />
      </div>

      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => confirmMutation.mutate()}
        title="Confirmer le transfert"
        message={`Confirmer le transfert de ${formatAmount(Number(transfer.amount))} ? Cette action est irreversible.`}
        confirmLabel="Confirmer le transfert"
        loading={confirmMutation.isPending}
      />

      <AppDialog
        open={showVoid}
        onClose={() => setShowVoid(false)}
        title="Annuler le transfert"
        size="sm"
        footer={
          <>
            <AppButton variant="ghost" onClick={() => setShowVoid(false)}>Retour</AppButton>
            <AppButton
              variant="destructive"
              onClick={() => voidMutation.mutate(voidReason || 'Annulation manuelle')}
              loading={voidMutation.isPending}
            >
              Confirmer l'annulation
            </AppButton>
          </>
        }
      >
        <p className="text-sm text-gray-600 mb-3">
          Le transfert sera annule et la caisse source re-creditee de {formatAmount(Number(transfer.amount))}. Cette action est irreversible.
        </p>
        <AppInput label="Motif (optionnel)" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
      </AppDialog>
    </PageTransition>
  );
}
