'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, Plus } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { SearchBar } from '@/components/shared/SearchBar';
import { RowActions } from '@/components/shared/RowActions';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { cn } from '@/lib/utils/cn';
import { DebtFormDialog } from './DebtFormDialog';

// Couleur badge selon statut. PARTIALLY_PAID = orange (en cours), CLEARED =
// vert, OVERDUE = rouge, LITIGATED = jaune fonce, CANCELLED = gris.
const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'error' | 'default' | 'info'> = {
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

const TYPE_LABEL: Record<string, string> = {
  CLIENT: 'Client',
  EMPLOYEE: 'Personnel',
  AGENCY: 'Agence',
  CARRIER: 'Transporteur',
};

type Bucket = 'client' | 'company';

export default function DebtsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Bucket>('client');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['debts', { page, bucket: tab, search }],
    queryFn: () =>
      apiClient
        .get('/debts', {
          params: { page, limit: 20, bucket: tab, search: search || undefined },
        })
        .then((r) => r.data),
  });

  const rows: any[] = data?.data || [];
  // Totaux du bucket courant pour l'entete (affiche en haut de la liste).
  const totalRemaining = rows.reduce((s, r) => s + Number(r.remainingAmount || 0), 0);

  // Colonnes : la 1ere colonne "tiers" change selon le bucket (client vs
  // employee/agency/carrier). Le reste est commun.
  const tierCol = {
    key: 'tier',
    label: tab === 'client' ? 'Client' : 'Tiers',
    render: (row: any) => {
      const label = row.client?.fullName
        || row.employee?.fullName
        || row.carrier?.name
        || row.agencyCharge?.label
        || row.creditor
        || '-';
      const sub = TYPE_LABEL[row.type] || row.type;
      return (
        <Link
          href={`/debts/${row.id}`}
          className="text-primary-700 font-medium hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          <div>{label}</div>
          <div className="text-[10px] text-gray-400">{sub}</div>
        </Link>
      );
    },
  };

  const columns = [
    {
      key: 'reference',
      label: 'Reference',
      render: (row: any) => (
        <span className="font-mono text-xs text-gray-700">{row.reference}</span>
      ),
    },
    tierCol,
    {
      key: 'motif',
      label: 'Motif',
      render: (row: any) => <span className="text-sm text-gray-700">{row.motif}</span>,
    },
    {
      key: 'totalAmount',
      label: 'Total',
      render: (row: any) => formatAmount(Number(row.totalAmount)),
    },
    {
      key: 'remainingAmount',
      label: 'Restant',
      render: (row: any) => (
        <span className="font-semibold text-red-600">
          {formatAmount(Number(row.remainingAmount))}
        </span>
      ),
    },
    {
      key: 'nextDueDate',
      label: 'Prochaine echeance',
      render: (row: any) => (row.nextDueDate ? formatDate(row.nextDueDate) : '-'),
    },
    {
      key: 'status',
      label: 'Statut',
      render: (row: any) => (
        <AppBadge variant={STATUS_VARIANT[row.status] || 'default'}>
          {STATUS_LABEL[row.status] || row.status}
        </AppBadge>
      ),
    },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (row: any) => (
        <RowActions
          actions={[
            {
              label: 'Voir details',
              icon: <Eye className="h-4 w-4" />,
              onClick: () => router.push(`/debts/${row.id}`),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dettes</h1>
            <p className="text-sm text-gray-500 mt-1">
              Suivi typee : clients vs entreprise (personnel, agence, transporteur).
            </p>
          </div>
          <AppButton onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Nouvelle dette
          </AppButton>
        </div>

        {/* Onglets : Dettes clients vs Dettes entreprise (personnel + agence
            + transporteur cumules). Le total restant du bucket est affiche
            a cote pour vue d'ensemble rapide. */}
        <nav className="flex flex-wrap gap-1 border-b border-gray-200">
          <button
            type="button"
            onClick={() => {
              setTab('client');
              setPage(1);
            }}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === 'client'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-600 hover:text-gray-900',
            )}
          >
            Dettes clients
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('company');
              setPage(1);
            }}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === 'company'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-600 hover:text-gray-900',
            )}
          >
            Dettes entreprise
          </button>
        </nav>

        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <SearchBar
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Reference, motif, tiers..."
            />
          </div>
          <div className="text-xs text-gray-600">
            Total restant <span className="font-bold text-red-700">{formatAmount(totalRemaining)}</span>
          </div>
        </div>

        <AppCard padding="sm">
          <AppDataTable
            columns={columns}
            data={rows}
            isLoading={isLoading}
            page={page}
            totalPages={data?.meta?.totalPages || 1}
            total={data?.meta?.total}
            onPageChange={setPage}
            onRowClick={(row) => router.push(`/debts/${row.id}`)}
          />
        </AppCard>

        <DebtFormDialog open={showCreate} onClose={() => setShowCreate(false)} defaultBucket={tab} />
      </div>
    </PageTransition>
  );
}
