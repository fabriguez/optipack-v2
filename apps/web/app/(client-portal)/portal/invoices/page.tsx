'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, CreditCard } from 'lucide-react';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDataTable, type Column } from '@/components/ui/AppDataTable';
import { PageTransition } from '@/components/shared/PageTransition';
import { clientPortalApi } from '@/lib/api/client-portal';

interface Invoice {
  id: string;
  reference: string;
  totalAmount: string | number;
  paidAmount: string | number;
  balance: string | number;
  status: string;
  createdAt: string;
}

const PAYMENT_STATUS_MAP: Record<
  string,
  { label: string; variant: 'default' | 'success' | 'warning' | 'error' }
> = {
  UNPAID: { label: 'Impaye', variant: 'error' },
  PARTIAL: { label: 'Partiel', variant: 'warning' },
  PAID: { label: 'Solde', variant: 'success' },
  CANCELLED: { label: 'Annule', variant: 'default' },
};

function formatAmount(value: number | string | null | undefined): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XAF',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

const LIMIT = 20;

export default function PortalInvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await clientPortalApi.getInvoices({ page, limit: LIMIT });
      const list: Invoice[] = res.data?.items || res.data || [];
      setInvoices(list);
      setTotalPages(res.meta?.totalPages || res.data?.totalPages || 1);
      setTotal(res.meta?.total || res.data?.total || list.length);
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
      key: 'totalAmount',
      label: 'Total',
      render: (row) => (
        <span className="text-sm font-semibold text-gray-900">
          {formatAmount(row.totalAmount)}
        </span>
      ),
    },
    {
      key: 'paidAmount',
      label: 'Paye',
      render: (row) => (
        <span className="text-sm text-gray-600">
          {formatAmount(row.paidAmount)}
        </span>
      ),
    },
    {
      key: 'balance',
      label: 'Restant',
      render: (row) => (
        <span
          className={`text-sm font-semibold ${
            Number(row.balance) > 0 ? 'text-red-600' : 'text-green-600'
          }`}
        >
          {formatAmount(row.balance)}
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
    {
      key: 'actions',
      label: 'Action',
      render: (row) => {
        const payable =
          row.status !== 'PAID' &&
          row.status !== 'CANCELLED' &&
          Number(row.balance) > 0;
        if (!payable) return <span className="text-xs text-gray-400">-</span>;
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/portal/payments?invoiceId=${row.id}`);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
          >
            <CreditCard className="h-3 w-3" />
            Payer
          </button>
        );
      },
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes Factures</h1>
          <p className="mt-1 text-sm text-gray-500">
            Consultez vos factures et declarez vos paiements.
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
