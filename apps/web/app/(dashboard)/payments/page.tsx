'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, CreditCard, Eye, Ban, FileText } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { SearchBar } from '@/components/shared/SearchBar';
import { FilterDialog } from '@/components/shared/FilterDialog';
import { ExportButton } from '@/components/shared/ExportButton';
import { RowActions } from '@/components/shared/RowActions';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { usePayments } from '@/lib/hooks/usePayments';
import { searchers } from '@/lib/api/searchers';
import { formatAmount, formatDateTime } from '@transitsoftservices/shared';
import { PaymentFormDialog } from './PaymentFormDialog';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Especes', MOBILE_MONEY: 'Mobile Money', BANK_TRANSFER: 'Virement', CARD: 'Carte', CHECK: 'Cheque',
};

function PaymentsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const { page, search, setPage, setSearch, queryParams } = useServerPagination();

  const agencyFilter = searchParams.get('agencyId') || '';
  const paymentMethodFilter = searchParams.get('paymentMethod') || '';
  const startDateFilter = searchParams.get('startDate') || '';
  const endDateFilter = searchParams.get('endDate') || '';

  const { data, isLoading } = usePayments({
    ...queryParams,
    agencyId: agencyFilter || undefined,
    paymentMethod: paymentMethodFilter || undefined,
    startDate: startDateFilter || undefined,
    endDate: endDateFilter || undefined,
  } as any);

  const exportColumns = [
    { key: 'reference', label: 'Reference' },
    { key: 'amount', label: 'Montant' },
    { key: 'paymentMethod', label: 'Mode' },
    { key: 'agency', label: 'Agence' },
    { key: 'createdAt', label: 'Date' },
  ];

  const filterFields = [
    {
      key: 'agencyId',
      label: 'Agence',
      type: 'search-select' as const,
      searcher: searchers.agencies,
    },
    {
      key: 'paymentMethod',
      label: 'Mode de paiement',
      type: 'select' as const,
      options: [
        { value: 'CASH', label: 'Especes' },
        { value: 'MOBILE_MONEY', label: 'Mobile Money' },
        { value: 'BANK_TRANSFER', label: 'Virement' },
        { value: 'CARD', label: 'Carte' },
        { value: 'CHECK', label: 'Cheque' },
      ],
    },
    { key: 'startDate', label: 'Date debut', type: 'date' as const },
    { key: 'endDate', label: 'Date fin', type: 'date' as const },
  ];

  const columns = [
    {
      key: 'reference',
      label: 'Reference',
      render: (row: any) => (
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50">
            <CreditCard className="h-4 w-4 text-primary-600" />
          </div>
          <Link href={`/payments/${row.id}`} className="font-mono text-xs font-bold text-primary-700 hover:underline" onClick={(e) => e.stopPropagation()}>{row.reference}</Link>
        </div>
      ),
    },
    { key: 'invoice', label: 'Facture', render: (row: any) => <span className="font-mono text-xs">{row.invoice?.reference || '-'}</span> },
    { key: 'agency', label: 'Agence', render: (row: any) => <span className="text-sm">{row.agency?.name || '-'}</span> },
    {
      key: 'amount',
      label: 'Montant',
      render: (row: any) => <span className="text-sm font-bold text-primary-700">{formatAmount(Number(row.amount))}</span>,
    },
    {
      key: 'paymentMethod',
      label: 'Mode',
      render: (row: any) => <AppBadge>{METHOD_LABELS[row.paymentMethod] || row.paymentMethod}</AppBadge>,
    },
    {
      key: 'receivedBy',
      label: 'Recu par',
      render: (row: any) => <span className="text-sm">{row.receivedBy ? `${row.receivedBy.firstName} ${row.receivedBy.lastName}` : '-'}</span>,
    },
    {
      key: 'isVoided',
      label: 'Statut',
      render: (row: any) => <AppBadge variant={row.isVoided ? 'error' : 'success'}>{row.isVoided ? 'Annule' : 'Valide'}</AppBadge>,
    },
    {
      key: 'createdAt',
      label: 'Date',
      render: (row: any) => <span className="text-xs text-gray-500">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (row: any) => (
        <RowActions actions={[
          { label: 'Voir les details', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/payments/${row.id}`) },
          { label: 'Voir la facture', icon: <FileText className="h-4 w-4" />, onClick: () => router.push(`/invoices/${row.invoice?.id || row.invoiceId}`) },
          { label: 'Annuler', icon: <Ban className="h-4 w-4" />, onClick: () => router.push(`/payments/${row.id}`), variant: 'destructive', disabled: row.isVoided },
        ]} />
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Paiements</h1>
            <p className="text-sm text-gray-500 mt-1">{data?.meta?.total ?? 0} paiements</p>
          </div>
          <AppButton onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Nouveau paiement
          </AppButton>
        </div>

        {/* Search --- Export | Filtres | Effacer */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Reference, facture..." />
          </div>
          <div className="flex items-center gap-2">
            <ExportButton data={data?.data || []} columns={exportColumns} fileName="paiements" />
            <FilterDialog fields={filterFields} />
          </div>
        </div>

        <AppCard padding="sm">
          <AppDataTable
            columns={columns}
            data={data?.data || []}
            isLoading={isLoading}
            page={page}
            totalPages={data?.meta?.totalPages || 1}
            total={data?.meta?.total}
            limit={queryParams.limit}
            onPageChange={setPage}
            onRowClick={(row) => router.push(`/payments/${row.id}`)}
          />
        </AppCard>
      </div>
      <PaymentFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </PageTransition>
  );
}

export default function PaymentsPage() {
  return <Suspense><PaymentsContent /></Suspense>;
}
