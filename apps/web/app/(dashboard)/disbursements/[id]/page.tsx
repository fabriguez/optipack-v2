'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Receipt, Building2, UserCircle, FileText, AlertTriangle, Ban } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { MaskedValue, isMasked } from '@/components/ui/MaskedValue';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { AttachmentsCard } from '@/components/shared/AttachmentsCard';
import { Can } from '@/lib/components/Can';
import { toast } from 'sonner';

export default function DisbursementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['disbursements', id],
    queryFn: () => apiClient.get(`/disbursements/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const voidMutation = useMutation({
    mutationFn: (reason: string) => apiClient.post(`/disbursements/${id}/void`, { reason }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['disbursements'] });
      toast.success('Bon de decaissement annule');
      setShowVoid(false);
      setVoidReason('');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Erreur lors de l'annulation"),
  });

  const voucher = data?.data;
  if (isLoading) return <DashboardSkeleton />;
  if (!voucher) return <p className="p-6 text-gray-500">Bon de decaissement introuvable</p>;

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="rounded-xl p-2 hover:bg-gray-100 transition-colors">
              <ArrowLeft className="h-5 w-5 text-gray-500" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">Bon {voucher.reference}</h1>
                <AppBadge variant={voucher.isVoided ? 'error' : 'success'}>{voucher.isVoided ? 'Annule' : 'Valide'}</AppBadge>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">Emis le {formatDate(voucher.createdAt)}</p>
            </div>
          </div>
          {!voucher.isVoided && (
            <Can permission="disbursement.void">
              <AppButton variant="outline" onClick={() => setShowVoid(true)}>
                <Ban className="h-4 w-4 text-red-600" />
                Annuler
              </AppButton>
            </Can>
          )}
        </div>

        <AppDialog
          open={showVoid}
          onClose={() => setShowVoid(false)}
          title="Annuler le bon de decaissement"
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
          <p className="text-sm text-gray-600 mb-3">Cette action est irreversible. Le bon ne sera plus considere comme valide.</p>
          <AppInput label="Motif (optionnel)" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
        </AppDialog>

        {/* Voided warning */}
        {voucher.isVoided && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">Ce bon de decaissement a ete annule</p>
              {voucher.voidReason && <p className="text-sm text-red-600 mt-1">Motif : {voucher.voidReason}</p>}
              {voucher.voidedAt && <p className="text-xs text-red-500 mt-1">Annule le {formatDate(voucher.voidedAt)}</p>}
            </div>
          </div>
        )}

        {/* Amount card */}
        <AppCard>
          <div className="text-center py-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Montant</p>
            <p className="text-3xl font-bold text-gray-900">{formatAmount(Number(voucher.amount))}</p>
            {voucher.amountInWords && (
              <p className="text-sm text-gray-500 mt-1 italic">{voucher.amountInWords}</p>
            )}
          </div>
        </AppCard>

        {/* Info cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <Building2 className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Agence</p>
                {voucher.agency ? (
                  <Link href={`/agencies/${voucher.agency.id}`} className="text-sm font-medium text-primary-700 hover:underline">
                    {voucher.agency.name}
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-gray-900">{voucher.agencyId}</p>
                )}
              </div>
            </div>
          </AppCard>

          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <UserCircle className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Emis par</p>
                <p className="text-sm font-medium text-gray-900">
                  {isMasked(voucher.issuedBy) ? <MaskedValue value={voucher.issuedBy} /> : voucher.issuedBy?.firstName ? `${voucher.issuedBy.firstName} ${voucher.issuedBy.lastName}` : voucher.issuedByUserId}
                </p>
              </div>
            </div>
          </AppCard>

          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <UserCircle className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Ordonnateur</p>
                <p className="text-sm font-medium text-gray-900">{voucher.orderer}</p>
              </div>
            </div>
          </AppCard>
        </div>

        {/* Details */}
        <AppCard>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Details</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoRow icon={Receipt} label="Reference" value={voucher.reference} />
            <InfoRow icon={FileText} label="Motif" value={voucher.reason} />
            {voucher.description && <InfoRow icon={FileText} label="Description" value={voucher.description} />}
            <InfoRow icon={Receipt} label="Montant" value={formatAmount(Number(voucher.amount))} />
          </div>
        </AppCard>

        <AttachmentsCard parentType="disbursement" parentId={voucher.id} readonly={!!voucher.isVoided} />
      </div>
    </PageTransition>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
      <Icon className="h-4 w-4 text-gray-400 shrink-0" />
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-900">{value}</p>
      </div>
    </div>
  );
}
