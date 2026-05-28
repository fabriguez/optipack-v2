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
type StatusFilter = 'all' | 'overdue' | 'partial' | 'cleared' | 'due_today';

const PRIORITY_VARIANT: Record<string, 'error' | 'warning' | 'default'> = {
  CRITICAL: 'error',
  MEDIUM: 'warning',
  LOW: 'default',
};
const PRIORITY_LABEL: Record<string, string> = {
  LOW: 'Faible',
  MEDIUM: 'Moyenne',
  CRITICAL: 'Critique',
};
const CATEGORY_LABEL: Record<string, string> = {
  FREIGHT: 'Fret', CUSTOMS: 'Douane', STORAGE: 'Magasinage', DELIVERY: 'Livraison',
  TRANSIT: 'Transit', PENALTY: 'Penalite', ADVANCE: 'Avance', TRANSPORT: 'Transport',
  SUPPLY: 'Fourniture', PORT_FEES: 'Frais port.', FUEL: 'Carburant',
  LABOR: 'Main d\'oeuvre', TAXES: 'Taxes', MAINTENANCE: 'Entretien',
  RENT: 'Loyer', OTHER: 'Autre',
};

export default function DebtsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Bucket>('client');
  const [statusTab, setStatusTab] = useState<StatusFilter>('all');
  const [showCreate, setShowCreate] = useState(false);

  // Conversion onglet statut -> params API (status / timeFilter).
  const statusParams = (() => {
    switch (statusTab) {
      case 'overdue': return { timeFilter: 'overdue' as const };
      case 'partial': return { status: 'PARTIALLY_PAID' };
      case 'cleared': return { status: 'CLEARED' };
      case 'due_today': return { timeFilter: 'due_today' as const };
      default: return {};
    }
  })();

  const { data: dashboard } = useQuery({
    queryKey: ['finance', 'debt-dashboard'],
    queryFn: () => apiClient.get('/finance/debt-dashboard').then((r) => r.data),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['debts', { page, bucket: tab, search, statusTab }],
    queryFn: () =>
      apiClient
        .get('/debts', {
          params: {
            page,
            limit: 20,
            bucket: tab,
            search: search || undefined,
            ...statusParams,
          },
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
      render: (row: any) => (
        <div className="text-sm">
          <div className="text-gray-700">{row.motif}</div>
          {row.category && row.category !== 'OTHER' && (
            <div className="text-[10px] text-gray-400">{CATEGORY_LABEL[row.category] ?? row.category}</div>
          )}
        </div>
      ),
    },
    {
      key: 'priority',
      label: 'Priorite',
      render: (row: any) => (
        <AppBadge variant={PRIORITY_VARIANT[row.priority] || 'default'}>
          {PRIORITY_LABEL[row.priority] || row.priority}
        </AppBadge>
      ),
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

        {dashboard?.data && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <DashCard label="Creances clients" value={dashboard.data.clientReceivableTotal} tone="warn" />
            <DashCard label="Dettes entreprise" value={dashboard.data.companyDebtTotal} tone="warn" />
            <DashCard label="Echus clients" value={dashboard.data.overdueClientTotal} tone="error" />
            <DashCard label="Echus entreprise" value={dashboard.data.overdueCompanyTotal} tone="error" />
            <DashCard label="Recu aujourd'hui" value={dashboard.data.recoveredToday} tone="success" />
            <DashCard label="Recu ce mois" value={dashboard.data.recoveredMonth} tone="success" />
            <DashCard label="Echeance aujourd'hui" value={dashboard.data.dueTodayCount} tone="default" raw />
          </div>
        )}

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

        {/* Sous-onglets de statut/echeance. Filtre cote backend via
            status + timeFilter. */}
        <div className="flex flex-wrap gap-1.5">
          {([
            { id: 'all', label: 'Toutes' },
            { id: 'overdue', label: 'En retard' },
            { id: 'partial', label: 'Partiellement payees' },
            { id: 'cleared', label: 'Soldees' },
            { id: 'due_today', label: 'Echeance aujourd\'hui' },
          ] as { id: StatusFilter; label: string }[]).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { setStatusTab(s.id); setPage(1); }}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                statusTab === s.id
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

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

function DashCard({ label, value, tone, raw }: { label: string; value: number; tone: 'warn' | 'error' | 'success' | 'default'; raw?: boolean }) {
  const color =
    tone === 'error' ? 'text-red-700'
    : tone === 'warn' ? 'text-amber-700'
    : tone === 'success' ? 'text-emerald-700'
    : 'text-gray-900';
  return (
    <AppCard padding="sm">
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-base font-bold ${color}`}>
        {raw ? value : formatAmount(value)}
      </p>
    </AppCard>
  );
}
