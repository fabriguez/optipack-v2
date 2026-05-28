'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, User, FileText, Calendar, Briefcase, Truck, Building2, CreditCard, Ban, Wrench, History, AlertTriangle } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { formatAmount, formatDate, formatDateTime } from '@transitsoftservices/shared';
import { AttachmentsCard } from '@/components/shared/AttachmentsCard';
import { RecordDebtPaymentDialog } from '../RecordDebtPaymentDialog';
import { AdjustDebtDialog } from '../AdjustDebtDialog';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppTextarea } from '@/components/ui/AppTextarea';
import { toast } from 'sonner';

const STATUS_VARIANT: Record<string, 'warning' | 'info' | 'success' | 'error' | 'default'> = {
  ACTIVE: 'warning',
  PARTIALLY_PAID: 'info',
  CLEARED: 'success',
  OVERDUE: 'error',
  LITIGATED: 'warning',
  CANCELLED: 'default',
};
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  PARTIALLY_PAID: 'Partiellement payee',
  CLEARED: 'Soldee',
  OVERDUE: 'En retard',
  LITIGATED: 'Litigieuse',
  CANCELLED: 'Annulee',
};
const ACTION_LABELS: Record<string, string> = {
  CREATED: 'Dette creee',
  PAYMENT_RECORDED: 'Paiement enregistre',
  PAYMENT_VOIDED: 'Paiement annule',
  ADJUSTED: 'Montant/echeance ajuste',
  STATUS_CHANGED: 'Statut change',
  DUE_DATE_CHANGED: 'Echeance modifiee',
  CANCELLED: 'Dette annulee',
};

export default function DebtDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['debts', id],
    queryFn: () => apiClient.get(`/debts/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const debt = data?.data;
  if (isLoading) return <DashboardSkeleton />;
  if (!debt) return <p className="p-6 text-gray-500">Dette introuvable</p>;

  const totalAmount = Number(debt.totalAmount || 0);
  const remainingAmount = Number(debt.remainingAmount || 0);
  const paidAmount = Number(debt.paidAmount || (totalAmount - remainingAmount));
  const paidPercent = totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0;

  // Timeline merge : paiements + history sous forme d'evenements tries desc.
  type TimelineEvent = {
    id: string;
    when: Date;
    kind: 'payment' | 'history';
    payment?: any;
    history?: any;
  };
  const events: TimelineEvent[] = [
    ...((debt.payments as any[]) ?? []).map((p: any) => ({
      id: `pay-${p.id}`,
      when: new Date(p.createdAt),
      kind: 'payment' as const,
      payment: p,
    })),
    ...((debt.histories as any[]) ?? []).map((h: any) => ({
      id: `hist-${h.id}`,
      when: new Date(h.createdAt),
      kind: 'history' as const,
      history: h,
    })),
  ].sort((a, b) => b.when.getTime() - a.when.getTime());

  // Sous-echeances eventuelles.
  const subDueDates: any[] = Array.isArray(debt.subDueDates) ? debt.subDueDates : [];

  const canAct = debt.status !== 'CANCELLED' && debt.status !== 'CLEARED';

  const handleVoid = async () => {
    if (voidReason.trim().length < 5) {
      toast.error('Raison requise (min 5 caracteres).');
      return;
    }
    setVoiding(true);
    try {
      await apiClient.post(`/debts/${debt.id}/void`, { reason: voidReason });
      toast.success('Dette annulee');
      setVoidOpen(false);
      setVoidReason('');
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Echec de l'annulation");
    } finally {
      setVoiding(false);
    }
  };

  // Bloc tiers : on choisit le bon (client / employe / transporteur /
  // charge / creditor) selon le type. Tous les liens existants sont cliquables.
  const TierBlock = () => {
    switch (debt.type) {
      case 'CLIENT':
        return debt.client ? (
          <Link href={`/clients/${debt.client.id}`} className="text-sm font-medium text-primary-700 hover:underline">
            <User className="inline h-4 w-4 mr-1" />
            {debt.client.fullName}
          </Link>
        ) : null;
      case 'EMPLOYEE':
        return debt.employee ? (
          <Link href={`/employees/${debt.employee.id}`} className="text-sm font-medium text-primary-700 hover:underline">
            <Briefcase className="inline h-4 w-4 mr-1" />
            {debt.employee.fullName}
          </Link>
        ) : null;
      case 'CARRIER':
        return debt.carrier ? (
          <span className="text-sm font-medium text-gray-900">
            <Truck className="inline h-4 w-4 mr-1" />
            {debt.carrier.name}
          </span>
        ) : null;
      case 'AGENCY':
        return (
          <span className="text-sm font-medium text-gray-900">
            <Building2 className="inline h-4 w-4 mr-1" />
            {debt.agencyCharge?.label || debt.creditor || debt.agency?.name || '-'}
          </span>
        );
      default:
        return null;
    }
  };

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
                <h1 className="text-2xl font-bold text-gray-900">Dette</h1>
                <span className="font-mono text-xs text-gray-500">{debt.reference}</span>
                <AppBadge variant={STATUS_VARIANT[debt.status] || 'default'}>
                  {STATUS_LABEL[debt.status] || debt.status}
                </AppBadge>
                <AppBadge variant="default">{debt.type}</AppBadge>
              </div>
              <p className="text-sm text-gray-700 mt-0.5">{debt.motif}</p>
              {debt.description && (
                <p className="text-xs text-gray-500 mt-0.5">{debt.description}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {canAct && (
              <AppButton size="sm" onClick={() => setPaymentOpen(true)}>
                <CreditCard className="h-4 w-4" />
                Enregistrer paiement
              </AppButton>
            )}
            {canAct && (
              <AppButton size="sm" variant="outline" onClick={() => setAdjustOpen(true)}>
                <Wrench className="h-4 w-4" />
                Ajuster
              </AppButton>
            )}
            {canAct && (
              <AppButton size="sm" variant="outline" onClick={() => setVoidOpen(true)}>
                <Ban className="h-4 w-4" />
                Annuler
              </AppButton>
            )}
          </div>
        </div>

        {/* Amount summary */}
        <AppCard>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Montant total</p>
              <p className="text-xl font-bold text-gray-900">{formatAmount(totalAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Paye</p>
              <p className="text-xl font-bold text-green-600">{formatAmount(paidAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Restant</p>
              <p className="text-xl font-bold text-red-600">{formatAmount(remainingAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-2">Progression</p>
              <div className="flex items-center gap-2">
                <div className="h-3 flex-1 rounded-full bg-gray-200">
                  <div
                    className="h-3 rounded-full bg-green-500 transition-all"
                    style={{ width: `${Math.min(paidPercent, 100)}%` }}
                  />
                </div>
                <span className="text-sm font-bold">{paidPercent}%</span>
              </div>
            </div>
          </div>
        </AppCard>

        {/* Info cards : tiers + colis (si rattache) + echeances */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <AppCard>
            <AppCardHeader title="Tiers" description={`Type ${debt.type}`} />
            <TierBlock />
            {debt.invoice && (
              <p className="mt-2 text-xs">
                Facture liee :{' '}
                <Link href={`/invoices/${debt.invoice.id}`} className="font-mono text-primary-700 hover:underline">
                  {debt.invoice.reference}
                </Link>
              </p>
            )}
            {debt.parcel && (
              <p className="mt-2 text-xs">
                Colis lie :{' '}
                <Link href={`/parcels/${debt.parcel.id}`} className="font-mono text-primary-700 hover:underline">
                  {debt.parcel.trackingNumber}
                </Link>
              </p>
            )}
            {debt.agency && (
              <p className="mt-2 text-xs text-gray-500">
                <Building2 className="inline h-3.5 w-3.5 mr-1" />
                {debt.agency.name}
              </p>
            )}
          </AppCard>

          <AppCard>
            <AppCardHeader title="Echeances" />
            <p className="text-sm text-gray-700">
              Prochaine :{' '}
              <span className="font-medium">
                {debt.nextDueDate ? formatDate(debt.nextDueDate) : 'Non definie'}
              </span>
            </p>
            <p className="text-sm text-gray-700 mt-1">
              Finale :{' '}
              <span className="font-medium">
                {debt.dueDateFinal ? formatDate(debt.dueDateFinal) : 'Non definie'}
              </span>
            </p>
          </AppCard>

          {subDueDates.length > 0 && (
            <AppCard>
              <AppCardHeader
                title={`Echeancier (${subDueDates.length})`}
                description="Plan de paiement echelonne"
              />
              <div className="overflow-hidden rounded-xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="p-2 text-left">#</th>
                      <th className="p-2 text-left">Echeance</th>
                      <th className="p-2 text-left">Libelle</th>
                      <th className="p-2 text-right">Montant</th>
                      <th className="p-2 text-center">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {subDueDates.map((s: any, i: number) => {
                      const dueDate = new Date(s.date);
                      const now = new Date();
                      const isOverdue = !s.paid && dueDate < now;
                      return (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="p-2 text-gray-500">{i + 1}</td>
                          <td className={`p-2 whitespace-nowrap ${isOverdue ? 'text-red-700 font-semibold' : 'text-gray-900'}`}>
                            {formatDate(s.date)}
                          </td>
                          <td className="p-2 text-gray-700">{s.label || `Echeance ${i + 1}`}</td>
                          <td className="p-2 text-right font-semibold text-gray-900">{formatAmount(Number(s.amount))}</td>
                          <td className="p-2 text-center">
                            {s.paid ? (
                              <AppBadge variant="success">Paye</AppBadge>
                            ) : isOverdue ? (
                              <AppBadge variant="error">En retard</AppBadge>
                            ) : (
                              <AppBadge variant="warning">Attente</AppBadge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </AppCard>
          )}

          {debt.status === 'CANCELLED' && (
            <AppCard>
              <AppCardHeader title="Annulation" />
              <div className="rounded-xl bg-red-50 p-3">
                <p className="flex items-center gap-1 text-xs font-semibold text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Dette annulee
                </p>
                <p className="mt-1 text-xs text-red-700">
                  {debt.voidedAt && formatDateTime(debt.voidedAt)}
                </p>
                <p className="mt-1 text-xs text-gray-700">{debt.voidReason}</p>
              </div>
            </AppCard>
          )}
        </div>

        {/* Timeline : paiements + audit history fusionnes */}
        <AppCard>
          <AppCardHeader
            title={`Historique (${events.length})`}
            description="Paiements et modifications, du plus recent au plus ancien."
          />
          {events.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-gray-400">
              <History className="h-8 w-8" />
              <p className="text-sm">Aucun evenement.</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-5 top-2 bottom-2 w-px bg-gray-200" />
              <div className="space-y-0">
                {events.map((e) => (
                  <div key={e.id} className="relative flex gap-4 py-3">
                    <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center">
                      <div
                        className={`h-3 w-3 rounded-full border-2 ${
                          e.kind === 'payment'
                            ? 'border-green-500 bg-green-500'
                            : 'border-gray-300 bg-white'
                        }`}
                      />
                    </div>
                    <div className={`flex-1 rounded-xl p-3 ${e.kind === 'payment' ? 'bg-green-50 border border-green-100' : 'bg-gray-50'}`}>
                      {e.kind === 'payment' ? (
                        <>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">
                                Paiement {formatAmount(Number(e.payment.amount))}
                                {e.payment.isVoided && (
                                  <AppBadge variant="error" className="ml-2">
                                    Annule
                                  </AppBadge>
                                )}
                              </p>
                              <p className="text-xs text-gray-500">
                                {e.payment.reference} - {e.payment.paymentMethod}
                                {e.payment.agency?.name && ` - ${e.payment.agency.name}`}
                              </p>
                            </div>
                            <span className="text-xs text-gray-400">
                              {formatDateTime(e.payment.createdAt)}
                            </span>
                          </div>
                          {e.payment.transactionReference && (
                            <p className="mt-1 font-mono text-[11px] text-gray-500">
                              Ref tx : {e.payment.transactionReference}
                            </p>
                          )}
                          {e.payment.comment && (
                            <p className="mt-1 text-xs italic text-gray-600">{e.payment.comment}</p>
                          )}
                          {e.payment.proofUrl && (
                            <a
                              href={e.payment.proofUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-flex items-center gap-1 text-xs text-primary-700 hover:underline"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              Voir justificatif
                            </a>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-900">
                              {ACTION_LABELS[e.history.action] || e.history.action}
                            </p>
                            <span className="text-xs text-gray-400">
                              {formatDateTime(e.history.createdAt)}
                            </span>
                          </div>
                          {e.history.user && (
                            <p className="text-xs text-gray-500">
                              par {e.history.user.firstName} {e.history.user.lastName}
                            </p>
                          )}
                          {e.history.comment && (
                            <p className="mt-1 text-xs italic text-gray-600">{e.history.comment}</p>
                          )}
                          {e.history.changes && Object.keys(e.history.changes).length > 0 && (
                            <details className="mt-1.5 text-xs text-gray-400">
                              <summary className="cursor-pointer hover:text-gray-600">Details</summary>
                              <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-[10px]">
                                {JSON.stringify(e.history.changes, null, 2)}
                              </pre>
                            </details>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </AppCard>

        <AttachmentsCard
          parentType="debt"
          parentId={debt.id}
          readonly={debt.status === 'CANCELLED'}
        />
      </div>

      <RecordDebtPaymentDialog
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        debtId={debt.id}
        defaultAgencyId={debt.agencyId}
        remainingAmount={remainingAmount}
        onRecorded={() => refetch()}
      />
      <AdjustDebtDialog
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        debtId={debt.id}
        currentTotalAmount={totalAmount}
        currentNextDueDate={debt.nextDueDate}
        currentDueDateFinal={debt.dueDateFinal}
        onAdjusted={() => refetch()}
      />
      <AppDialog
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        title="Annuler cette dette"
        size="md"
        footer={
          <>
            <AppButton variant="ghost" onClick={() => setVoidOpen(false)}>
              Retour
            </AppButton>
            <AppButton
              variant="outline"
              onClick={handleVoid}
              loading={voiding}
              className="text-red-700 border-red-200 hover:bg-red-50"
            >
              <Ban className="h-4 w-4" />
              Annuler la dette
            </AppButton>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Cette action est tracable. La dette restera visible avec le statut <strong>ANNULEE</strong> et la raison ci-dessous.
            Refuse si des paiements non annules sont rattaches a cette dette.
          </p>
          <AppTextarea
            label="Raison (requise, min 5 caracteres)"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            rows={3}
            placeholder="Ex: doublon, erreur de saisie, accord commercial..."
          />
        </div>
      </AppDialog>
    </PageTransition>
  );
}
