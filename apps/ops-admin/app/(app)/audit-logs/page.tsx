'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export default function AuditLogsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async (): Promise<AuditLog[]> =>
      (await api.get('/audit-logs?limit=100')).data?.data ?? [],
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit logs</h1>
      <div className="rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-normal">Date</th>
              <th className="px-4 py-2 text-left font-normal">Action</th>
              <th className="px-4 py-2 text-left font-normal">Entite</th>
              <th className="px-4 py-2 text-left font-normal">IP</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-gray-400">
                  Chargement...
                </td>
              </tr>
            )}
            {(data ?? []).map((a) => (
              <tr key={a.id} className="border-t">
                <td className="px-4 py-2 text-xs text-gray-500">
                  {formatDate(a.createdAt)}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{a.action}</td>
                <td className="px-4 py-2 text-xs">
                  {a.entityType}
                  {a.entityId ? ` / ${a.entityId.slice(0, 8)}` : ''}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{a.ipAddress ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
