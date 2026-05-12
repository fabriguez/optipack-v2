'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Loader2 } from 'lucide-react';
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

interface ReconcileResult {
  vpsId: string;
  vpsName: string;
  isSelf: boolean;
  tenantCount: number;
  tenants: Array<{ slug: string; isMain: boolean; isFrozen: boolean }>;
}

export default function VpsListPage() {
  const qc = useQueryClient();
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['vps'],
    queryFn: async (): Promise<Vps[]> => (await api.get('/vps')).data?.data ?? [],
  });

  const reconcile = useMutation({
    mutationFn: async (vpsId?: string) => {
      const body = vpsId ? { vpsId } : {};
      const res = await api.post('/caddy/reconcile', body);
      return res.data?.data as ReconcileResult[];
    },
    onSuccess: (results, vpsId) => {
      const total = results.reduce((s, r) => s + r.tenantCount, 0);
      const target = vpsId ? results[0]?.vpsName ?? 'VPS' : `${results.length} VPS`;
      setToast({
        kind: 'ok',
        msg: `Caddy reconcilie : ${target} - ${total} tenant(s) servi(s).`,
      });
      qc.invalidateQueries({ queryKey: ['vps'] });
    },
    onError: (err: unknown) => {
      const msg =
        typeof err === 'object' && err && 'response' in err
          ? // @ts-expect-error axios shape
            err.response?.data?.message ?? 'Reconciliation echouee.'
          : 'Reconciliation echouee.';
      setToast({ kind: 'err', msg });
    },
    onSettled: () => {
      setTimeout(() => setToast(null), 6000);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">VPS</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => reconcile.mutate(undefined)}
            disabled={reconcile.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            title="Pousser la config Caddy a tous les VPS depuis la BDD"
          >
            {reconcile.isPending && reconcile.variables === undefined ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Reconcilier Caddy (tous)
          </button>
          <Link
            href="/vps/new"
            className="rounded-md bg-primary-700 px-3 py-1.5 text-sm text-white hover:bg-primary-900"
          >
            + Ajouter VPS
          </Link>
        </div>
      </div>

      {toast && (
        <div
          className={
            'rounded-md border px-3 py-2 text-sm ' +
            (toast.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800')
          }
        >
          {toast.msg}
        </div>
      )}

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
              <th className="px-4 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="p-4 text-center text-gray-400">
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
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => reconcile.mutate(v.id)}
                    disabled={reconcile.isPending && reconcile.variables === v.id}
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-50"
                    title="Pousser la config Caddy uniquement sur ce VPS"
                  >
                    {reconcile.isPending && reconcile.variables === v.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Reconcilier Caddy
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
