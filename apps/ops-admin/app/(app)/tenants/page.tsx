'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, ExternalLink, Archive, Snowflake, Play, Flame } from 'lucide-react';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate } from '@/lib/utils';
import { Pagination } from '@/components/Pagination';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ActionMenu, type ActionMenuItem } from '@/components/ActionMenu';

interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: string;
  currentVersion: string | null;
  createdAt: string;
  vps: { host: string; name: string } | null;
  isMain?: boolean;
}
interface Listing {
  data: Tenant[];
  meta: { total: number; page: number; pageSize: number };
}

export default function TenantsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [q, setQ] = useState('');
  // Actions destructives : on memorise la cible courante pour confirmation.
  // 'purge' = suppression definitive (containers + volumes + record DB).
  // 'archive' = soft (record garde, infra detruite, status=ARCHIVED).
  const [purgeTarget, setPurgeTarget] = useState<Tenant | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Tenant | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['tenants', { page, pageSize, q }],
    queryFn: async (): Promise<Listing> =>
      (await api.get('/tenants', { params: { page, pageSize, q } })).data,
    placeholderData: (prev) => prev,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tenants'] });

  const purgeMutation = useMutation({
    mutationFn: (tenantId: string) => api.delete(`/tenants/${tenantId}/purge`),
    onSuccess: () => { invalidate(); setPurgeTarget(null); },
  });
  const archiveMutation = useMutation({
    mutationFn: (tenantId: string) => api.post(`/tenants/${tenantId}/archive`),
    onSuccess: () => { invalidate(); setArchiveTarget(null); },
  });
  const freezeMutation = useMutation({
    mutationFn: (tenantId: string) => api.post(`/tenants/${tenantId}/freeze`),
    onSuccess: invalidate,
  });
  const unfreezeMutation = useMutation({
    mutationFn: (tenantId: string) => api.post(`/tenants/${tenantId}/unfreeze`),
    onSuccess: invalidate,
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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="search"
          placeholder="Rechercher par slug, nom ou email du proprietaire..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="w-full rounded-md border bg-white pl-9 pr-3 py-2 text-sm shadow-sm"
        />
      </div>

      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-normal">Slug</th>
              <th className="px-4 py-2 text-left font-normal">Nom</th>
              <th className="px-4 py-2 text-left font-normal">VPS</th>
              <th className="px-4 py-2 text-left font-normal">Version</th>
              <th className="px-4 py-2 text-left font-normal">Status</th>
              <th className="px-4 py-2 text-left font-normal">Cree le</th>
              <th className="px-4 py-2 text-right font-normal">Actions</th>
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
            {!isLoading && (data?.data ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-400">
                  Aucun tenant.
                </td>
              </tr>
            )}
            {(data?.data ?? []).map((t) => (
              <tr key={t.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2 font-mono text-xs">
                  <Link href={`/tenants/${t.id}`} className="hover:underline">
                    {t.slug}
                  </Link>
                  {t.isMain && (
                    <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700">
                      MAIN
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">{t.name}</td>
                <td className="px-4 py-2 text-gray-600">
                  {t.vps?.name ?? t.vps?.host ?? '-'}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{t.currentVersion ?? '-'}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={t.status} />
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">{formatDate(t.createdAt)}</td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex items-center gap-1">
                    {(() => {
                      // Liens publics du tenant : on calcule a la volee
                      // (meme regle que CaddyService cote backend).
                      const base = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'transitsoftservices.com';
                      const publicHost = t.isMain ? base : `${t.slug}.${base}`;
                      const apiHost = t.isMain ? `api.${base}` : `api.${t.slug}.${base}`;
                      return (
                        <>
                          <a
                            href={`https://${publicHost}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
                            title={`Site public : ${publicHost}`}
                          >
                            Site
                          </a>
                          <a
                            href={`https://${apiHost}/api/v1`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
                            title={`API : ${apiHost}/api/v1`}
                          >
                            API
                          </a>
                        </>
                      );
                    })()}
                    <Link
                      href={`/tenants/${t.id}`}
                      className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Ouvrir
                    </Link>
                    <ActionMenu
                      ariaLabel={`Actions ${t.slug}`}
                      items={buildTenantActions({
                        tenant: t,
                        onFreeze: () => freezeMutation.mutate(t.id),
                        onUnfreeze: () => unfreezeMutation.mutate(t.id),
                        onArchive: () => setArchiveTarget(t),
                        onPurge: () => setPurgeTarget(t),
                      })}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination
          page={page}
          pageSize={pageSize}
          total={data?.meta?.total ?? 0}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      </div>

      <ConfirmDialog
        open={!!archiveTarget}
        title={archiveTarget ? `Archiver ${archiveTarget.slug} ?` : ''}
        description={
          archiveTarget ? (
            <div className="whitespace-pre-line">
              {`Archivage du tenant :
- Arret + suppression des conteneurs du tenant
- Suppression des volumes (donnees PG / Redis / MinIO)
- Retrait des routes Caddy
- Statut -> ARCHIVED (record garde, billing arrete)

Reprovisioning possible plus tard (les ressources sont recreees).`}
            </div>
          ) : null
        }
        destructive
        confirmLabel="Archiver"
        requireText={archiveTarget ? `ARCHIVE ${archiveTarget.slug}` : undefined}
        loading={archiveMutation.isPending}
        onConfirm={() => {
          if (archiveTarget) archiveMutation.mutate(archiveTarget.id);
        }}
        onCancel={() => setArchiveTarget(null)}
      />

      <ConfirmDialog
        open={!!purgeTarget}
        title={purgeTarget ? `SUPPRIMER DEFINITIVEMENT ${purgeTarget.slug} ?` : ''}
        description={
          purgeTarget ? (
            <div className="whitespace-pre-line">
              {`Suppression DEFINITIVE :
- Conteneurs + images locales + volumes + network
- Fichiers compose/env/seed sur le VPS
- Record tenant + jobs + subscriptions dans la DB orchestrator

Aucun retour en arriere possible. Aucun archivage.`}
            </div>
          ) : null
        }
        destructive
        confirmLabel="Supprimer definitivement"
        requireText={purgeTarget ? `PURGE ${purgeTarget.slug}` : undefined}
        loading={purgeMutation.isPending}
        onConfirm={() => {
          if (purgeTarget) purgeMutation.mutate(purgeTarget.id);
        }}
        onCancel={() => setPurgeTarget(null)}
      />
    </div>
  );
}

/**
 * Construit la liste des actions disponibles pour un tenant selon son statut.
 *   ACTIVE        -> Freeze, Archiver, Purger
 *   FROZEN        -> Unfreeze, Archiver, Purger
 *   PROVISIONING  -> (en cours, rien)
 *   ARCHIVED      -> Purger uniquement (pas de unarchive : infra detruite)
 *   isMain=true   -> ni archive ni purge (tenant principal protege)
 */
function buildTenantActions({
  tenant,
  onFreeze,
  onUnfreeze,
  onArchive,
  onPurge,
}: {
  tenant: Tenant;
  onFreeze: () => void;
  onUnfreeze: () => void;
  onArchive: () => void;
  onPurge: () => void;
}): ActionMenuItem[] {
  const isMain = !!tenant.isMain;
  const status = tenant.status;
  return [
    {
      label: 'Freezer',
      icon: <Snowflake className="h-3.5 w-3.5" />,
      onClick: onFreeze,
      hidden: status !== 'ACTIVE',
    },
    {
      label: 'Defreezer',
      icon: <Play className="h-3.5 w-3.5" />,
      onClick: onUnfreeze,
      hidden: status !== 'FROZEN',
    },
    {
      label: 'Archiver',
      icon: <Archive className="h-3.5 w-3.5" />,
      onClick: onArchive,
      destructive: true,
      hidden: isMain || status === 'ARCHIVED' || status === 'PROVISIONING',
      separatorBefore: true,
    },
    {
      label: 'Supprimer definitivement',
      icon: <Flame className="h-3.5 w-3.5" />,
      onClick: onPurge,
      destructive: true,
      hidden: isMain,
      separatorBefore: status !== 'ARCHIVED',
    },
  ];
}
