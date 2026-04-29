'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate } from '@/lib/utils';

interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: string;
  currentVersion: string | null;
  createdAt: string;
  vps: { host: string } | null;
}

export default function TenantsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['tenants'],
    queryFn: async (): Promise<Tenant[]> =>
      (await api.get('/tenants')).data?.data ?? [],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tenants</h1>
        <Link
          href="/tenants/new"
          className="rounded-md bg-primary-700 px-3 py-1.5 text-sm text-white hover:bg-primary-900"
        >
          + Nouveau tenant
        </Link>
      </div>

      <div className="rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-normal">Slug</th>
              <th className="px-4 py-2 text-left font-normal">Nom</th>
              <th className="px-4 py-2 text-left font-normal">VPS</th>
              <th className="px-4 py-2 text-left font-normal">Version</th>
              <th className="px-4 py-2 text-left font-normal">Status</th>
              <th className="px-4 py-2 text-left font-normal">Cree le</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-400">
                  Chargement...
                </td>
              </tr>
            )}
            {(data ?? []).map((t) => (
              <tr key={t.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2 font-mono text-xs">
                  <Link href={`/tenants/${t.id}`} className="hover:underline">
                    {t.slug}
                  </Link>
                </td>
                <td className="px-4 py-2">{t.name}</td>
                <td className="px-4 py-2 text-gray-600">{t.vps?.host ?? '-'}</td>
                <td className="px-4 py-2 font-mono text-xs">
                  {t.currentVersion ?? '-'}
                </td>
                <td className="px-4 py-2">
                  <StatusBadge status={t.status} />
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {formatDate(t.createdAt)}
                </td>
              </tr>
            ))}
            {data && data.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-400">
                  Aucun tenant
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
