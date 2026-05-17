'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Banknote,
  Building2,
  ArrowRightLeft,
  HandCoins,
  AlertTriangle,
  Filter,
} from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { apiClient } from '@/lib/api/client';
import { searchers } from '@/lib/api/searchers';
import { formatAmount } from '@transitsoftservices/shared';

type EventType =
  | 'SALARY_PAYMENT'
  | 'CHARGE_PAYMENT'
  | 'FUND_TRANSFER'
  | 'DEBT_CREATED'
  | 'DEBT_PAYMENT';

interface FinanceEvent {
  id: string;
  type: EventType;
  date: string;
  amount: number;
  agencyId: string | null;
  agencyName?: string | null;
  label: string;
  description?: string | null;
  reference?: string | null;
  userId?: string | null;
  userName?: string | null;
  meta?: Record<string, any>;
}

const TYPE_META: Record<EventType, { label: string; icon: any; tone: 'success' | 'info' | 'warning' | 'error' | 'default' }> = {
  SALARY_PAYMENT: { label: 'Avance salaire', icon: Banknote, tone: 'success' },
  CHARGE_PAYMENT: { label: 'Paiement charge', icon: Building2, tone: 'info' },
  FUND_TRANSFER: { label: 'Transfert', icon: ArrowRightLeft, tone: 'default' },
  DEBT_CREATED: { label: 'Avance accordee', icon: AlertTriangle, tone: 'warning' },
  DEBT_PAYMENT: { label: 'Remboursement', icon: HandCoins, tone: 'success' },
};

const ALL_TYPES: EventType[] = [
  'SALARY_PAYMENT',
  'CHARGE_PAYMENT',
  'FUND_TRANSFER',
  'DEBT_CREATED',
  'DEBT_PAYMENT',
];

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function FinanceHistoryPage() {
  const [agencyId, setAgencyId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'ALL' | EventType>('ALL');

  const types = activeTab === 'ALL' ? ALL_TYPES : [activeTab];

  const { data, isLoading } = useQuery({
    queryKey: ['finance-timeline', agencyId, activeTab],
    queryFn: () =>
      apiClient
        .get('/finance/timeline', {
          params: {
            agencyId: agencyId || undefined,
            types: types.join(','),
            limit: 200,
          },
        })
        .then((r) => r.data),
  });

  const events: FinanceEvent[] = data?.data ?? [];

  const totals = useMemo(() => {
    const acc: Record<EventType, number> = {
      SALARY_PAYMENT: 0,
      CHARGE_PAYMENT: 0,
      FUND_TRANSFER: 0,
      DEBT_CREATED: 0,
      DEBT_PAYMENT: 0,
    };
    for (const e of events) acc[e.type] += e.amount;
    return acc;
  }, [events]);

  const columns = [
    {
      key: 'type',
      label: 'Type',
      render: (row: FinanceEvent) => {
        const m = TYPE_META[row.type];
        const Icon = m.icon;
        return (
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-gray-500" />
            <AppBadge variant={m.tone}>{m.label}</AppBadge>
          </div>
        );
      },
    },
    { key: 'date', label: 'Date', render: (r: FinanceEvent) => <span className="text-sm text-gray-700">{fmtDate(r.date)}</span> },
    {
      key: 'label',
      label: 'Operation',
      render: (r: FinanceEvent) => (
        <div className="min-w-0">
          <div className="font-medium text-gray-900 truncate">{r.label}</div>
          {r.description && <div className="text-xs text-gray-500 truncate">{r.description}</div>}
        </div>
      ),
    },
    { key: 'agency', label: 'Agence', render: (r: FinanceEvent) => <span className="text-sm">{r.agencyName ?? '-'}</span> },
    {
      key: 'amount',
      label: 'Montant',
      className: 'text-right',
      render: (r: FinanceEvent) => (
        <span className="font-semibold text-gray-900">{formatAmount(r.amount)}</span>
      ),
    },
    { key: 'reference', label: 'Reference', render: (r: FinanceEvent) => <span className="text-xs font-mono text-gray-500">{r.reference ?? '-'}</span> },
    { key: 'user', label: 'Par', render: (r: FinanceEvent) => <span className="text-sm text-gray-600">{r.userName ?? '-'}</span> },
  ];

  const tabs: Array<{ value: 'ALL' | EventType; label: string }> = [
    { value: 'ALL', label: 'Tout' },
    { value: 'SALARY_PAYMENT', label: 'Avances salaires' },
    { value: 'CHARGE_PAYMENT', label: 'Charges' },
    { value: 'FUND_TRANSFER', label: 'Transferts' },
    { value: 'DEBT_CREATED', label: 'Avances accordees' },
    { value: 'DEBT_PAYMENT', label: 'Remboursements' },
  ];

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Historique financier</h1>
            <p className="text-sm text-gray-500 mt-1">
              Flux unifie : salaires, charges, transferts, avances et remboursements.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {ALL_TYPES.map((t) => {
            const m = TYPE_META[t];
            const Icon = m.icon;
            return (
              <AppCard key={t} padding="sm">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Icon className="h-4 w-4" />
                  {m.label}
                </div>
                <div className="mt-1 text-lg font-semibold text-gray-900">
                  {formatAmount(totals[t])}
                </div>
              </AppCard>
            );
          })}
        </div>

        <AppCard padding="sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Filter className="h-4 w-4" />
              Filtres
            </div>
            <div className="min-w-60">
              <AppSearchSelect
                value={agencyId}
                onChange={(v) => setAgencyId(v ?? '')}
                search={searchers.agencies}
                placeholder="Toutes agences"
              />
            </div>
            <div className="ml-auto flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
              {tabs.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setActiveTab(t.value)}
                  className={
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors ' +
                    (activeTab === t.value
                      ? 'bg-white text-primary-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900')
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </AppCard>

        <AppCard padding="sm">
          <AppDataTable
            columns={columns as any}
            data={events}
            isLoading={isLoading}
            page={1}
            totalPages={1}
            total={events.length}
            limit={events.length || 1}
            onPageChange={() => {}}
          />
        </AppCard>
      </div>
    </PageTransition>
  );
}
