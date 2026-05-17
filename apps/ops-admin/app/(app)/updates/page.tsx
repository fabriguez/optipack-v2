'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, AlertCircle, ArrowUpRight, Rocket, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { Pagination } from '@/components/Pagination';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { GhcrTagSelect } from '@/components/GhcrTagSelect';

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  currentVersion: string | null;
  pinnedVersion: string | null;
  autoUpdatePolicy: string | null;
  isMain?: boolean;
}
interface TenantsListing {
  data: TenantRow[];
  meta: { total: number; page: number; pageSize: number };
}
interface Release {
  id: string;
  version: string;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
}
interface ReleasesListing {
  data: Release[];
  meta: { total: number };
}

export default function UpdatesFleetPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filter, setFilter] = useState<'all' | 'behind' | 'up-to-date'>('all');
  const [confirmTenant, setConfirmTenant] = useState<TenantRow | null>(null);
  const [targetVersion, setTargetVersion] = useState<string>('');

  const tenants = useQuery<TenantsListing>({
    queryKey: ['tenants', { page, pageSize }],
    queryFn: async () =>
      (await api.get('/tenants', { params: { page, pageSize } })).data,
    placeholderData: (prev) => prev,
  });

  const releases = useQuery<ReleasesListing>({
    queryKey: ['releases-published'],
    queryFn: async () =>
      (await api.get('/releases', { params: { published: 'true', pageSize: 50 } })).data,
  });

  const latestVersion = useMemo(() => {
    const pub = releases.data?.data ?? [];
    return pub[0]?.version ?? null;
  }, [releases.data]);

  const requestUpdate = useMutation({
    // Backend attend `toVersion` (cf. RequestUpdateUseCase schema). Avant on
    // envoyait `targetVersion` -> validation echouait avec "toVersion required".
    mutationFn: ({ tenantId, version }: { tenantId: string; version: string }) =>
      api.post(`/tenants/${tenantId}/updates`, { toVersion: version }),
    onSuccess: () => {
      setConfirmTenant(null);
      qc.invalidateQueries({ queryKey: ['tenants'] });
    },
  });

  const rows = (tenants.data?.data ?? []).map((t) => {
    const upToDate = latestVersion && t.currentVersion === latestVersion;
    return { ...t, upToDate: !!upToDate };
  });
  const filtered =
    filter === 'all'
      ? rows
      : filter === 'behind'
      ? rows.filter((r) => !r.upToDate)
      : rows.filter((r) => r.upToDate);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Mises a jour de la flotte</h1>
          <p className="mt-1 text-sm text-gray-500">
            Version courante par tenant vs derniere release publiee
            {latestVersion ? (
              <>
                {' '}
                — <span className="font-mono">{latestVersion}</span>
              </>
            ) : null}
            .
          </p>
        </div>
        <Link
          href="/releases"
          className="inline-flex items-center gap-1 rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          <Rocket className="h-4 w-4" />
          Gerer les releases
        </Link>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setFilter('all')}
          className={
            'rounded-md border px-3 py-1.5 ' +
            (filter === 'all' ? 'border-primary-700 bg-primary-50 text-primary-900' : 'bg-white')
          }
        >
          Toutes
        </button>
        <button
          onClick={() => setFilter('behind')}
          className={
            'rounded-md border px-3 py-1.5 ' +
            (filter === 'behind' ? 'border-amber-500 bg-amber-50 text-amber-900' : 'bg-white')
          }
        >
          En retard
        </button>
        <button
          onClick={() => setFilter('up-to-date')}
          className={
            'rounded-md border px-3 py-1.5 ' +
            (filter === 'up-to-date'
              ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
              : 'bg-white')
          }
        >
          A jour
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-normal">Tenant</th>
              <th className="px-4 py-2 text-left font-normal">Statut</th>
              <th className="px-4 py-2 text-left font-normal">Version courante</th>
              <th className="px-4 py-2 text-left font-normal">Pinned</th>
              <th className="px-4 py-2 text-left font-normal">Auto-update</th>
              <th className="px-4 py-2 text-left font-normal">A jour ?</th>
              <th className="px-4 py-2 text-right font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {tenants.isLoading && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-400">
                  Chargement...
                </td>
              </tr>
            )}
            {!tenants.isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-400">
                  Aucun tenant dans cette categorie.
                </td>
              </tr>
            )}
            {filtered.map((t) => (
              <tr key={t.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/tenants/${t.id}`} className="font-medium text-primary-700 hover:underline">
                    {t.slug}
                  </Link>
                  {t.isMain && (
                    <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700">
                      MAIN
                    </span>
                  )}
                  <div className="text-xs text-gray-500">{t.name}</div>
                </td>
                <td className="px-4 py-2"><StatusBadge status={t.status} /></td>
                <td className="px-4 py-2 font-mono text-xs">{t.currentVersion ?? '-'}</td>
                <td className="px-4 py-2 font-mono text-xs">{t.pinnedVersion ?? '-'}</td>
                <td className="px-4 py-2 text-xs">{t.autoUpdatePolicy ?? 'manual'}</td>
                <td className="px-4 py-2">
                  {t.upToDate ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> A jour
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                      <AlertCircle className="h-3.5 w-3.5" /> En retard
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    disabled={!latestVersion || t.upToDate}
                    onClick={() => {
                      setTargetVersion(latestVersion ?? '');
                      setConfirmTenant(t);
                    }}
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ArrowUpRight className="h-3 w-3" />
                    Mettre a jour
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination
          page={page}
          pageSize={pageSize}
          total={tenants.data?.meta?.total ?? 0}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      </div>

      <ConfirmDialog
        open={!!confirmTenant}
        onCancel={() => setConfirmTenant(null)}
        title={`Lancer la mise a jour de ${confirmTenant?.slug ?? ''} ?`}
        description={
          <div className="space-y-3 text-sm">
            <p>
              Version courante : <code className="font-mono">{confirmTenant?.currentVersion ?? '-'}</code>
            </p>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Version cible
              </label>
              <GhcrTagSelect
                image="optipack-api"
                value={targetVersion}
                onChange={setTargetVersion}
                showLatest={false}
                placeholder="Selectionner une version GHCR..."
              />
            </div>
            <p className="text-xs text-gray-500">
              La mise a jour cree un job (pull + redeploy). Les logs en direct sont visibles sur la page detail du tenant.
            </p>
          </div>
        }
        confirmLabel="Lancer"
        loading={requestUpdate.isPending}
        onConfirm={() => {
          if (confirmTenant && targetVersion) {
            requestUpdate.mutate({ tenantId: confirmTenant.id, version: targetVersion });
          }
        }}
      />

      {requestUpdate.isPending && (
        <p className="text-xs text-gray-500">
          <Loader2 className="inline h-3 w-3 animate-spin" /> Demande envoyee...
        </p>
      )}
    </div>
  );
}
