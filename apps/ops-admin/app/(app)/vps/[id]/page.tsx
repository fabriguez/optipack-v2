'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Cpu,
  HardDrive,
  Loader2,
  MemoryStick,
  PlugZap,
  Shield,
  Trash2,
  Activity,
  Package,
} from 'lucide-react';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate } from '@/lib/utils';

interface Vps {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  region: string | null;
  notes: string | null;
  status: string;
  cpuUsagePct: number | null;
  ramUsagePct: number | null;
  diskUsagePct: number | null;
  totalCpu: number | null;
  totalRamMb: number | null;
  totalDiskGb: number | null;
  portRangeStart: number | null;
  portRangeEnd: number | null;
  lastSeenAt: string | null;
  createdAt: string;
}

interface Capacity {
  totalCpu: number;
  reservedCpu: number;
  allocatedCpu: number;
  freeCpu: number;
  totalRamMb: number;
  reservedRamMb: number;
  allocatedRamMb: number;
  freeRamMb: number;
  totalDiskGb: number;
  reservedDiskGb: number;
  allocatedDiskGb: number;
  freeDiskGb: number;
  tenantCount: number;
}

interface TenantLite {
  id: string;
  slug: string;
  name: string;
  status: string;
  isMain?: boolean;
}

export default function VpsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const qc = useQueryClient();

  const vps = useQuery<Vps>({
    queryKey: ['vps', id],
    queryFn: async () => (await api.get(`/vps/${id}`)).data?.data,
  });
  const capacity = useQuery<Capacity>({
    queryKey: ['vps', id, 'capacity'],
    queryFn: async () => (await api.get(`/vps/${id}/capacity`)).data?.data,
  });
  const usage = useQuery({
    queryKey: ['vps', id, 'usage'],
    queryFn: async () => (await api.get(`/vps/${id}/usage`)).data?.data,
    enabled: false, // on-demand
  });
  const tenants = useQuery<TenantLite[]>({
    queryKey: ['vps', id, 'tenants'],
    queryFn: async () =>
      (await api.get(`/tenants`, { params: { vpsId: id } })).data?.data ?? [],
  });

  const testConnection = useMutation({
    mutationFn: async () => (await api.post(`/vps/${id}/test-connection`)).data?.data,
  });
  const updateVps = useMutation({
    mutationFn: async (patch: Partial<{ portRangeStart: number; portRangeEnd: number }>) =>
      (await api.patch(`/vps/${id}`, patch)).data?.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vps', id] });
    },
  });
  const deleteVps = useMutation({
    mutationFn: async () => (await api.delete(`/vps/${id}`)).data?.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vps'] });
      window.location.href = '/vps';
    },
  });

  const v = vps.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/vps"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-3 w-3" /> Retour aux VPS
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{v?.name ?? 'VPS'}</h1>
          <p className="font-mono text-xs text-gray-500">
            {v?.username}@{v?.host}:{v?.port}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => testConnection.mutate()}
            disabled={testConnection.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {testConnection.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlugZap className="h-4 w-4" />
            )}
            Tester SSH
          </button>
          <Link
            href={`/vps/${id}/ufw`}
            className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            <Shield className="h-4 w-4" /> UFW
          </Link>
          <button
            type="button"
            onClick={() => {
              if (confirm('Supprimer ce VPS ? Refus si tenants actifs.')) deleteVps.mutate();
            }}
            disabled={deleteVps.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> Supprimer
          </button>
        </div>
      </div>

      {testConnection.data && (
        <div
          className={
            'rounded-md border px-3 py-2 text-sm ' +
            (testConnection.data.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800')
          }
        >
          Test SSH : {testConnection.data.ok ? 'OK' : testConnection.data.message ?? 'echec'}
        </div>
      )}

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Etat</h2>
        {vps.isLoading ? (
          <p className="text-sm text-gray-400">Chargement...</p>
        ) : v ? (
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Cell label="Status"><StatusBadge status={v.status} /></Cell>
            <Cell label="Region">{v.region ?? '-'}</Cell>
            <Cell label="Vu pour la derniere fois">{formatDate(v.lastSeenAt)}</Cell>
            <Cell label="Cree le">{formatDate(v.createdAt)}</Cell>
            <Cell label="CPU" Icon={Cpu}>
              {v.cpuUsagePct !== null ? `${v.cpuUsagePct.toFixed(0)}%` : '-'}
              {v.totalCpu ? ` / ${v.totalCpu} cores` : ''}
            </Cell>
            <Cell label="RAM" Icon={MemoryStick}>
              {v.ramUsagePct !== null ? `${v.ramUsagePct.toFixed(0)}%` : '-'}
              {v.totalRamMb ? ` / ${(v.totalRamMb / 1024).toFixed(1)} Go` : ''}
            </Cell>
            <Cell label="Disque" Icon={HardDrive}>
              {v.diskUsagePct !== null ? `${v.diskUsagePct.toFixed(0)}%` : '-'}
              {v.totalDiskGb ? ` / ${v.totalDiskGb} Go` : ''}
            </Cell>
            <Cell label="Tenants actifs"><span className="font-mono">{tenants.data?.length ?? '-'}</span></Cell>
          </div>
        ) : null}
        {v?.notes && (
          <p className="mt-3 whitespace-pre-wrap rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">
            {v.notes}
          </p>
        )}
      </section>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Capacite allouee</h2>
          <button
            type="button"
            onClick={() => usage.refetch()}
            disabled={usage.isFetching}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            {usage.isFetching ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Activity className="h-3 w-3" />
            )}
            Refresh usage
          </button>
        </div>
        {capacity.data ? (
          <div className="grid grid-cols-3 gap-4 text-sm">
            <CapacityBar
              label="CPU"
              used={capacity.data.allocatedCpu}
              reserved={capacity.data.reservedCpu}
              total={capacity.data.totalCpu}
              unit=" cores"
            />
            <CapacityBar
              label="RAM"
              used={capacity.data.allocatedRamMb}
              reserved={capacity.data.reservedRamMb}
              total={capacity.data.totalRamMb}
              unit=" Mo"
              format={(n) => `${(n / 1024).toFixed(1)} Go`}
            />
            <CapacityBar
              label="Disque"
              used={capacity.data.allocatedDiskGb}
              reserved={capacity.data.reservedDiskGb}
              total={capacity.data.totalDiskGb}
              unit=" Go"
            />
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            {capacity.isLoading ? 'Chargement...' : 'Pas de donnees de capacite.'}
          </p>
        )}
      </section>

      {v && <PortRangeSection vps={v} loading={updateVps.isPending} onSave={(p) => updateVps.mutate(p)} />}

      <section className="rounded-lg border bg-white shadow-sm">
        <h2 className="border-b px-4 py-3 text-sm font-semibold">
          Tenants sur ce VPS ({tenants.data?.length ?? 0})
        </h2>
        {tenants.isLoading ? (
          <p className="p-4 text-sm text-gray-400">Chargement...</p>
        ) : (tenants.data ?? []).length === 0 ? (
          <p className="p-4 text-sm text-gray-400">Aucun tenant sur ce VPS.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left font-normal">Slug</th>
                <th className="px-4 py-2 text-left font-normal">Nom</th>
                <th className="px-4 py-2 text-left font-normal">Status</th>
                <th className="px-4 py-2 text-right font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {tenants.data!.map((t) => (
                <tr key={t.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs">
                    <span className="inline-flex items-center gap-1">
                      <Package className="h-3 w-3" /> {t.slug}
                      {t.isMain && (
                        <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700">
                          MAIN
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-2">{t.name}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/tenants/${t.id}`}
                      className="text-xs text-primary-700 hover:underline"
                    >
                      Ouvrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Cell({
  label,
  Icon,
  children,
}: {
  label: string;
  Icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-gray-500">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function CapacityBar({
  label,
  used,
  reserved,
  total,
  unit,
  format,
}: {
  label: string;
  used: number;
  reserved: number;
  total: number;
  unit: string;
  format?: (n: number) => string;
}) {
  const fmt = format ?? ((n: number) => `${n}${unit}`);
  const totalPct = total > 0 ? Math.min(100, ((used + reserved) / total) * 100) : 0;
  const usedPct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
        <p className="text-xs text-gray-500">{fmt(used + reserved)} / {fmt(total)}</p>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
        <div className="relative h-full">
          <div
            className="absolute inset-y-0 left-0 bg-amber-300"
            style={{ width: `${totalPct}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 bg-primary-600"
            style={{ width: `${usedPct}%` }}
          />
        </div>
      </div>
      <p className="mt-1 text-[10px] text-gray-400">
        Alloue {fmt(used)} - reserve systeme {fmt(reserved)}
      </p>
    </div>
  );
}

/**
 * Edit la plage de ports allouee aux tenants sur ce VPS. La plage par defaut
 * 30000-39999 (~3333 tenants). A retrecir si le VPS heberge d'autres services
 * sur ces ports, ou a deplacer si conflit avec une plage existante.
 */
function PortRangeSection({
  vps,
  loading,
  onSave,
}: {
  vps: { portRangeStart: number | null; portRangeEnd: number | null };
  loading: boolean;
  onSave: (patch: { portRangeStart: number; portRangeEnd: number }) => void;
}) {
  const [start, setStart] = useState<number>(vps.portRangeStart ?? 30000);
  const [end, setEnd] = useState<number>(vps.portRangeEnd ?? 39999);

  const dirty = start !== (vps.portRangeStart ?? 30000) || end !== (vps.portRangeEnd ?? 39999);
  const valid = start >= 1024 && end <= 65535 && start < end;
  const capacity = valid ? Math.floor((end - start + 1) / 3) : 0;

  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Plage de ports tenants</h2>
          <p className="text-xs text-gray-500">
            Utilisee par le PortAllocator pour allouer api / web / web-client (3 ports par tenant).
          </p>
        </div>
        <span className="rounded bg-gray-100 px-2 py-1 text-[11px] font-mono text-gray-600">
          ~{capacity.toLocaleString()} tenants max
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-gray-700">Port debut</span>
          <input
            type="number"
            min={1024}
            max={65534}
            value={start}
            onChange={(e) => setStart(Number(e.target.value) || 0)}
            className="w-full rounded-md border bg-white px-3 py-1.5 text-sm font-mono"
          />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-gray-700">Port fin</span>
          <input
            type="number"
            min={1025}
            max={65535}
            value={end}
            onChange={(e) => setEnd(Number(e.target.value) || 0)}
            className="w-full rounded-md border bg-white px-3 py-1.5 text-sm font-mono"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            disabled={!dirty || !valid || loading}
            onClick={() => onSave({ portRangeStart: start, portRangeEnd: end })}
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary-700 px-3 text-sm text-white hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Enregistrement...' : 'Enregistrer la plage'}
          </button>
        </div>
      </div>
      {!valid && (
        <p className="mt-2 text-xs text-red-600">
          Plage invalide. Contrainte : 1024 &lt;= debut &lt; fin &lt;= 65535.
        </p>
      )}
      <p className="mt-2 text-[11px] text-gray-500">
        Astuce : reduire la plage n&apos;impacte pas les tenants deja deployes (leurs ports sont
        persistes en BDD). Les futurs provisionings utiliseront la nouvelle plage.
      </p>
    </section>
  );
}
