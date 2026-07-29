'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Eye, Edit, Power, PowerOff, Trash2, Ticket } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { AppBadge } from '@/components/ui/AppBadge';
import { SearchBar } from '@/components/shared/SearchBar';
import { FilterDialog } from '@/components/shared/FilterDialog';
import { ExportButton } from '@/components/shared/ExportButton';
import { RowActions } from '@/components/shared/RowActions';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Can } from '@/lib/components/Can';
import { usePermission } from '@/lib/hooks/usePermission';
import {
  useDeletePromoCode,
  usePromoCodes,
  useUpdatePromoCode,
} from '@/lib/hooks/usePromoCodes';
import type { PromoCode } from '@/lib/api/promoCodes';
import { PromoCodeFormDialog } from './PromoCodeFormDialog';
import {
  VISIBILITY_LABELS,
  formatAmountRange,
  formatDiscount,
  formatUsage,
  formatValidity,
} from './promoLabels';

const VISIBILITY_VARIANTS: Record<string, 'success' | 'info' | 'warning'> = {
  PUBLIC: 'success',
  PRIVATE: 'info',
  ASSIGNED: 'warning',
};

/** Un code peut etre actif mais deja expire : on le signale explicitement. */
function statusOf(row: PromoCode): { label: string; variant: 'success' | 'error' | 'warning' } {
  if (!row.isActive) return { label: 'Inactif', variant: 'error' };
  const now = Date.now();
  if (row.expiresAt && new Date(row.expiresAt).getTime() < now) {
    return { label: 'Expire', variant: 'warning' };
  }
  if (row.startsAt && new Date(row.startsAt).getTime() > now) {
    return { label: 'Programme', variant: 'warning' };
  }
  if (row.maxUses != null && row.usedCount >= row.maxUses) {
    return { label: 'Epuise', variant: 'warning' };
  }
  return { label: 'Actif', variant: 'success' };
}

export default function PromoCodesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [deleting, setDeleting] = useState<PromoCode | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const canManage = usePermission('promocode.manage');
  const update = useUpdatePromoCode();
  const remove = useDeletePromoCode();

  const visibilityFilter = searchParams.get('visibility') || '';
  const isActiveFilter = searchParams.get('isActive') || '';

  const { data, isLoading } = usePromoCodes({
    page,
    limit: 20,
    search: search.trim() || undefined,
    visibility: visibilityFilter || undefined,
    isActive: isActiveFilter ? isActiveFilter === 'true' : undefined,
  });

  const filterFields = [
    {
      key: 'visibility',
      label: 'Visibilite',
      type: 'select' as const,
      options: [
        { value: 'PUBLIC', label: 'Public' },
        { value: 'PRIVATE', label: 'Prive' },
        { value: 'ASSIGNED', label: 'Sur attribution' },
      ],
    },
    {
      key: 'isActive',
      label: 'Statut',
      type: 'select' as const,
      options: [
        { value: 'true', label: 'Actif' },
        { value: 'false', label: 'Inactif' },
      ],
    },
  ];

  const exportColumns = [
    { key: 'code', label: 'Code' },
    { key: 'label', label: 'Libelle' },
    { key: 'discountType', label: 'Type remise' },
    { key: 'discountValue', label: 'Valeur' },
    { key: 'usedCount', label: 'Utilisations' },
    { key: 'expiresAt', label: 'Expiration' },
  ];

  const columns = [
    {
      key: 'code',
      label: 'Code',
      render: (row: PromoCode) => (
        <Link
          href={`/promo-codes/${row.id}`}
          className="font-mono font-semibold text-primary-700 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {row.code}
        </Link>
      ),
    },
    { key: 'label', label: 'Libelle', render: (row: PromoCode) => row.label },
    {
      key: 'discount',
      label: 'Remise',
      render: (row: PromoCode) => (
        <span className="font-medium text-gray-900">
          {formatDiscount(row.discountType, row.discountValue)}
        </span>
      ),
    },
    {
      key: 'range',
      label: 'Intervalle',
      className: 'hidden lg:table-cell',
      render: (row: PromoCode) => formatAmountRange(row.minOrderAmount, row.maxOrderAmount),
    },
    {
      key: 'validity',
      label: 'Validite',
      className: 'hidden md:table-cell',
      render: (row: PromoCode) => formatValidity(row.startsAt, row.expiresAt),
    },
    {
      key: 'usage',
      label: 'Utilisations',
      render: (row: PromoCode) => formatUsage(row.usedCount, row.maxUses),
    },
    {
      key: 'visibility',
      label: 'Visibilite',
      render: (row: PromoCode) => (
        <AppBadge variant={VISIBILITY_VARIANTS[row.visibility]}>
          {VISIBILITY_LABELS[row.visibility]}
        </AppBadge>
      ),
    },
    {
      key: 'status',
      label: 'Statut',
      render: (row: PromoCode) => {
        const s = statusOf(row);
        return <AppBadge variant={s.variant}>{s.label}</AppBadge>;
      },
    },
    {
      key: 'actions',
      label: '',
      className: 'w-10',
      render: (row: PromoCode) => (
        <RowActions
          actions={[
            {
              label: 'Voir details',
              icon: <Eye className="h-4 w-4" />,
              onClick: () => router.push(`/promo-codes/${row.id}`),
            },
            ...(canManage
              ? [
                  {
                    label: 'Modifier',
                    icon: <Edit className="h-4 w-4" />,
                    onClick: () => setEditing(row),
                  },
                  {
                    label: row.isActive ? 'Desactiver' : 'Activer',
                    icon: row.isActive ? (
                      <PowerOff className="h-4 w-4" />
                    ) : (
                      <Power className="h-4 w-4" />
                    ),
                    onClick: () =>
                      update.mutate({ id: row.id, data: { isActive: !row.isActive } }),
                  },
                  {
                    label: 'Supprimer',
                    icon: <Trash2 className="h-4 w-4" />,
                    variant: 'destructive' as const,
                    onClick: () => setDeleting(row),
                  },
                ]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Codes promo</h1>
            <p className="mt-1 text-sm text-gray-500">
              Remises applicables par vos clients au moment du paiement.
            </p>
          </div>
          <Can permission="promocode.manage">
            <AppButton onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              Nouveau code
            </AppButton>
          </Can>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Rechercher un code..." />
          </div>
          <div className="flex items-center gap-2">
            <ExportButton data={data?.data || []} columns={exportColumns} fileName="codes-promo" />
            <FilterDialog fields={filterFields} />
          </div>
        </div>

        <AppCard padding="sm">
          {!isLoading && (data?.data?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <Ticket className="h-10 w-10 text-gray-300" />
              <p className="text-sm text-gray-500">
                Aucun code promo. Creez-en un pour le proposer a vos clients.
              </p>
            </div>
          ) : (
            <AppDataTable
              columns={columns}
              data={data?.data || []}
              isLoading={isLoading}
              page={page}
              totalPages={data?.meta?.totalPages || 1}
              total={data?.meta?.total}
              onPageChange={setPage}
              onRowClick={(row: PromoCode) => router.push(`/promo-codes/${row.id}`)}
            />
          )}
        </AppCard>
      </div>

      <PromoCodeFormDialog open={showCreate} onClose={() => setShowCreate(false)} />
      <PromoCodeFormDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        promoCode={editing}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
          setDeleting(null);
        }}
        title="Supprimer le code promo"
        message={
          deleting && (deleting._count?.redemptions ?? 0) > 0
            ? `Le code "${deleting.code}" a deja ete utilise : il sera archive et desactive, l'historique reste consultable.`
            : `Le code "${deleting?.code}" sera definitivement supprime.`
        }
        confirmLabel="Supprimer"
        loading={remove.isPending}
        variant="destructive"
      />
    </PageTransition>
  );
}
