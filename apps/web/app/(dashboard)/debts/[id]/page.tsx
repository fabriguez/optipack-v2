'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, User, FileText, Calendar, CreditCard, AlertTriangle } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { formatAmount, formatDate } from '@optipack/shared';

const STATUS_VARIANT: Record<string, 'warning' | 'info' | 'success' | 'error'> = {
  ACTIVE: 'warning', PARTIALLY_PAID: 'info', CLEARED: 'success', OVERDUE: 'error',
};
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active', PARTIALLY_PAID: 'Partiellement payee', CLEARED: 'Soldee', OVERDUE: 'En retard',
};

export default function DebtDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['debts', id],
    queryFn: () => apiClient.get(`/debts/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const debt = data?.data;
  if (isLoading) return <DashboardSkeleton />;
  if (!debt) return <p className="p-6 text-gray-500">Dette introuvable</p>;

  const totalAmount = Number(debt.totalAmount || 0);
  const remainingAmount = Number(debt.remainingAmount || 0);
  const paidAmount = totalAmount - remainingAmount;
  const paidPercent = totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0;

  // Parse installment plan if it's JSON
  const installments: any[] = Array.isArray(debt.installmentPlan) ? debt.installmentPlan : [];

  const installmentColumns = [
    { key: 'number', label: '#', render: (_: any, i: number) => i + 1 },
    { key: 'amount', label: 'Montant', render: (row: any) => formatAmount(Number(row.amount || 0)) },
    { key: 'dueDate', label: 'Echeance', render: (row: any) => row.dueDate ? formatDate(row.dueDate) : '-' },
    {
      key: 'paid',
      label: 'Statut',
      render: (row: any) => (
        <AppBadge variant={row.paid ? 'success' : 'warning'}>{row.paid ? 'Paye' : 'En attente'}</AppBadge>
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="rounded-xl p-2 hover:bg-gray-100 transition-colors">
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">Dette</h1>
              <AppBadge variant={STATUS_VARIANT[debt.status] || 'default'}>
                {STATUS_LABEL[debt.status] || debt.status}
              </AppBadge>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{debt.description}</p>
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
                  <div className="h-3 rounded-full bg-green-500 transition-all" style={{ width: `${Math.min(paidPercent, 100)}%` }} />
                </div>
                <span className="text-sm font-bold">{paidPercent}%</span>
              </div>
            </div>
          </div>
        </AppCard>

        {/* Info cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <User className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Client</p>
                {debt.client ? (
                  <Link href={`/clients/${debt.client.id}`} className="text-sm font-medium text-primary-700 hover:underline">
                    {debt.client.fullName}
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-gray-900">{debt.clientId}</p>
                )}
              </div>
            </div>
          </AppCard>

          {debt.invoice && (
            <AppCard>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                  <FileText className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Facture</p>
                  <Link href={`/invoices/${debt.invoice.id}`} className="font-mono text-sm font-medium text-primary-700 hover:underline">
                    {debt.invoice.reference}
                  </Link>
                </div>
              </div>
            </AppCard>
          )}

          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <Calendar className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Prochaine echeance</p>
                <p className="text-sm font-medium text-gray-900">
                  {debt.nextDueDate ? formatDate(debt.nextDueDate) : 'Non definie'}
                </p>
              </div>
            </div>
          </AppCard>
        </div>

        {/* Installment plan */}
        {installments.length > 0 && (
          <AppCard>
            <AppCardHeader title={`Plan d'echeancier (${installments.length} echeances)`} />
            <AppDataTable columns={installmentColumns} data={installments} />
          </AppCard>
        )}
      </div>
    </PageTransition>
  );
}
