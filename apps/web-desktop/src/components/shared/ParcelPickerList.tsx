'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, Search } from 'lucide-react';
import { AppCheckbox } from '@/components/ui/AppCheckbox';
import { AppInput } from '@/components/ui/AppInput';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { apiClient } from '@/lib/api/client';
import { formatAmount } from '@transitsoftservices/shared';
import { cn } from '@/lib/utils/cn';

interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ParcelRow {
  id: string;
  trackingNumber: string;
  designation: string;
  weight?: number | string | null;
  volume?: number | string | null;
  status?: string | null;
  destination?: string | null;
  warehouse?: { id: string; name: string } | null;
  client?: { id: string; fullName: string } | null;
  invoice?: {
    id: string;
    status: string;
    totalAmount?: number | string | null;
    paidAmount?: number | string | null;
    balance?: number | string | null;
  } | null;
  price?: number | string | null;
  isFragile?: boolean;
  isHazardous?: boolean;
}

interface ParcelPickerListProps {
  /**
   * Endpoint API a interroger. Defaut '/parcels'. Permet d'utiliser un endpoint
   * specialise (ex: '/containers/:id/loadable-parcels') quand l'API expose deja
   * une liste filtree pour le contexte donne.
   */
  endpoint?: string;
  /** Filtres serveur passes en query string (warehouseId, containerId, ...). */
  baseFilters?: Record<string, string | number | boolean | undefined>;
  /** Cle de cache React Query (sert a invalider en parallele). */
  queryKey: readonly unknown[];
  /** IDs deja selectionnes (controle par le parent). */
  selectedIds: string[];
  onSelectedChange: (next: string[]) => void;
  /** Texte affiche quand la liste est vide. */
  emptyText?: string;
  /** Hauteur max du conteneur scrollable (px). Defaut 320. */
  maxHeight?: number;
  /** Cache la colonne magasin (utile quand le contexte est deja un magasin). */
  hideWarehouseColumn?: boolean;
}

/**
 * Liste paginee + filtrable + multi-select de colis. Sert dans les dialogs de
 * chargement / dechargement / transfert quand l'etiquette d'un colis est
 * defectueuse et qu'on doit le selectionner manuellement.
 */
export function ParcelPickerList({
  endpoint = '/parcels',
  baseFilters,
  queryKey,
  selectedIds,
  onSelectedChange,
  emptyText = 'Aucun colis trouve.',
  maxHeight = 320,
  hideWarehouseColumn = false,
}: ParcelPickerListProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const params = useMemo(
    () => ({
      ...(baseFilters ?? {}),
      page,
      limit,
      search: search.trim() || undefined,
    }),
    [baseFilters, page, search],
  );

  const { data, isLoading } = useQuery({
    queryKey: [...queryKey, params],
    queryFn: () => apiClient.get(endpoint, { params }).then((r) => r.data),
  });

  const rows: ParcelRow[] = data?.data ?? [];
  const meta: PageMeta = data?.meta ?? { total: 0, page: 1, limit, totalPages: 1 };

  const visibleIds = rows.map((r) => r.id);
  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const someChecked = visibleIds.some((id) => selectedIds.includes(id));

  const toggleAll = () => {
    if (allChecked) {
      onSelectedChange(selectedIds.filter((id) => !visibleIds.includes(id)));
    } else {
      onSelectedChange(Array.from(new Set([...selectedIds, ...visibleIds])));
    }
  };
  const toggleOne = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectedChange(selectedIds.filter((x) => x !== id));
    } else {
      onSelectedChange([...selectedIds, id]);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <AppInput
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Rechercher par tracking, designation, client..."
            className="pl-8"
          />
        </div>
        <AppBadge variant="info">{meta.total} colis</AppBadge>
        {selectedIds.length > 0 && (
          <AppBadge variant="success">{selectedIds.length} selectionne(s)</AppBadge>
        )}
      </div>

      <div
        className="rounded-xl border border-gray-100 overflow-hidden"
        style={{ maxHeight: maxHeight + 40 }}
      >
        {isLoading ? (
          <p className="p-4 text-sm text-gray-400">Chargement...</p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <Package className="h-10 w-10 text-gray-300" />
            <p className="text-sm text-gray-500">{emptyText}</p>
          </div>
        ) : (
          <div className="overflow-y-auto" style={{ maxHeight }}>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="w-10 p-3" onClick={(e) => e.stopPropagation()}>
                    <AppCheckbox checked={allChecked} onCheckedChange={toggleAll} />
                  </th>
                  <th className="text-left p-3 font-medium text-gray-600">Tracking</th>
                  <th className="text-left p-3 font-medium text-gray-600">Designation</th>
                  {!hideWarehouseColumn && (
                    <th className="text-left p-3 font-medium text-gray-600 hidden md:table-cell">Magasin</th>
                  )}
                  <th className="text-left p-3 font-medium text-gray-600 hidden lg:table-cell">Client</th>
                  <th className="text-left p-3 font-medium text-gray-600 hidden md:table-cell">Pesee</th>
                  <th className="text-left p-3 font-medium text-gray-600 hidden lg:table-cell">Destination</th>
                  <th className="text-left p-3 font-medium text-gray-600">Paiement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => {
                  const checked = selectedIds.includes(r.id);
                  const pv =
                    r.weight && Number(r.weight) > 0
                      ? `${Number(r.weight).toFixed(1)} kg`
                      : r.volume && Number(r.volume) > 0
                        ? `${Number(r.volume).toFixed(2)} m3`
                        : '-';
                  return (
                    <tr
                      key={r.id}
                      onClick={() => toggleOne(r.id)}
                      className={cn(
                        'cursor-pointer transition-colors',
                        checked ? 'bg-primary-50' : 'hover:bg-gray-50',
                      )}
                    >
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <AppCheckbox checked={checked} onCheckedChange={() => toggleOne(r.id)} />
                      </td>
                      <td className="p-3 font-mono text-xs font-bold text-primary-700">
                        {r.trackingNumber}
                        <div className="flex gap-1 mt-0.5">
                          {r.isFragile && <span className="rounded bg-orange-50 px-1 py-0.5 text-[9px] text-orange-700">Fragile</span>}
                          {r.isHazardous && <span className="rounded bg-red-50 px-1 py-0.5 text-[9px] text-red-700">Dangereux</span>}
                        </div>
                      </td>
                      <td className="p-3 text-gray-700">{r.designation}</td>
                      {!hideWarehouseColumn && (
                        <td className="p-3 text-gray-500 hidden md:table-cell">{r.warehouse?.name ?? '-'}</td>
                      )}
                      <td className="p-3 text-gray-500 hidden lg:table-cell">{r.client?.fullName ?? '-'}</td>
                      <td className="p-3 text-gray-500 hidden md:table-cell font-mono text-xs">{pv}</td>
                      <td className="p-3 text-gray-500 hidden lg:table-cell">{r.destination ?? '-'}</td>
                      <td className="p-3">
                        {(() => {
                          const total = Number(r.invoice?.totalAmount ?? 0);
                          const paid = Number(r.invoice?.paidAmount ?? 0);
                          if (!r.invoice || total <= 0) {
                            return <span className="text-xs text-gray-300">-</span>;
                          }
                          const pct = Math.min(100, Math.round((paid / total) * 100));
                          const color = pct >= 100
                            ? 'bg-emerald-500'
                            : pct >= 50
                              ? 'bg-amber-500'
                              : pct > 0
                                ? 'bg-orange-500'
                                : 'bg-gray-300';
                          return (
                            <div className="flex flex-col gap-0.5 min-w-[110px]">
                              <span className="text-[11px] font-mono text-gray-700">
                                {formatAmount(paid)} / {formatAmount(total)}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                  <div className={cn('h-full transition-all', color)} style={{ width: `${pct}%` }} />
                                </div>
                                <span className={cn(
                                  'text-[10px] font-bold tabular-nums',
                                  pct >= 100 ? 'text-emerald-700' : pct > 0 ? 'text-amber-700' : 'text-gray-400',
                                )}>{pct}%</span>
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-3 py-1.5 text-xs text-gray-500">
            <span>
              Page {meta.page} / {meta.totalPages}
            </span>
            <div className="flex gap-1">
              <AppButton
                size="sm"
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Precedent
              </AppButton>
              <AppButton
                size="sm"
                variant="ghost"
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              >
                Suivant
              </AppButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
