'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Boxes, CreditCard, Package, FileText } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppSelect } from '@/components/ui/AppSelect';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { toast } from 'sonner';

interface PayTarget {
  invoiceId: string;
  agencyId: string;
  label: string;
  balance: number;
  isGroup?: boolean;
}

export default function ParcelGroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['parcel-groups', id],
    queryFn: () => apiClient.get(`/parcel-groups/${id}`).then((r) => r.data),
  });

  if (isLoading) return <DashboardSkeleton />;
  const group = data?.data;
  if (!group) return <p className="p-6 text-gray-500">Groupe introuvable</p>;

  const parcels: any[] = group.parcels ?? [];
  const groupInvoice = group.invoice;

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="rounded-lg p-2 hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50">
              <Boxes className="h-6 w-6 text-primary-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{group.reference}</h1>
              <p className="text-sm text-gray-500">
                {group.label || 'Groupe de colis'} - {group.client?.fullName ?? '-'}
              </p>
            </div>
          </div>
          <AppBadge variant="default" className="ml-auto">{group.status}</AppBadge>
        </div>

        {/* Facture groupe agregee */}
        <AppCard>
          <AppCardHeader title="Facture du groupe" description="Agregat des factures de tous les colis" />
          {groupInvoice ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
                <Kv label="Reference" value={groupInvoice.reference} mono />
                <Kv label="Total" value={formatAmount(Number(groupInvoice.totalAmount))} />
                <Kv label="Paye" value={formatAmount(Number(groupInvoice.paidAmount))} />
                <Kv label="Solde" value={formatAmount(Number(groupInvoice.balance))} />
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={groupInvoice.status} type="invoice" />
                {groupInvoice.status !== 'PAID' && (
                  <AppButton
                    size="sm"
                    onClick={() =>
                      setPayTarget({
                        invoiceId: groupInvoice.id,
                        agencyId: group.agencyId,
                        label: `Facture groupe ${group.reference}`,
                        balance: Number(groupInvoice.balance),
                        isGroup: true,
                      })
                    }
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    Payer le groupe
                  </AppButton>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Aucune facture groupe.</p>
          )}
        </AppCard>

        {/* Colis du groupe + facture individuelle */}
        <AppCard padding="sm">
          <div className="px-2 py-2">
            <h3 className="text-sm font-semibold text-gray-700">Colis du groupe ({parcels.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="p-2 text-left">Tracking</th>
                  <th className="p-2 text-left">Designation</th>
                  <th className="p-2 text-right">Prix</th>
                  <th className="p-2 text-left">Facture</th>
                  <th className="p-2 text-right">Solde</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {parcels.map((p) => {
                  const inv = p.invoice;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="p-2">
                        <Link href={`/parcels/${p.id}`} className="font-mono text-xs text-primary-700 hover:underline">
                          {p.trackingNumber}
                        </Link>
                      </td>
                      <td className="p-2 text-gray-700">{p.designation}</td>
                      <td className="p-2 text-right font-medium">{formatAmount(Number(p.price))}</td>
                      <td className="p-2">
                        {inv ? <StatusBadge status={inv.status} type="invoice" /> : <span className="text-xs text-gray-300">-</span>}
                      </td>
                      <td className="p-2 text-right">{inv ? formatAmount(Number(inv.balance)) : '-'}</td>
                      <td className="p-2 text-right">
                        {inv && inv.status !== 'PAID' && (
                          <AppButton
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setPayTarget({
                                invoiceId: inv.id,
                                agencyId: group.agencyId,
                                label: `Colis ${p.trackingNumber}`,
                                balance: Number(inv.balance),
                              })
                            }
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            Payer
                          </AppButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </AppCard>
      </div>

      <PayDialog
        target={payTarget}
        onClose={() => setPayTarget(null)}
        onPaid={() => {
          qc.invalidateQueries({ queryKey: ['parcel-groups', id] });
          setPayTarget(null);
        }}
      />
    </PageTransition>
  );
}

function Kv({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`mt-0.5 font-medium text-gray-900 ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
    </div>
  );
}

function PayDialog({ target, onClose, onPaid }: { target: PayTarget | null; onClose: () => void; onPaid: () => void }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post('/payments', {
        invoiceId: target!.invoiceId,
        agencyId: target!.agencyId,
        amount: Number(amount),
        paymentMethod: method,
      }),
    onSuccess: () => {
      toast.success(target?.isGroup ? 'Paiement groupe reparti sur les colis' : 'Paiement enregistre');
      setAmount('');
      onPaid();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Echec du paiement'),
  });

  return (
    <AppDialog
      open={!!target}
      onClose={onClose}
      title={target ? `Payer - ${target.label}` : 'Payer'}
      size="sm"
      footer={
        <>
          <AppButton variant="ghost" onClick={onClose}>Annuler</AppButton>
          <AppButton
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!amount || Number(amount) <= 0}
          >
            <CreditCard className="h-4 w-4" />
            Encaisser
          </AppButton>
        </>
      }
    >
      <div className="space-y-3">
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
          Solde restant : <span className="font-semibold">{formatAmount(target?.balance ?? 0)}</span>
          {target?.isGroup && ' - le montant est reparti proportionnellement sur les factures des colis non soldes.'}
        </p>
        <AppInput
          label="Montant"
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <AppSelect
          label="Mode de paiement"
          value={method}
          onValueChange={setMethod}
          options={[
            { value: 'CASH', label: 'Especes' },
            { value: 'MOBILE_MONEY', label: 'Mobile Money' },
            { value: 'BANK_TRANSFER', label: 'Virement' },
            { value: 'CARD', label: 'Carte' },
            { value: 'CHECK', label: 'Cheque' },
          ]}
        />
      </div>
    </AppDialog>
  );
}
