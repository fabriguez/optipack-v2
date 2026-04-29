'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate } from '@/lib/utils';

interface Vps {
  id: string;
  name: string;
  host: string;
  status: string;
  cpuUsagePct: number | null;
  ramUsagePct: number | null;
  diskUsagePct: number | null;
  lastSeenAt: string | null;
}

export default function VpsListPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['vps'],
    queryFn: async (): Promise<Vps[]> => (await api.get('/vps')).data?.data ?? [],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">VPS</h1>
        <Link
          href="/vps/new"
          className="rounded-md bg-primary-700 px-3 py-1.5 text-sm text-white hover:bg-primary-900"
        >
          + Ajouter VPS
        </Link>
      </div>
      <div className="rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-normal">Nom</th>
              <th className="px-4 py-2 text-left font-normal">Host</th>
              <th className="px-4 py-2 text-left font-normal">Status</th>
              <th className="px-4 py-2 text-left font-normal">CPU</th>
              <th className="px-4 py-2 text-left font-normal">RAM</th>
              <th className="px-4 py-2 text-left font-normal">Disk</th>
              <th className="px-4 py-2 text-left font-normal">Vu</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-400">
                  Chargement...
                </td>
              </tr>
            )}
            {(data ?? []).map((v) => (
              <tr key={v.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/vps/${v.id}`} className="hover:underline">
                    {v.name}
                  </Link>
                </td>
                <td className="px-4 py-2 font-mono text-xs">{v.host}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={v.status} />
                </td>
                <td className="px-4 py-2 text-xs">
                  {v.cpuUsagePct !== null ? `${v.cpuUsagePct.toFixed(0)} %` : '-'}
                </td>
                <td className="px-4 py-2 text-xs">
                  {v.ramUsagePct !== null ? `${v.ramUsagePct.toFixed(0)} %` : '-'}
                </td>
                <td className="px-4 py-2 text-xs">
                  {v.diskUsagePct !== null ? `${v.diskUsagePct.toFixed(0)} %` : '-'}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {formatDate(v.lastSeenAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
