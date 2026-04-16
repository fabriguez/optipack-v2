'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, Package } from 'lucide-react';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDataTable, type Column } from '@/components/ui/AppDataTable';
import { PageTransition } from '@/components/shared/PageTransition';
import { clientPortalApi } from '@/lib/api/client-portal';

interface Parcel {
  id: string;
  tracking: string;
  designation: string;
  status: string;
  destination: string;
  weight?: number;
  createdAt: string;
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' }> = {
  RECEIVED: { label: 'Recu', variant: 'info' },
  IN_STOCK: { label: 'En stock', variant: 'default' },
  IN_TRANSIT: { label: 'En transit', variant: 'warning' },
  ARRIVED: { label: 'Arrive', variant: 'info' },
  DELIVERED: { label: 'Livre', variant: 'success' },
  LOST: { label: 'Perdu', variant: 'error' },
};

const LIMIT = 20;

export default function PortalParcelsPage() {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const fetchParcels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await clientPortalApi.getParcels({
        page,
        limit: LIMIT,
        search: search || undefined,
      });
      setParcels(res.data?.items || res.data || []);
      setTotalPages(res.data?.totalPages || 1);
      setTotal(res.data?.total || 0);
    } catch {
      setParcels([]);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchParcels();
  }, [fetchParcels]);

  function handleSearch() {
    setPage(1);
    setSearch(searchInput.trim());
  }

  const columns: Column<Parcel>[] = [
    {
      key: 'tracking',
      label: 'Tracking',
      render: (row) => (
        <span className="font-mono text-sm font-medium text-primary-700">
          {row.tracking}
        </span>
      ),
    },
    {
      key: 'designation',
      label: 'Designation',
      render: (row) => (
        <span className="text-sm text-gray-900">{row.designation}</span>
      ),
    },
    {
      key: 'destination',
      label: 'Destination',
      render: (row) => (
        <span className="text-sm text-gray-600">{row.destination}</span>
      ),
    },
    {
      key: 'status',
      label: 'Statut',
      render: (row) => {
        const info = STATUS_MAP[row.status] || {
          label: row.status,
          variant: 'default' as const,
        };
        return <AppBadge variant={info.variant}>{info.label}</AppBadge>;
      },
    },
    {
      key: 'createdAt',
      label: 'Date',
      render: (row) => (
        <span className="text-sm text-gray-500">
          {new Date(row.createdAt).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes Colis</h1>
          <p className="mt-1 text-sm text-gray-500">
            Suivez tous vos colis et leurs statuts.
          </p>
        </div>

        <AppCard>
          <AppCardHeader
            title="Liste des colis"
            action={
              <div className="flex items-center gap-2">
                <div className="relative">
                  <AppInput
                    placeholder="Rechercher par tracking..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSearch();
                    }}
                    className="w-64 pr-10"
                  />
                  <button
                    onClick={handleSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary-600 transition-colors"
                  >
                    <Search className="h-4 w-4" />
                  </button>
                </div>
              </div>
            }
          />
          <AppDataTable
            columns={columns}
            data={parcels}
            isLoading={loading}
            page={page}
            totalPages={totalPages}
            total={total}
            limit={LIMIT}
            onPageChange={setPage}
            emptyMessage="Aucun colis trouve"
            emptyIcon={<Package className="h-10 w-10 text-gray-300" />}
          />
        </AppCard>
      </div>
    </PageTransition>
  );
}
