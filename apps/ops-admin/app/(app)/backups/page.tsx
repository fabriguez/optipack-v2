'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { StatusBadge } from '@/components/StatusBadge';

interface Tenant {
  id: string;
  slug: string;
  name: string;
}
interface Backup {
  id: string;
  kind: string;
  status: string;
  storageRef: string;
  sizeBytes: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export default function BackupsPage() {
  const qc = useQueryClient();
  const [tenantId, setTenantId] = useState<string>('');

  const tenants = useQuery({
    queryKey: ['tenants'],
    queryFn: async (): Promise<Tenant[]> =>
      (await api.get('/tenants')).data?.data ?? [],
  });
  const backups = useQuery({
    queryKey: ['backups', tenantId],
    queryFn: async (): Promise<Backup[]> => {
      if (!tenantId) return [];
      return (await api.get(`/tenants/${tenantId}/backups`)).data?.data ?? [];
    },
    enabled: !!tenantId,
  });
  const create = useMutation({
    mutationFn: () => api.post(`/tenants/${tenantId}/backups`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backups', tenantId] }),
  });
  const runNightly = useMutation({
    mutationFn: () => api.post('/backups/run-nightly'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Backups</h1>
        <button
          onClick={() => runNightly.mutate()}
          disabled={runNightly.isPending}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Lancer nightly maintenant
        </button>
      </div>

      <select
        value={tenantId}
        onChange={(e) => setTenantId(e.target.value)}
        className="rounded-md border px-3 py-2 text-sm"
      >
        <option value="">-- Choisir un tenant --</option>
        {(tenants.data ?? []).map((t) => (
          <option key={t.id} value={t.id}>
            {t.slug} - {t.name}
          </option>
        ))}
      </select>

      {tenantId && (
        <div className="space-y-3">
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="rounded-md bg-primary-700 px-3 py-1.5 text-sm text-white hover:bg-primary-900 disabled:opacity-50"
          >
            Backup manuel
          </button>
          <div className="rounded-lg border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left font-normal">Date</th>
                  <th className="px-4 py-2 text-left font-normal">Kind</th>
                  <th className="px-4 py-2 text-left font-normal">Status</th>
                  <th className="px-4 py-2 text-left font-normal">Taille</th>
                  <th className="px-4 py-2 text-left font-normal">Expire</th>
                </tr>
              </thead>
              <tbody>
                {(backups.data ?? []).map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {formatDate(b.createdAt)}
                    </td>
                    <td className="px-4 py-2">{b.kind}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {b.sizeBytes
                        ? `${(Number(b.sizeBytes) / 1024 / 1024).toFixed(1)} MB`
                        : '-'}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {formatDate(b.expiresAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
