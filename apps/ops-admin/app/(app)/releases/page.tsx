'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Pencil, Rocket, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Pagination } from '@/components/Pagination';

interface Release {
  id: string;
  version: string;
  apiImageTag: string;
  webImageTag: string;
  isStable: boolean;
  isCritical: boolean;
  isPublished: boolean;
  publishedAt: string | null;
  changelog: string | null;
}
interface Listing {
  data: Release[];
  meta: { total: number };
}

export default function ReleasesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [q, setQ] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['releases', { page, pageSize, q }],
    queryFn: async (): Promise<Listing> =>
      (await api.get('/releases', { params: { page, pageSize, q } })).data,
    placeholderData: (prev) => prev,
  });

  const publish = useMutation({
    mutationFn: (id: string) => api.post(`/releases/${id}/publish`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['releases'] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Releases</h1>
          <p className="mt-1 text-sm text-gray-500">
            Detectees automatiquement depuis GHCR (poll horaire). Publiez une release
            pour la rendre disponible aux tenants.
          </p>
        </div>
        <Link
          href="/releases/new"
          className="rounded-md bg-primary-700 px-3 py-1.5 text-sm text-white hover:bg-primary-900"
        >
          + Nouvelle release
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="search"
          placeholder="Rechercher par version ou changelog..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="w-full rounded-md border bg-white pl-9 pr-3 py-2 text-sm shadow-sm"
        />
      </div>

      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-normal">Version</th>
              <th className="px-4 py-2 text-left font-normal">Stable</th>
              <th className="px-4 py-2 text-left font-normal">Critical</th>
              <th className="px-4 py-2 text-left font-normal">Publie</th>
              <th className="px-4 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-400">
                  Chargement...
                </td>
              </tr>
            )}
            {!isLoading && (data?.data ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-400">
                  Aucune release.
                </td>
              </tr>
            )}
            {(data?.data ?? []).map((r) => (
              <tr key={r.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2 font-mono">{r.version}</td>
                <td className="px-4 py-2">
                  {r.isStable ? (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                      STABLE
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-4 py-2">
                  {r.isCritical ? (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                      CRITICAL
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {r.isPublished ? formatDate(r.publishedAt) : 'non'}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex items-center gap-1.5">
                    <Link
                      href={`/releases/${r.id}`}
                      className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      <Pencil className="h-3 w-3" /> Editer
                    </Link>
                    {!r.isPublished && (
                      <button
                        type="button"
                        onClick={() => publish.mutate(r.id)}
                        disabled={publish.isPending && publish.variables === r.id}
                        className="inline-flex items-center gap-1 rounded bg-primary-700 px-2 py-1 text-xs text-white hover:bg-primary-900 disabled:opacity-50"
                      >
                        {publish.isPending && publish.variables === r.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Rocket className="h-3 w-3" />
                        )}
                        Publier
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination
          page={page}
          pageSize={pageSize}
          total={data?.meta?.total ?? 0}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      </div>
    </div>
  );
}
