'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Upload, Users, Eye, Package, CreditCard, Edit, Trash2 } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { Can } from '@/lib/components/Can';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { SearchBar } from '@/components/shared/SearchBar';
import { FilterDialog } from '@/components/shared/FilterDialog';
import { XlsxExportButton } from '@/components/shared/XlsxExportButton';
import { XlsxImportDialog } from '@/components/shared/XlsxImportDialog';
import { RowActions } from '@/components/shared/RowActions';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { useClients, useDeleteClient } from '@/lib/hooks/useClients';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { searchers } from '@/lib/api/searchers';
import { ClientFormDialog } from './ClientFormDialog';
import { formatAmount } from '@transitsoftservices/shared';

const TIER_VARIANT: Record<string, 'default' | 'info' | 'warning' | 'success'> = {
  STANDARD: 'default', SILVER: 'info', GOLD: 'warning', VIP: 'success',
};

function ClientsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { page, search, setPage, setSearch, queryParams } = useServerPagination();
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editClient, setEditClient] = useState<any | null>(null);
  const [confirmDeleteClient, setConfirmDeleteClient] = useState<any | null>(null);
  const deleteMut = useDeleteClient();


  const agencyFilter = searchParams.get('agencyId') || '';
  const loyaltyTierFilter = searchParams.get('loyaltyTier') || '';

  const { data, isLoading } = useClients({
    ...queryParams,
    agencyId: agencyFilter || undefined,
    loyaltyTier: loyaltyTierFilter || undefined,
  } as any);

  // Import XLSX desormais entierement gere cote backend via /imports/clients.
  // Le dialog gere lui-meme l'upload + le rapport. On invalide juste la liste.
  const handleImportDone = () => {
    // Force un refetch de la liste apres import.
    // useClients utilise react-query, qui le reprendra au prochain mount via queryParams.
    // En attendant : reload soft.
    router.refresh();
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
      type: 'search-select' as const,
      searcher: searchers.agencies,
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
            <div className="flex items-center gap-1.5">
              <Link href={`/clients/${row.id}`} className="font-medium text-primary-700 hover:underline" onClick={(e) => e.stopPropagation()}>{row.fullName}</Link>
              {row.employee && (
                <AppBadge variant="info" className="text-[10px]">Employe</AppBadge>
              )}
              {row.carrier && (
                <AppBadge variant="warning" className="text-[10px]">Transporteur</AppBadge>
              )}
            </div>
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
          { label: 'Modifier', icon: <Edit className="h-4 w-4" />, onClick: () => setEditClient(row) },
          { label: 'Supprimer', icon: <Trash2 className="h-4 w-4" />, onClick: () => setConfirmDeleteClient(row), variant: 'destructive' as const },
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
            <Can permission="client.create">
              <AppButton onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" />
                Nouveau client
              </AppButton>
            </Can>
          </div>
        </div>

        {/* Search --- Export | Filtres | Effacer */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Nom, telephone, email..." />
          </div>
          <div className="flex items-center gap-2">
            <XlsxExportButton endpoint="clients" fileName="clients" />
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
        <ClientFormDialog
          open={!!editClient}
          onClose={() => setEditClient(null)}
          client={editClient}
        />
        <ConfirmDialog
          open={!!confirmDeleteClient}
          onClose={() => setConfirmDeleteClient(null)}
          title="Supprimer ce client ?"
          message={
            confirmDeleteClient
              ? `Le client "${confirmDeleteClient.fullName}" sera supprime (soft-delete). ` +
                `Ses colis, factures et historique restent intacts pour audit, ` +
                `mais il ne sera plus visible dans les listings.`
              : ''
          }
          confirmLabel="Supprimer"
          variant="destructive"
          loading={deleteMut.isPending}
          onConfirm={() => {
            if (!confirmDeleteClient) return;
            deleteMut.mutate(confirmDeleteClient.id, {
              onSuccess: () => setConfirmDeleteClient(null),
            });
          }}
        />
        <XlsxImportDialog
          open={showImport}
          onClose={() => setShowImport(false)}
          endpoint="clients"
          title="Importer des clients (XLSX)"
          hint="Utilise le template export comme base. Colonnes obligatoires : Nom complet + Telephone. Une ligne par client. Les doublons (meme telephone) sont ignores."
          onDone={handleImportDone}
        />
      </div>
    </PageTransition>
  );
}

export default function ClientsPage() {
  return <Suspense><ClientsContent /></Suspense>;
}
