'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  HardDrive,
  Loader2,
  MemoryStick,
  Package,
  RefreshCw,
  Server,
} from 'lucide-react';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate } from '@/lib/utils';

interface Tenant {
  id: string;
  status: string;
}
interface Vps {
  id: string;
  name: string;
  host: string;
  status: string;
  cpuUsagePct: number | null;
  ramUsagePct: number | null;
  diskUsagePct: number | null;
  totalCpu: number | null;
  totalRamMb: number | null;
  totalDiskGb: number | null;
  lastSeenAt: string | null;
}
interface VpsListing {
  data: Vps[];
  meta?: { total: number };
}

export default function DashboardPage() {
  const qc = useQueryClient();

  const tenants = useQuery({
    queryKey: ['tenants', 'dashboard'],
    queryFn: async (): Promise<Tenant[]> =>
      (await api.get('/tenants', { params: { pageSize: 200 } })).data?.data ?? [],
  });
  const vps = useQuery<VpsListing>({
    queryKey: ['vps', 'dashboard'],
    queryFn: async () =>
      (await api.get('/vps', { params: { pageSize: 100 } })).data,
  });

  const refreshUsage = useMutation({
    mutationFn: () => api.post('/vps/refresh-usage'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vps'] });
    },
  });

  // Probe automatique a chaque ouverture du dashboard : evite que le tableau
  // "VPS et charge" affiche des "-" parce que personne n'a clique "Refresh"
  // sur la page detail. Best-effort cote serveur (parallel SSH, tolerant).
  useEffect(() => {
    refreshUsage.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vpsList = vps.data?.data ?? [];

  const stats = [
    {
      label: 'Tenants',
      value: tenants.data?.length ?? '-',
      sub: `${tenants.data?.filter((t) => t.status === 'ACTIVE').length ?? 0} actifs`,
      icon: Package,
    },
    {
      label: 'VPS',
      value: vpsList.length || '-',
      sub: `${vpsList.filter((v) => v.status === 'ACTIVE').length} actifs`,
      icon: Server,
    },
    {
      label: 'MRR (estim.)',
      value: '-',
      sub: (
        <Link href="/billing" className="text-primary-700 hover:underline">
          Voir la facturation
        </Link>
      ),
      icon: CreditCard,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Vue d&apos;ensemble</h1>
        <button
          type="button"
          onClick={() => refreshUsage.mutate()}
          disabled={refreshUsage.isPending}
          className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          title="Probe SSH les CPU/RAM/Disque de tous les VPS actifs"
        >
          {refreshUsage.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Rafraichir
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-lg border bg-white p-4 shadow-sm">
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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">VPS et charge</h2>
          <p className="text-[11px] text-gray-400">
            Probe SSH automatique a l&apos;ouverture. CPU/RAM/Disque lus depuis le serveur.
          </p>
        </div>
        {vps.isLoading ? (
          <p className="text-sm text-gray-400">Chargement...</p>
        ) : vpsList.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun VPS enregistre.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="text-left font-normal">VPS</th>
                <th className="text-left font-normal">Status</th>
                <th className="text-left font-normal">CPU</th>
                <th className="text-left font-normal">RAM</th>
                <th className="text-left font-normal">Disque</th>
                <th className="text-left font-normal">Vu</th>
              </tr>
            </thead>
            <tbody>
              {vpsList.map((v) => (
                <tr key={v.id} className="border-t">
                  <td className="py-2">
                    <Link
                      href={`/vps/${v.id}`}
                      className="font-medium text-primary-700 hover:underline"
                    >
                      {v.name}
                    </Link>
                    <div className="font-mono text-[11px] text-gray-500">{v.host}</div>
                  </td>
                  <td className="py-2">
                    <StatusBadge status={v.status} />
                  </td>
                  <td className="py-2">
                    <UsageCell
                      pct={v.cpuUsagePct}
                      total={v.totalCpu ? `${v.totalCpu} cores` : null}
                    />
                  </td>
                  <td className="py-2">
                    <UsageCell
                      pct={v.ramUsagePct}
                      total={v.totalRamMb ? `${(v.totalRamMb / 1024).toFixed(1)} Go` : null}
                    />
                  </td>
                  <td className="py-2">
                    <UsageCell
                      pct={v.diskUsagePct}
                      total={v.totalDiskGb ? `${v.totalDiskGb} Go` : null}
                    />
                  </td>
                  <td className="py-2 text-[11px] text-gray-500">
                    {formatDate(v.lastSeenAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function UsageCell({ pct, total }: { pct: number | null; total: string | null }) {
  if (pct == null) {
    return <span className="text-xs text-gray-400">--</span>;
  }
  const colorClass =
    pct >= 90 ? 'text-red-600' : pct >= 75 ? 'text-amber-600' : 'text-gray-700';
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-1">
        <span className={'font-semibold ' + colorClass}>{pct.toFixed(0)}%</span>
        {total && <span className="text-[10px] text-gray-400">/ {total}</span>}
      </div>
      <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-gray-100">
        <div
          className={
            'h-full ' +
            (pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500')
          }
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

// suppress unused warning while UI assets are stashed for future use
void MemoryStick;
void HardDrive;
