import { Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Plus, Eye, Edit, Trash2, Truck, RotateCcw } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { SearchBar } from '@/components/shared/SearchBar';
import { ExportButton } from '@/components/shared/ExportButton';
import { RowActions } from '@/components/shared/RowActions';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { useCarriers, useDeleteCarrier, useReactivateCarrier, type CarrierItem } from '@/lib/hooks/useCarriers';
import { CarrierFormDialog, type CarrierLike } from './CarrierFormDialog';
import { Can } from '@/lib/components/Can';
import { usePermission } from '@/lib/hooks/usePermission';

function CarriersContent() {
  const navigate = useNavigate();
  const { page, search, setPage, setSearch, queryParams } = useServerPagination();
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<CarrierLike | null>(null);
  const deleteMutation = useDeleteCarrier();
  const reactivateMutation = useReactivateCarrier();
  // Permission ABAC : modification / desactivation d'un transporteur.
  const canManageCarrier = usePermission('carrier.manage');

  const { data, isLoading } = useCarriers(queryParams);

  const openEdit = (c: CarrierItem) => {
    setEditTarget({
      id: c.id,
      name: c.name,
      contactName: c.contactName,
      phone: c.phone,
      email: c.email,
      address: c.address,
      carrierType: c.carrierType,
      notes: c.notes,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditTarget(null);
  };

  const exportColumns = [
    { key: 'name', label: 'Nom' },
    { key: 'contactName', label: 'Contact' },
    { key: 'phone', label: 'Telephone' },
    { key: 'email', label: 'Email' },
    { key: 'carrierType', label: 'Type' },
    { key: 'address', label: 'Adresse' },
  ];

  const TYPE_LABELS: Record<string, string> = {
    AIR: 'Aerien',
    SEA: 'Maritime',
    LAND: 'Terrestre',
    MULTI: 'Multi-modal',
  };

  const columns = [
    {
      key: 'name',
      label: 'Nom',
      render: (row: CarrierItem) => (
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
            <Truck className="h-4 w-4 text-primary-600" />
          </div>
          <div>
            <Link to={`/carriers/${row.id}`} className="font-medium text-primary-700 hover:underline" onClick={(e) => e.stopPropagation()}>
              {row.name}
            </Link>
            {row.contactName && <p className="text-xs text-gray-400">{row.contactName}</p>}
          </div>
        </div>
      ),
    },
    {
      key: 'carrierType',
      label: 'Type',
      render: (row: CarrierItem) => row.carrierType ? <AppBadge variant="info">{TYPE_LABELS[row.carrierType] ?? row.carrierType}</AppBadge> : <span className="text-gray-300">-</span>,
    },
    { key: 'phone', label: 'Telephone', render: (row: CarrierItem) => row.phone || '-' },
    { key: 'email', label: 'Email', render: (row: CarrierItem) => row.email || '-' },
    {
      key: 'client',
      label: 'Client associe',
      render: (row: CarrierItem) => row.client?.id ? (
        <Link to={`/clients/${row.client.id}`} className="text-xs text-primary-700 hover:underline" onClick={(e) => e.stopPropagation()}>
          {row.client.fullName}
        </Link>
      ) : <span className="text-gray-300">-</span>,
    },
    {
      key: 'isActive',
      label: 'Statut',
      render: (row: CarrierItem) => <AppBadge variant={row.isActive ? 'success' : 'error'}>{row.isActive ? 'Actif' : 'Inactif'}</AppBadge>,
    },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (row: CarrierItem) => (
        <RowActions
          actions={[
            { label: 'Voir', icon: <Eye className="h-4 w-4" />, onClick: () => navigate(`/carriers/${row.id}`) },
            ...(canManageCarrier
              ? [
                  { label: 'Modifier', icon: <Edit className="h-4 w-4" />, onClick: () => openEdit(row) },
                  ...(row.isActive
                    ? [{ label: 'Desactiver', icon: <Trash2 className="h-4 w-4" />, onClick: () => deleteMutation.mutate(row.id), variant: 'destructive' as const }]
                    : [{ label: 'Reactiver', icon: <RotateCcw className="h-4 w-4" />, onClick: () => reactivateMutation.mutate(row.id) }]),
                ]
              : []),
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
            <h1 className="text-2xl font-bold text-gray-900">Transporteurs</h1>
            <p className="text-sm text-gray-500 mt-1">{data?.meta?.total ?? 0} transporteur(s)</p>
          </div>
          <div className="flex gap-2">
            <Can permission="carrier.manage">
              <AppButton onClick={() => { setEditTarget(null); setShowForm(true); }}>
                <Plus className="h-4 w-4" />
                Nouveau transporteur
              </AppButton>
            </Can>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Rechercher par nom..." />
          </div>
          <div className="flex items-center gap-2">
            <ExportButton data={data?.data || []} columns={exportColumns} fileName="transporteurs" />
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
            onRowClick={(row) => navigate(`/carriers/${row.id}`)}
          />
        </AppCard>

        <CarrierFormDialog open={showForm} onClose={closeForm} carrier={editTarget} />
      </div>
    </PageTransition>
  );
}

export default function CarriersPage() {
  return <Suspense><CarriersContent /></Suspense>;
}
