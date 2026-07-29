'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Search } from 'lucide-react';
import { AppCheckbox } from '@/components/ui/AppCheckbox';
import { AppInput } from '@/components/ui/AppInput';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';

interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ClientRow {
  id: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  clientType?: string | null;
  loyaltyTier?: string | null;
}

interface ClientPickerListProps {
  /** IDs deja selectionnes (controle par le parent). */
  selectedIds: string[];
  onSelectedChange: (next: string[]) => void;
  /** IDs a masquer (ex: clients deja attribues). */
  excludeIds?: string[];
  emptyText?: string;
  /** Hauteur max du conteneur scrollable (px). Defaut 320. */
  maxHeight?: number;
}

/**
 * Liste paginee + recherchable + multi-select de clients. Pendant de
 * ParcelPickerList pour tout ce qui s'attribue a une liste de clients
 * (aujourd'hui : les codes promo).
 */
export function ClientPickerList({
  selectedIds,
  onSelectedChange,
  excludeIds,
  emptyText = 'Aucun client trouve.',
  maxHeight = 320,
}: ClientPickerListProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const params = useMemo(
    () => ({ page, limit, search: search.trim() || undefined }),
    [page, search],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['clients', 'picker', params],
    queryFn: () => apiClient.get('/clients', { params }).then((r) => r.data),
  });

  const excluded = useMemo(() => new Set(excludeIds ?? []), [excludeIds]);
  const rows: ClientRow[] = (data?.data ?? []).filter((r: ClientRow) => !excluded.has(r.id));
  const meta: PageMeta = data?.meta ?? { total: 0, page: 1, limit, totalPages: 1 };

  const visibleIds = rows.map((r) => r.id);
  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

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
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <AppInput
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Rechercher un client (nom, telephone, email)..."
            className="pl-8"
          />
        </div>
        <AppBadge variant="info">{meta.total} clients</AppBadge>
        {selectedIds.length > 0 && (
          <AppBadge variant="success">{selectedIds.length} selectionne(s)</AppBadge>
        )}
      </div>

      <div
        className="overflow-hidden rounded-xl border border-gray-100"
        style={{ maxHeight: maxHeight + 40 }}
      >
        {isLoading ? (
          <p className="p-4 text-sm text-gray-400">Chargement...</p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <Users className="h-10 w-10 text-gray-300" />
            <p className="text-sm text-gray-500">{emptyText}</p>
          </div>
        ) : (
          <div className="overflow-y-auto" style={{ maxHeight }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="w-10 p-3" onClick={(e) => e.stopPropagation()}>
                    <AppCheckbox checked={allChecked} onCheckedChange={toggleAll} />
                  </th>
                  <th className="p-3 text-left font-medium text-gray-600">Nom</th>
                  <th className="hidden p-3 text-left font-medium text-gray-600 md:table-cell">
                    Telephone
                  </th>
                  <th className="hidden p-3 text-left font-medium text-gray-600 lg:table-cell">
                    Email
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => {
                  const checked = selectedIds.includes(r.id);
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
                      <td className="p-3 font-medium text-gray-700">{r.fullName}</td>
                      <td className="hidden p-3 font-mono text-xs text-gray-500 md:table-cell">
                        {r.phone ?? '-'}
                      </td>
                      <td className="hidden p-3 text-gray-500 lg:table-cell">{r.email ?? '-'}</td>
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
