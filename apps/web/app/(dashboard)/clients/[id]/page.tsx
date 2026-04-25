'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, User, Package, CreditCard, Star, FileText, AlertTriangle, Plus, Eye, CheckCircle } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppTabs } from '@/components/ui/AppTabs';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { RowActions } from '@/components/shared/RowActions';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { useClient } from '@/lib/hooks/useClients';
import { useParcels } from '@/lib/hooks/useParcels';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { ParcelFormDialog } from '../../parcels/ParcelFormDialog';
import { PartnerPricingsSection } from './PartnerPricingsSection';

const TIER_VARIANT: Record<string, 'default' | 'info' | 'warning' | 'success'> = {
  STANDARD: 'default', SILVER: 'info', GOLD: 'warning', VIP: 'success',
};

const DEBT_STATUS_VARIANT: Record<string, 'default' | 'info' | 'warning' | 'error' | 'success'> = {
  ACTIVE: 'warning', PARTIALLY_PAID: 'info', CLEARED: 'success', OVERDUE: 'error',
};
const DEBT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active', PARTIALLY_PAID: 'Partiel', CLEARED: 'Soldee', OVERDUE: 'En retard',
};

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, isLoading } = useClient(id);
  const [parcelPage, setParcelPage] = useState(1);
  const [invoicePage, setInvoicePage] = useState(1);
  const [debtPage, setDebtPage] = useState(1);
  const [showCreateParcel, setShowCreateParcel] = useState(false);

  const { data: parcelsData } = useParcels({ clientId: id, limit: 10, page: parcelPage });

  const { data: invoicesData } = useQuery({
    queryKey: ['invoices', { clientId: id, page: invoicePage, limit: 10 }],
    queryFn: () => apiClient.get('/invoices', { params: { clientId: id, page: invoicePage, limit: 10 } }).then((r) => r.data),
    enabled: !!id,
  });

  const { data: debtsData } = useQuery({
    queryKey: ['debts', { clientId: id, page: debtPage, limit: 10 }],
    queryFn: () => apiClient.get('/debts', { params: { clientId: id, page: debtPage, limit: 10 } }).then((r) => r.data),
    enabled: !!id,
  });

  const client = data?.data;

  if (isLoading) return <DashboardSkeleton />;
  if (!client) return <p className="p-6 text-gray-500">Client introuvable</p>;

  const parcelColumns = [
    {
      key: 'trackingNumber',
      label: 'Tracking',
      render: (row: any) => (
        <Link href={`/parcels/${row.id}`} className="font-mono text-xs text-primary-700 font-bold hover:underline" onClick={(e) => e.stopPropagation()}>
          {row.trackingNumber}
        </Link>
      ),
    },
    { key: 'designation', label: 'Designation' },
    { key: 'price', label: 'Prix', render: (row: any) => formatAmount(Number(row.price)) },
    { key: 'status', label: 'Statut', render: (row: any) => <StatusBadge status={row.status} type="parcel" /> },
    { key: 'createdAt', label: 'Date', render: (row: any) => formatDate(row.createdAt) },
    {
      key: 'actions',
      label: '',
      render: (row: any) => (
        <RowActions
          actions={[
            { label: 'Voir', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/parcels/${row.id}`) },
          ]}
        />
      ),
    },
  ];

  const invoiceColumns = [
    {
      key: 'reference',
      label: 'Reference',
      render: (row: any) => (
        <Link href={`/invoices/${row.id}`} className="font-mono text-xs text-primary-700 font-bold hover:underline" onClick={(e) => e.stopPropagation()}>
          {row.reference}
        </Link>
      ),
    },
    { key: 'netAmount', label: 'Montant net', render: (row: any) => <span className="font-bold">{formatAmount(Number(row.netAmount))}</span> },
    { key: 'status', label: 'Statut', render: (row: any) => <StatusBadge status={row.status} type="invoice" /> },
    { key: 'issuedAt', label: 'Date', render: (row: any) => formatDate(row.issuedAt) },
    {
      key: 'actions',
      label: '',
      render: (row: any) => (
        <RowActions
          actions={[
            { label: 'Voir', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/invoices/${row.id}`) },
            { label: 'Payer', icon: <CreditCard className="h-4 w-4" />, onClick: () => router.push(`/payments?invoiceId=${row.id}`), disabled: row.status === 'PAID' },
          ]}
        />
      ),
    },
  ];

  const debtColumns = [
    {
      key: 'description',
      label: 'Description',
      render: (row: any) => (
        <Link href={`/debts/${row.id}`} className="text-sm text-primary-700 font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
          {row.description}
        </Link>
      ),
    },
    { key: 'totalAmount', label: 'Total', render: (row: any) => formatAmount(Number(row.totalAmount)) },
    { key: 'remainingAmount', label: 'Restant', render: (row: any) => <span className="font-bold text-red-600">{formatAmount(Number(row.remainingAmount))}</span> },
    {
      key: 'status',
      label: 'Statut',
      render: (row: any) => (
        <AppBadge variant={DEBT_STATUS_VARIANT[row.status] || 'default'}>
          {DEBT_STATUS_LABEL[row.status] || row.status}
        </AppBadge>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (row: any) => (
        <RowActions
          actions={[
            { label: 'Voir', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/debts/${row.id}`) },
          ]}
        />
      ),
    },
  ];

  const parcelsTab = (
    <AppCard>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">Colis ({parcelsData?.meta?.total ?? 0})</h3>
        <div className="flex items-center gap-2">
          <Link href={`/parcels?clientId=${id}`}>
            <AppButton variant="ghost" size="sm">Voir tout</AppButton>
          </Link>
          <AppButton size="sm" onClick={() => setShowCreateParcel(true)}>
            <Plus className="h-3.5 w-3.5" />
            Nouveau colis
          </AppButton>
        </div>
      </div>
      <AppDataTable
        columns={parcelColumns}
        data={parcelsData?.data || []}
        onRowClick={(row) => router.push(`/parcels/${row.id}`)}
        total={parcelsData?.meta?.total}
        page={parcelPage}
        totalPages={parcelsData?.meta?.totalPages}
        onPageChange={setParcelPage}
      />
    </AppCard>
  );

  const invoicesTab = (
    <AppCard>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">Factures ({invoicesData?.meta?.total ?? 0})</h3>
        <div className="flex items-center gap-2">
          <Link href={`/invoices?clientId=${id}`}>
            <AppButton variant="ghost" size="sm">Voir tout</AppButton>
          </Link>
        </div>
      </div>
      <AppDataTable
        columns={invoiceColumns}
        data={invoicesData?.data || []}
        onRowClick={(row) => router.push(`/invoices/${row.id}`)}
        total={invoicesData?.meta?.total}
        page={invoicePage}
        totalPages={invoicesData?.meta?.totalPages}
        onPageChange={setInvoicePage}
      />
    </AppCard>
  );

  const debtsTab = (
    <AppCard>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">Dettes ({debtsData?.meta?.total ?? 0})</h3>
        <div className="flex items-center gap-2">
          <Link href={`/debts?clientId=${id}`}>
            <AppButton variant="ghost" size="sm">Voir tout</AppButton>
          </Link>
        </div>
      </div>
      <AppDataTable
        columns={debtColumns}
        data={debtsData?.data || []}
        onRowClick={(row) => router.push(`/debts/${row.id}`)}
        total={debtsData?.meta?.total}
        page={debtPage}
        totalPages={debtsData?.meta?.totalPages}
        onPageChange={setDebtPage}
      />
    </AppCard>
  );

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="rounded-xl p-2 hover:bg-gray-100 transition-colors">
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{client.fullName}</h1>
              {client.clientType === 'PARTNER' && (
                <AppBadge variant="success">Partenaire</AppBadge>
              )}
              {client.clientType === 'COMPANY' && (
                <AppBadge variant="info">Entreprise</AppBadge>
              )}
              <AppBadge variant={TIER_VARIANT[client.loyaltyTier] || 'default'}>{client.loyaltyTier}</AppBadge>
              {!client.isActive && <AppBadge variant="default">Inactif</AppBadge>}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{client.phone} {client.email ? `-- ${client.email}` : ''}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <Star className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Points fidelite</p>
                <p className="text-lg font-bold text-gray-900">{client.loyaltyPoints}</p>
              </div>
            </div>
          </AppCard>
          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <CreditCard className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Total depense</p>
                <p className="text-lg font-bold text-gray-900">{formatAmount(Number(client.totalSpent))}</p>
              </div>
            </div>
          </AppCard>
          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <Package className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Colis</p>
                <p className="text-lg font-bold text-gray-900">{parcelsData?.meta?.total ?? 0}</p>
              </div>
            </div>
          </AppCard>
          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <User className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Inscrit le</p>
                <p className="text-lg font-bold text-gray-900">{formatDate(client.createdAt)}</p>
              </div>
            </div>
          </AppCard>
        </div>

        {/* Tarification partenaire (visible uniquement pour les partenaires) */}
        <PartnerPricingsSection clientId={id} isPartner={client.clientType === 'PARTNER'} />

        {/* Tabs: Colis, Factures, Dettes */}
        <AppTabs
          tabs={[
            { value: 'parcels', label: `Colis (${parcelsData?.meta?.total ?? 0})`, icon: <Package className="h-4 w-4" />, content: parcelsTab },
            { value: 'invoices', label: `Factures (${invoicesData?.meta?.total ?? 0})`, icon: <FileText className="h-4 w-4" />, content: invoicesTab },
            { value: 'debts', label: `Dettes (${debtsData?.meta?.total ?? 0})`, icon: <AlertTriangle className="h-4 w-4" />, content: debtsTab },
          ]}
        />
      </div>

      <ParcelFormDialog open={showCreateParcel} onClose={() => setShowCreateParcel(false)} />
    </PageTransition>
  );
}
