'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, CreditCard, AlertTriangle } from 'lucide-react';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDataTable, type Column } from '@/components/ui/AppDataTable';
import { PageTransition } from '@/components/shared/PageTransition';
import { clientPortalApi } from '@/lib/api/client-portal';

interface Debt {
  id: string;
  reference: string;
  motif: string;
  description: string | null;
  totalAmount: string | number;
  paidAmount: string | number;
  remainingAmount: string | number;
  status: string;
  priority: string;
  category: string;
  nextDueDate: string | null;
  dueDateFinal: string | null;
  createdAt: string;
  invoice: {
    id: string;
    reference: string;
    totalAmount: string | number;
    status: string;
  } | null;
}

const STATUS_MAP: Record<
  string,
  { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' }
> = {
  ACTIVE: { label: 'Active', variant: 'error' },
  PARTIALLY_PAID: { label: 'Partiellement payee', variant: 'warning' },
  PAID: { label: 'Soldee', variant: 'success' },
  CANCELLED: { label: 'Annulee', variant: 'default' },
  OVERDUE: { label: 'En retard', variant: 'error' },
};

const PRIORITY_VARIANT: Record<
  string,
  'default' | 'success' | 'warning' | 'error' | 'info'
> = {
  LOW: 'default',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'error',
};

function formatAmount(value: number | string | null | undefined) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XAF',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

const LIMIT = 20;

export default function PortalDebtsPage() {
  const router = useRouter();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchDebts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await clientPortalApi.getDebts({ page, limit: LIMIT });
      const list: Debt[] = res.data?.items || res.data || [];
      setDebts(list);
      setTotalPages(res.meta?.totalPages || res.data?.totalPages || 1);
      setTotal(res.meta?.total || res.data?.total || list.length);
    } catch {
      setDebts([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchDebts();
  }, [fetchDebts]);

  const totalRemaining = debts.reduce(
    (sum, d) => sum + Number(d.remainingAmount ?? 0),
    0,
  );

  const columns: Column<Debt>[] = [
    {
      key: 'reference',
      label: 'Reference',
      render: (row) => (
        <span className="font-mono text-xs text-gray-700">{row.reference}</span>
      ),
    },
    {
      key: 'motif',
      label: 'Motif',
      render: (row) => (
        <div>
          <p className="text-sm font-medium text-gray-900">{row.motif}</p>
          {row.invoice?.reference && (
            <p className="text-[11px] text-gray-500">
              Facture {row.invoice.reference}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'totalAmount',
      label: 'Total',
      render: (row) => (
        <span className="text-sm text-gray-700">
          {formatAmount(row.totalAmount)}
        </span>
      ),
    },
    {
      key: 'remainingAmount',
      label: 'Restant',
      render: (row) => (
        <span
          className={`text-sm font-bold ${
            Number(row.remainingAmount) > 0 ? 'text-red-600' : 'text-green-600'
          }`}
        >
          {formatAmount(row.remainingAmount)}
        </span>
      ),
    },
    {
      key: 'priority',
      label: 'Priorite',
      render: (row) => (
        <AppBadge variant={PRIORITY_VARIANT[row.priority] ?? 'default'}>
          {row.priority}
        </AppBadge>
      ),
    },
    {
      key: 'status',
      label: 'Statut',
      render: (row) => {
        const info = STATUS_MAP[row.status] ?? {
          label: row.status,
          variant: 'default' as const,
        };
        return <AppBadge variant={info.variant}>{info.label}</AppBadge>;
      },
    },
    {
      key: 'nextDueDate',
      label: 'Echeance',
      render: (row) => (
        <span className="text-xs text-gray-500">
          {row.nextDueDate
            ? new Date(row.nextDueDate).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
            : '-'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Action',
      render: (row) => {
        if (!row.invoice || row.status === 'PAID' || row.status === 'CANCELLED') {
          return <span className="text-xs text-gray-400">-</span>;
        }
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/portal/payments?invoiceId=${row.invoice?.id ?? ''}`);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
          >
            <CreditCard className="h-3 w-3" />
            Regler
          </button>
        );
      },
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mes Dettes</h1>
            <p className="mt-1 text-sm text-gray-500">
              Suivi de vos creances et echeances envers l&apos;agence.
            </p>
          </div>
          <AppCard className="flex w-fit items-center gap-3 px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400">
                Total restant (page)
              </p>
              <p className="text-lg font-bold text-gray-900">
                {formatAmount(totalRemaining)}
              </p>
            </div>
          </AppCard>
        </div>

        <AppCard>
          <AppCardHeader title="Liste des dettes" />
          <AppDataTable
            columns={columns}
            data={debts}
            isLoading={loading}
            page={page}
            totalPages={totalPages}
            total={total}
            limit={LIMIT}
            onPageChange={setPage}
            emptyMessage="Aucune dette en cours"
            emptyIcon={<Wallet className="h-10 w-10 text-gray-300" />}
          />
        </AppCard>
      </div>
    </PageTransition>
  );
}
