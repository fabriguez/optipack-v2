'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

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

export default function ReleasesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['releases'],
    queryFn: async (): Promise<Release[]> =>
      (await api.get('/releases')).data?.data ?? [],
  });

  const publish = useMutation({
    mutationFn: (id: string) => api.post(`/releases/${id}/publish`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['releases'] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Releases</h1>
      <p className="text-sm text-gray-500">
        Detectees automatiquement depuis GHCR (poll horaire). Publiez une release
        pour la rendre disponible aux tenants.
      </p>
      <div className="rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-normal">Version</th>
              <th className="px-4 py-2 text-left font-normal">Stable</th>
              <th className="px-4 py-2 text-left font-normal">Critical</th>
              <th className="px-4 py-2 text-left font-normal">Publie</th>
              <th className="px-4 py-2 text-left font-normal">Action</th>
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
            {(data ?? []).map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2 font-mono">{r.version}</td>
                <td className="px-4 py-2">{r.isStable ? 'oui' : '-'}</td>
                <td className="px-4 py-2">{r.isCritical ? 'oui' : '-'}</td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {r.isPublished ? formatDate(r.publishedAt) : 'non'}
                </td>
                <td className="px-4 py-2">
                  {!r.isPublished && (
                    <button
                      onClick={() => publish.mutate(r.id)}
                      className="rounded-md bg-primary-700 px-2 py-1 text-xs text-white hover:bg-primary-900"
                    >
                      Publier
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
