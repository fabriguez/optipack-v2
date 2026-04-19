'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { FileText, Eye, Printer, CreditCard } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { SearchBar } from '@/components/shared/SearchBar';
import { FilterDialog } from '@/components/shared/FilterDialog';
import { ExportButton } from '@/components/shared/ExportButton';
import { RowActions } from '@/components/shared/RowActions';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { useAgencies } from '@/lib/hooks/useAgencies';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { formatAmount, formatDate } from '@transitsoftservices/shared';

function InvoicesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { page, search, setPage, setSearch, queryParams } = useServerPagination();

  const { data: agenciesData } = useAgencies({ limit: 100 });

  const statusFilter = searchParams.get('status') || '';
  const agencyFilter = searchParams.get('agencyId') || '';
  const startDateFilter = searchParams.get('startDate') || '';
  const endDateFilter = searchParams.get('endDate') || '';

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', { ...queryParams, status: statusFilter, agencyId: agencyFilter, startDate: startDateFilter, endDate: endDateFilter }],
    queryFn: () => apiClient.get('/invoices', {
      params: {
        ...queryParams,
        status: statusFilter || undefined,
        agencyId: agencyFilter || undefined,
        startDate: startDateFilter || undefined,
        endDate: endDateFilter || undefined,
      },
    }).then((r) => r.data),
  });

  const handlePrint = (id: string) => {
    window.open(`/api/invoices/${id}/pdf`, '_blank');
  };

  const exportColumns = [
    { key: 'reference', label: 'Reference' },
    { key: 'client', label: 'Client' },
    { key: 'totalAmount', label: 'Montant total' },
    { key: 'paidAmount', label: 'Paye' },
    { key: 'balance', label: 'Solde' },
    { key: 'status', label: 'Statut' },
  ];

  const filterFields = [
    {
      key: 'status',
      label: 'Statut',
      type: 'select' as const,
      options: [
        { value: 'UNPAID', label: 'Non payees' },
        { value: 'PARTIAL', label: 'Partielles' },
        { value: 'PAID', label: 'Soldees' },
      ],
    },
    {
      key: 'agencyId',
      label: 'Agence',
      type: 'select' as const,
      options: (agenciesData?.data || []).map((a: any) => ({ value: a.id, label: a.name })),
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
            <FileText className="h-4 w-4 text-primary-600" />
          </div>
          <Link href={`/invoices/${row.id}`} className="font-mono text-xs font-bold text-primary-700 hover:underline" onClick={(e) => e.stopPropagation()}>{row.reference}</Link>
        </div>
      ),
    },
    {
      key: 'client',
      label: 'Client',
      render: (row: any) => (
        <div>
          <p className="font-medium text-gray-900">{row.client?.fullName || '-'}</p>
          <p className="text-xs text-gray-400">{row.client?.phone || ''}</p>
        </div>
      ),
    },
    {
      key: 'parcel',
      label: 'Colis',
      render: (row: any) => row.parcel
        ? <span className="font-mono text-xs text-primary-700">{row.parcel.trackingNumber}</span>
        : <span className="text-xs text-gray-300">-</span>,
    },
    { key: 'agency', label: 'Agence', render: (row: any) => <span className="text-sm">{row.agency?.name || '-'}</span> },
    {
      key: 'netAmount',
      label: 'Montant',
      render: (row: any) => <span className="text-sm font-bold text-gray-900">{formatAmount(Number(row.netAmount))}</span>,
    },
    {
      key: 'paidAmount',
      label: 'Paye',
      render: (row: any) => <span className="text-sm font-medium text-primary-700">{formatAmount(Number(row.paidAmount))}</span>,
    },
    {
      key: 'balance',
      label: 'Solde',
      render: (row: any) => {
        const balance = Number(row.balance);
        return <span className={`text-sm font-bold ${balance > 0 ? 'text-red-600' : 'text-primary-700'}`}>{formatAmount(balance)}</span>;
      },
    },
    {
      key: 'status',
      label: 'Statut',
      render: (row: any) => <StatusBadge status={row.status} type="invoice" />,
    },
    { key: 'issuedAt', label: 'Date', render: (row: any) => <span className="text-xs text-gray-500">{formatDate(row.issuedAt)}</span> },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (row: any) => (
        <RowActions actions={[
          { label: 'Voir les details', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/invoices/${row.id}`) },
          { label: 'Imprimer PDF', icon: <Printer className="h-4 w-4" />, onClick: () => handlePrint(row.id) },
          { label: 'Enregistrer paiement', icon: <CreditCard className="h-4 w-4" />, onClick: () => router.push(`/payments?invoiceId=${row.id}`), disabled: row.status === 'PAID' },
        ]} />
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Factures</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.meta?.total ?? 0} factures</p>
        </div>

        {/* Search --- Export | Filtres | Effacer */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Reference, client..." />
          </div>
          <div className="flex items-center gap-2">
            <ExportButton data={data?.data || []} columns={exportColumns} fileName="factures" />
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
            onRowClick={(row) => router.push(`/invoices/${row.id}`)}
          />
        </AppCard>
      </div>
    </PageTransition>
  );
}

export default function InvoicesPage() {
  return <Suspense><InvoicesContent /></Suspense>;
}
