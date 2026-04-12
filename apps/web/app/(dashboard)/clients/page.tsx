'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Upload, Users, Eye, Package, CreditCard } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { SearchBar } from '@/components/shared/SearchBar';
import { FilterDialog } from '@/components/shared/FilterDialog';
import { ExportButton } from '@/components/shared/ExportButton';
import { CsvImportDialog } from '@/components/shared/CsvImportDialog';
import { RowActions } from '@/components/shared/RowActions';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { useClients } from '@/lib/hooks/useClients';
import { useAgencies } from '@/lib/hooks/useAgencies';
import { ClientFormDialog } from './ClientFormDialog';
import { apiClient } from '@/lib/api/client';
import { formatAmount } from '@optipack/shared';
import { toast } from 'sonner';

const TIER_VARIANT: Record<string, 'default' | 'info' | 'warning' | 'success'> = {
  STANDARD: 'default', SILVER: 'info', GOLD: 'warning', VIP: 'success',
};

function ClientsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { page, search, setPage, setSearch, queryParams } = useServerPagination();
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const { data: agenciesData } = useAgencies({ limit: 100 });

  const agencyFilter = searchParams.get('agencyId') || '';
  const loyaltyTierFilter = searchParams.get('loyaltyTier') || '';

  const { data, isLoading } = useClients({
    ...queryParams,
    agencyId: agencyFilter || undefined,
    loyaltyTier: loyaltyTierFilter || undefined,
  } as any);

  const handleImport = async (rows: Record<string, string>[]) => {
    let success = 0;
    for (const row of rows) {
      try {
        await apiClient.post('/clients', {
          fullName: row.fullName || row.nom,
          phone: row.phone || row.telephone,
          email: row.email || '',
          address: row.address || row.adresse || '',
          agencyId: agencyFilter || agenciesData?.data?.[0]?.id,
        });
        success++;
      } catch { /* skip */ }
    }
    toast.success(`${success}/${rows.length} clients importes`);
  };

  const exportColumns = [
    { key: 'fullName', label: 'Nom' },
    { key: 'phone', label: 'Telephone' },
    { key: 'email', label: 'Email' },
    { key: 'loyaltyTier', label: 'Fidelite' },
    { key: 'loyaltyPoints', label: 'Points' },
    { key: 'totalSpent', label: 'Total depense' },
  ];

  const filterFields = [
    {
      key: 'agencyId',
      label: 'Agence',
      type: 'select' as const,
      options: (agenciesData?.data || []).map((a: any) => ({ value: a.id, label: a.name })),
    },
    {
      key: 'loyaltyTier',
      label: 'Palier',
      type: 'select' as const,
      options: [
        { value: 'STANDARD', label: 'Standard' },
        { value: 'SILVER', label: 'Silver' },
        { value: 'GOLD', label: 'Gold' },
        { value: 'VIP', label: 'VIP' },
      ],
    },
  ];

  const columns = [
    {
      key: 'fullName',
      label: 'Client',
      render: (row: any) => (
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50">
            <Users className="h-4 w-4 text-primary-600" />
          </div>
          <div>
            <Link href={`/clients/${row.id}`} className="font-medium text-primary-700 hover:underline" onClick={(e) => e.stopPropagation()}>{row.fullName}</Link>
            <p className="text-xs text-gray-400">{row.phone}</p>
          </div>
        </div>
      ),
    },
    { key: 'email', label: 'Email', render: (row: any) => <span className="text-sm">{row.email || '-'}</span> },
    { key: 'agency', label: 'Agence', render: (row: any) => <span className="text-sm">{row.agency?.name || '-'}</span> },
    {
      key: 'loyaltyTier',
      label: 'Fidelite',
      render: (row: any) => <AppBadge variant={TIER_VARIANT[row.loyaltyTier] || 'default'}>{row.loyaltyTier}</AppBadge>,
    },
    { key: 'loyaltyPoints', label: 'Points', render: (row: any) => <span className="text-sm font-medium">{row.loyaltyPoints}</span> },
    {
      key: 'totalSpent',
      label: 'Total depense',
      render: (row: any) => <span className="text-sm font-bold text-gray-900">{formatAmount(Number(row.totalSpent))}</span>,
    },
    { key: '_count', label: 'Colis', render: (row: any) => <span className="text-sm">{row._count?.parcels ?? 0}</span> },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (row: any) => (
        <RowActions actions={[
          { label: 'Voir le profil', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/clients/${row.id}`) },
          { label: 'Voir les colis', icon: <Package className="h-4 w-4" />, onClick: () => router.push(`/parcels?clientId=${row.id}`) },
          { label: 'Voir les factures', icon: <CreditCard className="h-4 w-4" />, onClick: () => router.push(`/invoices?clientId=${row.id}`) },
        ]} />
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
            <p className="text-sm text-gray-500 mt-1">{data?.meta?.total ?? 0} clients</p>
          </div>
          <div className="flex gap-2">
            <AppButton variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4" />
              Importer
            </AppButton>
            <AppButton onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              Nouveau client
            </AppButton>
          </div>
        </div>

        {/* Search --- Export | Filtres | Effacer */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Nom, telephone, email..." />
          </div>
          <div className="flex items-center gap-2">
            <ExportButton data={data?.data || []} columns={exportColumns} fileName="clients" />
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
            onRowClick={(row) => router.push(`/clients/${row.id}`)}
          />
        </AppCard>

        <ClientFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
        <CsvImportDialog
          open={showImport}
          onClose={() => setShowImport(false)}
          onImport={handleImport}
          title="Importer des clients"
          requiredColumns={['fullName', 'phone']}
          columnLabels={{ fullName: 'Nom complet', phone: 'Telephone', email: 'Email', address: 'Adresse' }}
        />
      </div>
    </PageTransition>
  );
}

export default function ClientsPage() {
  return <Suspense><ClientsContent /></Suspense>;
}
