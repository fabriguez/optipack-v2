'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Server, Package, CreditCard } from 'lucide-react';

interface Tenant {
  id: string;
  status: string;
}
interface Vps {
  id: string;
  status: string;
  cpuUsagePct: number | null;
  ramUsagePct: number | null;
}
export default function DashboardPage() {
  const tenants = useQuery({
    queryKey: ['tenants'],
    queryFn: async (): Promise<Tenant[]> =>
      (await api.get('/tenants')).data?.data ?? [],
  });
  const vps = useQuery({
    queryKey: ['vps'],
    queryFn: async (): Promise<Vps[]> => (await api.get('/vps')).data?.data ?? [],
  });

  const stats = [
    {
      label: 'Tenants',
      value: tenants.data?.length ?? '-',
      sub: `${tenants.data?.filter((t) => t.status === 'ACTIVE').length ?? 0} actifs`,
      icon: Package,
    },
    {
      label: 'VPS',
      value: vps.data?.length ?? '-',
      sub: `${vps.data?.filter((v) => v.status === 'ACTIVE').length ?? 0} actifs`,
      icon: Server,
    },
    {
      label: 'MRR (estim.)',
      value: '-',
      sub: 'a calculer cote billing',
      icon: CreditCard,
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Vue d&apos;ensemble</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="rounded-lg border bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase text-gray-500">{s.label}</span>
                <Icon size={16} className="text-gray-400" />
              </div>
              <div className="mt-2 text-2xl font-semibold">{s.value}</div>
              <div className="text-xs text-gray-500">{s.sub}</div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">VPS et charge</h2>
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500">
            <tr>
              <th className="text-left font-normal">Status</th>
              <th className="text-left font-normal">CPU</th>
              <th className="text-left font-normal">RAM</th>
            </tr>
          </thead>
          <tbody>
            {(vps.data ?? []).map((v) => (
              <tr key={v.id} className="border-t">
                <td className="py-2">{v.status}</td>
                <td className="py-2">
                  {v.cpuUsagePct !== null ? `${v.cpuUsagePct.toFixed(0)} %` : '-'}
                </td>
                <td className="py-2">
                  {v.ramUsagePct !== null ? `${v.ramUsagePct.toFixed(0)} %` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
