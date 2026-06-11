import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Plus, Upload, Eye, Edit, Trash2 } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { AppBadge } from '@/components/ui/AppBadge';
import { SearchBar } from '@/components/shared/SearchBar';
import { FilterDialog } from '@/components/shared/FilterDialog';
import { ExportButton } from '@/components/shared/ExportButton';
import { CsvImportDialog } from '@/components/shared/CsvImportDialog';
import { RowActions } from '@/components/shared/RowActions';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { searchers } from '@/lib/api/searchers';
import { formatAmount } from '@transitsoftservices/shared';
import { toast } from 'sonner';
import { EmployeeFormDialog } from './EmployeeFormDialog';

export default function EmployeesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusTab, setStatusTab] = useState<'active' | 'former'>('active');
  const [toDelete, setToDelete] = useState<{ id: string; fullName: string } | null>(null);
  const agencyIdFilter = searchParams.get('agencyId') || '';
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/employees/${id}`),
    onSuccess: () => {
      toast.success('Employe supprime');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setToDelete(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Suppression impossible');
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['employees', agencyIdFilter, page, search, statusTab],
    queryFn: () => apiClient.get('/employees', {
      params: {
        page,
        limit: 20,
        search: search || undefined,
        agencyId: agencyIdFilter || undefined,
        status: statusTab,
      },
    }).then((r) => r.data),
  });

  const handleImport = async (rows: Record<string, string>[]) => {
    let success = 0;
    for (const row of rows) {
      try {
        await apiClient.post('/employees', {
          fullName: row.fullName,
          agencyId: row.agencyId,
          position: row.position,
          phone: row.phone,
        });
        success++;
      } catch { /* skip */ }
    }
    toast.success(`${success}/${rows.length} employes importes`);
  };

  const exportColumns = [
    { key: 'fullName', label: 'Nom complet' },
    { key: 'position', label: 'Poste' },
    { key: 'phone', label: 'Telephone' },
    { key: 'baseSalary', label: 'Salaire de base' },
  ];

  const filterFields = [
    {
      key: 'agencyId',
      label: 'Agence',
      type: 'search-select' as const,
      searcher: searchers.agencies,
    },
  ];

  const columns = [
    { key: 'fullName', label: 'Nom complet', render: (row: any) => <Link to={`/employees/${row.id}`} className="text-primary-700 font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{row.fullName}</Link> },
    { key: 'agency', label: 'Agence', render: (row: any) => <span className="text-sm">{row.agency?.name || '-'}</span> },
    { key: 'position', label: 'Poste' },
    { key: 'phone', label: 'Telephone', render: (row: any) => row.phone || '-' },
    { key: 'baseSalary', label: 'Salaire de base', render: (row: any) => formatAmount(Number(row.baseSalary)) },
    { key: 'isActive', label: 'Statut', render: (row: any) => <AppBadge variant={row.isActive ? 'success' : 'error'}>{row.isActive ? 'Actif' : 'Inactif'}</AppBadge> },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (row: any) => (
        <RowActions actions={[
          { label: 'Voir details', icon: <Eye className="h-4 w-4" />, onClick: () => navigate(`/employees/${row.id}`) },
          { label: 'Modifier', icon: <Edit className="h-4 w-4" />, onClick: () => navigate(`/employees/${row.id}`) },
          ...(row.isActive ? [{
            label: 'Supprimer',
            icon: <Trash2 className="h-4 w-4" />,
            variant: 'destructive' as const,
            onClick: () => setToDelete({ id: row.id, fullName: row.fullName }),
          }] : []),
        ]} />
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Personnel</h1>
            <p className="text-sm text-gray-500 mt-1">{data?.meta?.total ?? 0} employes.</p>
          </div>
          <div className="flex gap-2">
            <AppButton variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4" />
              Importer
            </AppButton>
            <AppButton onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouvel employe</AppButton>
          </div>
        </div>

        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {([
            { value: 'active', label: 'Employes actifs' },
            { value: 'former', label: 'Anciens employes' },
          ] as const).map((t) => (
            <button
              key={t.value}
              onClick={() => { setStatusTab(t.value); setPage(1); }}
              className={
                'px-3 py-1.5 text-sm font-medium rounded-md transition-colors ' +
                (statusTab === t.value
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900')
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Rechercher un employe..." />
          </div>
          <div className="flex items-center gap-2">
            <ExportButton data={data?.data || []} columns={exportColumns} fileName="employes" />
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
            limit={20}
            onPageChange={setPage}
            onRowClick={(row) => navigate(`/employees/${row.id}`)}
          />
        </AppCard>
      </div>
      <EmployeeFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteMutation.mutate(toDelete.id)}
        title="Supprimer l'employe"
        message={`Confirmer la suppression de ${toDelete?.fullName ?? ''} ? Il sera retire de la liste et de la masse salariale. Action reversible cote base (soft delete).`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
      />
      <CsvImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImport}
        title="Importer des employes"
        requiredColumns={['fullName', 'agencyId', 'position', 'phone']}
        columnLabels={{ fullName: 'Nom complet', agencyId: 'ID Agence', position: 'Poste', phone: 'Telephone' }}
      />
    </PageTransition>
  );
}
