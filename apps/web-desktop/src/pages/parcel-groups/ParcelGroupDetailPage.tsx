import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { ArrowLeft, Boxes, CreditCard } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { PaymentFormDialog } from '@/pages/payments/PaymentFormDialog';
import { formatAmount } from '@transitsoftservices/shared';

interface PayTarget {
  invoiceId: string;
  parcelTracking?: string;
}

export default function ParcelGroupDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
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
          <button onClick={() => navigate(-1)} className="rounded-lg p-2 hover:bg-gray-100">
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
                    onClick={() => setPayTarget({ invoiceId: groupInvoice.id })}
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
                        <Link to={`/parcels/${p.id}`} className="font-mono text-xs text-primary-700 hover:underline">
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
                              setPayTarget({ invoiceId: inv.id, parcelTracking: p.trackingNumber })
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

      <PaymentFormDialog
        open={!!payTarget}
        onClose={() => {
          setPayTarget(null);
          qc.invalidateQueries({ queryKey: ['parcel-groups', id] });
        }}
        invoiceId={payTarget?.invoiceId}
        parcelTracking={payTarget?.parcelTracking}
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
