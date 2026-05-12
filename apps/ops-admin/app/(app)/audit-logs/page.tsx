'use client';
import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: string;
  opsAdminId?: string | null;
}

interface PageResponse {
  data: AuditLog[];
  nextCursor: string | null;
}

const PAGE_SIZE = 50;

export default function AuditLogsPage() {
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');

  const query = useInfiniteQuery<PageResponse>({
    queryKey: ['audit-logs', { actionFilter, entityFilter }],
    queryFn: async ({ pageParam }) => {
      const res = await api.get('/audit-logs', {
        params: {
          limit: PAGE_SIZE,
          cursor: pageParam || undefined,
          action: actionFilter || undefined,
          entityType: entityFilter || undefined,
        },
      });
      return { data: res.data?.data ?? [], nextCursor: res.data?.nextCursor ?? null };
    },
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit logs</h1>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Filtre action (ex: TENANT_FROZEN)"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-md border bg-white px-3 py-1.5 text-sm shadow-sm"
        />
        <input
          type="search"
          placeholder="Filtre entite (ex: Tenant)"
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="rounded-md border bg-white px-3 py-1.5 text-sm shadow-sm"
        />
        {(actionFilter || entityFilter) && (
          <button
            type="button"
            onClick={() => {
              setActionFilter('');
              setEntityFilter('');
            }}
            className="text-xs text-gray-500 underline hover:text-gray-700"
          >
            Reinitialiser
          </button>
        )}
      </div>

      <div className="rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-normal">Date</th>
              <th className="px-4 py-2 text-left font-normal">Action</th>
              <th className="px-4 py-2 text-left font-normal">Entite</th>
              <th className="px-4 py-2 text-left font-normal">Acteur</th>
              <th className="px-4 py-2 text-left font-normal">IP</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-400">
                  Chargement...
                </td>
              </tr>
            )}
            {!query.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-400">
                  Aucun log.
                </td>
              </tr>
            )}
            {rows.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="px-4 py-2 text-xs text-gray-500">{formatDate(a.createdAt)}</td>
                <td className="px-4 py-2 font-mono text-xs">{a.action}</td>
                <td className="px-4 py-2 text-xs">
                  {a.entityType}
                  {a.entityId ? <span className="text-gray-500"> / {a.entityId.slice(0, 8)}</span> : ''}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500 font-mono">
                  {a.opsAdminId ? a.opsAdminId.slice(0, 8) : 'system'}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{a.ipAddress ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-gray-500">
          <span>{rows.length} log(s) charge(s)</span>
          <button
            type="button"
            onClick={() => query.fetchNextPage()}
            disabled={!query.hasNextPage || query.isFetchingNextPage}
            className="inline-flex items-center gap-1 rounded-md border bg-white px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {query.isFetchingNextPage ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Chargement...
              </>
            ) : query.hasNextPage ? (
              'Charger plus'
            ) : (
              'Fin des resultats'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
