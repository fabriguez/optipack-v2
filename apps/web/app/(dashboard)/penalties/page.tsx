'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Eye } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { AppBadge } from '@/components/ui/AppBadge';
import { SearchBar } from '@/components/shared/SearchBar';
import { FilterDialog } from '@/components/shared/FilterDialog';
import { ExportButton } from '@/components/shared/ExportButton';
import { RowActions } from '@/components/shared/RowActions';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { formatAmount } from '@optipack/shared';
import { toast } from 'sonner';

export default function PenaltiesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const qc = useQueryClient();

  const isPaidFilter = searchParams.get('isPaid') || '';

  const { data, isLoading } = useQuery({
    queryKey: ['penalties', { page, isPaid: isPaidFilter }],
    queryFn: () => apiClient.get('/penalties', {
      params: {
        page,
        limit: 20,
        isPaid: isPaidFilter || undefined,
      },
    }).then((r) => r.data),
  });

  const exportColumns = [
    { key: 'parcel', label: 'Colis' },
    { key: 'client', label: 'Client' },
    { key: 'daysAccumulated', label: 'Jours accumules' },
    { key: 'totalAmount', label: 'Montant total' },
    { key: 'isPaid', label: 'Paye' },
  ];

  const filterFields = [
    {
      key: 'isPaid',
      label: 'Statut de paiement',
      type: 'select' as const,
      options: [
        { value: 'true', label: 'Paye' },
        { value: 'false', label: 'Impaye' },
      ],
    },
  ];

  const calculateMutation = useMutation({
    mutationFn: () => apiClient.post('/penalties/calculate').then((r) => r.data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['penalties'] });
      toast.success(`Penalites calculees : ${res.data.created} nouvelles, ${res.data.updated} mises a jour`);
    },
  });

  const columns = [
    { key: 'parcel', label: 'Colis', render: (row: any) => <Link href={`/penalties/${row.id}`} className="text-primary-700 font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{row.parcel?.trackingNumber || '-'}</Link> },
    { key: 'client', label: 'Client', render: (row: any) => row.client?.fullName || '-' },
    { key: 'daysAccumulated', label: 'Jours' },
    { key: 'dailyRate', label: 'Taux/jour', render: (row: any) => formatAmount(Number(row.dailyRate)) },
    { key: 'totalAmount', label: 'Total', render: (row: any) => <span className="font-semibold text-red-600">{formatAmount(Number(row.totalAmount))}</span> },
    { key: 'isPaid', label: 'Statut', render: (row: any) => <AppBadge variant={row.isPaid ? 'success' : 'error'}>{row.isPaid ? 'Paye' : 'Impaye'}</AppBadge> },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (row: any) => (
        <RowActions actions={[
          { label: 'Voir details', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/penalties/${row.id}`) },
        ]} />
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Penalites de stockage</h1>
            <p className="text-sm text-gray-500 mt-1">Penalites automatiques apres 10 jours en agence de destination.</p>
          </div>
          <AppButton variant="outline" onClick={() => calculateMutation.mutate()} loading={calculateMutation.isPending}>
            Recalculer les penalites
          </AppButton>
        </div>

        {/* Search --- Export | Filtres | Effacer */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Rechercher une penalite..." />
          </div>
          <div className="flex items-center gap-2">
            <ExportButton data={data?.data || []} columns={exportColumns} fileName="penalites" />
            <FilterDialog fields={filterFields} />
          </div>
        </div>

        <AppCard padding="sm">
          <AppDataTable columns={columns} data={data?.data || []} isLoading={isLoading} page={page} totalPages={data?.meta?.totalPages || 1} total={data?.meta?.total} onPageChange={setPage} />
        </AppCard>
      </div>
    </PageTransition>
  );
}
