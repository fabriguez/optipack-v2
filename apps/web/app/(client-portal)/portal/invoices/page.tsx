'use client';

import { useEffect, useState, useCallback } from 'react';
import { FileText } from 'lucide-react';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDataTable, type Column } from '@/components/ui/AppDataTable';
import { PageTransition } from '@/components/shared/PageTransition';
import { clientPortalApi } from '@/lib/api/client-portal';

interface Invoice {
  id: string;
  reference: string;
  amount: number;
  amountPaid: number;
  status: string;
  createdAt: string;
}

const PAYMENT_STATUS_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'error' }> = {
  UNPAID: { label: 'Impaye', variant: 'error' },
  PARTIAL: { label: 'Partiel', variant: 'warning' },
  PAID: { label: 'Solde', variant: 'success' },
};

function formatAmount(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XAF',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

const LIMIT = 20;

export default function PortalInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await clientPortalApi.getInvoices({ page, limit: LIMIT });
      setInvoices(res.data?.items || res.data || []);
      setTotalPages(res.data?.totalPages || 1);
      setTotal(res.data?.total || 0);
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const columns: Column<Invoice>[] = [
    {
      key: 'reference',
      label: 'Reference',
      render: (row) => (
        <span className="font-mono text-sm font-medium text-gray-900">
          {row.reference}
        </span>
      ),
    },
    {
      key: 'amount',
      label: 'Montant',
      render: (row) => (
        <span className="text-sm font-semibold text-gray-900">
          {formatAmount(row.amount)}
        </span>
      ),
    },
    {
      key: 'amountPaid',
      label: 'Paye',
      render: (row) => (
        <span className="text-sm text-gray-600">
          {formatAmount(row.amountPaid ?? 0)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Statut',
      render: (row) => {
        const info = PAYMENT_STATUS_MAP[row.status] || {
          label: row.status,
          variant: 'default' as const,
        };
        return <AppBadge variant={info.variant}>{info.label}</AppBadge>;
      },
    },
    {
      key: 'createdAt',
      label: 'Date',
      render: (row) => (
        <span className="text-sm text-gray-500">
          {new Date(row.createdAt).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes Factures</h1>
          <p className="mt-1 text-sm text-gray-500">
            Consultez vos factures et leur statut de paiement.
          </p>
        </div>

        <AppCard>
          <AppCardHeader title="Liste des factures" />
          <AppDataTable
            columns={columns}
            data={invoices}
            isLoading={loading}
            page={page}
            totalPages={totalPages}
            total={total}
            limit={LIMIT}
            onPageChange={setPage}
            emptyMessage="Aucune facture trouvee"
            emptyIcon={<FileText className="h-10 w-10 text-gray-300" />}
          />
        </AppCard>
      </div>
    </PageTransition>
  );
}
