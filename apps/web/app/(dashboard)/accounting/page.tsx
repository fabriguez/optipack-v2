'use client';

import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { AppBadge } from '@/components/ui/AppBadge';
import { useQuery } from '@tanstack/react-query';
import { accountingApi } from '@/lib/api/finance';
import { formatAmount, formatDateTime } from '@optipack/shared';

const SOURCE_LABELS: Record<string, string> = {
  PAYMENT: 'Paiement',
  DISBURSEMENT: 'Decaissement',
  TRANSFER: 'Transfert',
  EXPENSE: 'Depense',
  PENALTY: 'Penalite',
  SALARY: 'Salaire',
};

export default function AccountingPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['accounting', { page, limit: 20 }],
    queryFn: () => accountingApi.getLedger({ page, limit: 20 }),
  });

  const columns = [
    {
      key: 'reference',
      label: 'Reference',
      render: (row: any) => (
        <span className="font-mono text-xs">{row.reference}</span>
      ),
    },
    { key: 'description', label: 'Description' },
    { key: 'sourceType', label: 'Source', render: (row: any) => (
      <AppBadge variant="info">{SOURCE_LABELS[row.sourceType] || row.sourceType}</AppBadge>
    )},
    {
      key: 'lines',
      label: 'Debit',
      render: (row: any) => {
        const total = (row.lines || []).reduce((s: number, l: any) => s + Number(l.debitAmount || 0), 0);
        return total > 0 ? (
          <span className="font-semibold text-primary-700">{formatAmount(total)}</span>
        ) : '-';
      },
    },
    {
      key: 'credit',
      label: 'Credit',
      render: (row: any) => {
        const total = (row.lines || []).reduce((s: number, l: any) => s + Number(l.creditAmount || 0), 0);
        return total > 0 ? (
          <span className="font-semibold text-red-600">{formatAmount(total)}</span>
        ) : '-';
      },
    },
    { key: 'date', label: 'Date', render: (row: any) => formatDateTime(row.date) },
  ];

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Grand Livre</h1>
          <p className="text-sm text-gray-500 mt-1">Journal comptable avec ecritures debit/credit.</p>
        </div>

        <AppCard padding="sm">
          <AppDataTable
            columns={columns}
            data={data?.data || []}
            isLoading={isLoading}
            page={page}
            totalPages={data?.meta?.totalPages || 1}
            total={data?.meta?.total}
            onPageChange={setPage}
          />
        </AppCard>
      </div>
    </PageTransition>
  );
}
