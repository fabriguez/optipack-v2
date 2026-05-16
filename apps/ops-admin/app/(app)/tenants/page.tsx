'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, ExternalLink, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate } from '@/lib/utils';
import { Pagination } from '@/components/Pagination';
import { ConfirmDialog } from '@/components/ConfirmDialog';

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
  // Cible de suppression : on stocke le tenant complet pour pouvoir afficher
  // son slug dans le requireText (DELETE <slug>) et son nom dans le titre.
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['tenants', { page, pageSize, q }],
    queryFn: async (): Promise<Listing> =>
      (await api.get('/tenants', { params: { page, pageSize, q } })).data,
    placeholderData: (prev) => prev,
  });

  // Suppression = archive cote backend : pipeline `DeleteTenantUseCase` (stop
  // containers + DROP DATABASE + Caddy reload + status=ARCHIVED). On reutilise
  // l'endpoint /archive existant -- pas de nouvelle route a creer.
  const deleteMutation = useMutation({
    mutationFn: (tenantId: string) => api.post(`/tenants/${tenantId}/archive`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      setDeleteTarget(null);
    },
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
                    <Link
                      href={`/tenants/${t.id}`}
                      className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Ouvrir
                    </Link>
                    {/* Bouton supprimer : cache sur le tenant principal
                        (isMain) et sur les tenants deja archives. */}
                    {!t.isMain && t.status !== 'ARCHIVED' && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(t)}
                        className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        title="Supprimer le tenant (destructif)"
                      >
                        <Trash2 className="h-3 w-3" />
                        Supprimer
                      </button>
                    )}
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
        open={!!deleteTarget}
        title={deleteTarget ? `SUPPRIMER ${deleteTarget.slug} ? Action irreversible.` : ''}
        description={
          deleteTarget ? (
            <div className="whitespace-pre-line">
              {`Cette action va :
- Arreter et supprimer les conteneurs du tenant
- Drop la base de donnees du tenant (DESTRUCTIF)
- Retirer les routes Caddy
- Marquer le tenant ARCHIVED

Aucun retour en arriere automatique.`}
            </div>
          ) : null
        }
        destructive
        confirmLabel="Supprimer definitivement"
        requireText={deleteTarget ? `DELETE ${deleteTarget.slug}` : undefined}
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
