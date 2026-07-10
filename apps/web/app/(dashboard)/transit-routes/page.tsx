'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Upload, Route, Eye, Edit } from 'lucide-react';
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
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { formatAmount } from '@transitsoftservices/shared';
import { toast } from 'sonner';
import { TransitRouteFormDialog } from './TransitRouteFormDialog';
import { Can } from '@/lib/components/Can';

const TYPE_COLORS: Record<string, string> = {
  AIR: 'bg-blue-50 text-blue-700',
  SEA: 'bg-cyan-50 text-cyan-700',
  LAND: 'bg-amber-50 text-amber-700',
};
const TYPE_LABELS: Record<string, string> = { AIR: 'Aerien', SEA: 'Maritime', LAND: 'Terrestre' };

/** Formate la valeur ajoutee : "+2 000 FCFA" (montant), "+10%" (pourcentage), "-" sinon. */
function formatAddedValue(value: unknown, type: unknown): string {
  const n = Number(value);
  if (!type || !Number.isFinite(n) || n <= 0) return '-';
  if (type === 'PERCENT') return `+${n}%`;
  return `+${n.toLocaleString('fr-FR')} FCFA`;
}

export default function TransitRoutesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const typeFilter = searchParams.get('type') || '';
  const isActiveFilter = searchParams.get('isActive') || '';

  const { data, isLoading } = useQuery({
    queryKey: ['transit-routes', { page, type: typeFilter, isActive: isActiveFilter }],
    queryFn: () => apiClient.get('/transit-routes', {
      params: {
        page,
        limit: 20,
        type: typeFilter || undefined,
        isActive: isActiveFilter || undefined,
      },
    }).then((r) => r.data),
  });

  const handleImport = async (rows: Record<string, string>[]) => {
    let success = 0;
    for (const row of rows) {
      try {
        await apiClient.post('/transit-routes', {
          name: row.name,
          type: row.type,
          departureCity: row.departureCity,
          departureCountry: row.departureCountry,
          arrivalCity: row.arrivalCity,
          arrivalCountry: row.arrivalCountry,
          pricePerKg: Number(row.pricePerKg),
        });
        success++;
      } catch { /* skip */ }
    }
    toast.success(`${success}/${rows.length} routes importees`);
  };

  const exportColumns = [
    { key: 'name', label: 'Nom' },
    { key: 'type', label: 'Type' },
    { key: 'departureCity', label: 'Ville depart' },
    { key: 'arrivalCity', label: 'Ville arrivee' },
    { key: 'pricePerKg', label: 'Prix/kg' },
    { key: 'estimatedDurationDays', label: 'Delai (jours)' },
  ];

  const filterFields = [
    {
      key: 'type',
      label: 'Type',
      type: 'select' as const,
      options: [
        { value: 'AIR', label: 'Aerien' },
        { value: 'SEA', label: 'Maritime' },
        { value: 'LAND', label: 'Terrestre' },
      ],
    },
    {
      key: 'isActive',
      label: 'Statut',
      type: 'select' as const,
      options: [
        { value: 'true', label: 'Actif' },
        { value: 'false', label: 'Inactif' },
      ],
    },
  ];

  const columns = [
    { key: 'name', label: 'Nom', render: (row: any) => <Link href={`/transit-routes/${row.id}`} className="text-primary-700 font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{row.name}</Link> },
    { key: 'type', label: 'Type', render: (row: any) => (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${TYPE_COLORS[row.type] || ''}`}>{TYPE_LABELS[row.type] || row.type}</span>
    )},
    { key: 'departure', label: 'Depart', render: (row: any) => `${row.departureCity}, ${row.departureCountry}` },
    { key: 'arrival', label: 'Arrivee', render: (row: any) => `${row.arrivalCity}, ${row.arrivalCountry}` },
    { key: 'pricePerKg', label: 'Prix/kg', render: (row: any) => formatAmount(Number(row.pricePerKg)) },
    { key: 'pricePerVolume', label: 'Prix/m3', render: (row: any) => Number(row.pricePerVolume) > 0 ? formatAmount(Number(row.pricePerVolume)) : '-' },
    { key: 'addedValue', label: 'Valeur ajoutee', render: (row: any) => formatAddedValue(row.addedValue, row.addedValueType) },
    { key: 'estimatedDurationDays', label: 'Delai', render: (row: any) => `${row.estimatedDurationDays}j` },
    { key: 'isActive', label: 'Statut', render: (row: any) => <AppBadge variant={row.isActive ? 'success' : 'error'}>{row.isActive ? 'Actif' : 'Inactif'}</AppBadge> },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (row: any) => (
        <RowActions actions={[
          { label: 'Voir details', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/transit-routes/${row.id}`) },
          { label: 'Modifier', icon: <Edit className="h-4 w-4" />, onClick: () => router.push(`/transit-routes/${row.id}`) },
        ]} />
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Routes de transit</h1>
            <p className="text-sm text-gray-500 mt-1">Configuration des routes et tarification.</p>
          </div>
          <div className="flex gap-2">
            <Can permission="transitroute.manage">
              <AppButton variant="outline" onClick={() => setShowImport(true)}>
                <Upload className="h-4 w-4" />
                Importer
              </AppButton>
              <AppButton onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouvelle route</AppButton>
            </Can>
          </div>
        </div>

        {/* Search --- Export | Filtres | Effacer */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Rechercher une route..." />
          </div>
          <div className="flex items-center gap-2">
            <ExportButton data={data?.data || []} columns={exportColumns} fileName="routes-transit" />
            <FilterDialog fields={filterFields} />
          </div>
        </div>

        <AppCard padding="sm">
          <AppDataTable columns={columns} data={data?.data || []} isLoading={isLoading} page={page} totalPages={data?.meta?.totalPages || 1} total={data?.meta?.total} onPageChange={setPage} />
        </AppCard>
      </div>
      <TransitRouteFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
      <CsvImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImport}
        title="Importer des routes de transit"
        requiredColumns={['name', 'type', 'departureCity', 'departureCountry', 'arrivalCity', 'arrivalCountry', 'pricePerKg']}
        columnLabels={{ name: 'Nom', type: 'Type', departureCity: 'Ville depart', departureCountry: 'Pays depart', arrivalCity: 'Ville arrivee', arrivalCountry: 'Pays arrivee', pricePerKg: 'Prix/kg' }}
      />
    </PageTransition>
  );
}
