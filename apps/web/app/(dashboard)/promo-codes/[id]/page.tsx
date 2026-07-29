'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Edit, Trash2, UserPlus, Users } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppTabs } from '@/components/ui/AppTabs';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Can } from '@/lib/components/Can';
import { formatAmount } from '@transitsoftservices/shared';
import {
  usePromoCode,
  usePromoCodeAssignments,
  usePromoCodeRedemptions,
  useUnassignPromoCode,
} from '@/lib/hooks/usePromoCodes';
import type { PromoCode, PromoCodeAssignment, PromoCodeRedemption } from '@/lib/api/promoCodes';
import { PromoCodeFormDialog } from '../PromoCodeFormDialog';
import { AssignClientsDialog } from './AssignClientsDialog';
import {
  PARCEL_CATEGORY_LABELS,
  REDEMPTION_STATUS_LABELS,
  REDEMPTION_STATUS_VARIANTS,
  TRANSIT_TYPE_LABELS,
  VISIBILITY_LABELS,
  formatAmountRange,
  formatDiscount,
  formatUsage,
  formatValidity,
} from '../promoLabels';

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-50 py-2 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-right text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}

/** Resume lisible du perimetre : "Toute la facture" si aucune restriction. */
function scopeSummary(promo: PromoCode): string[] {
  const parts: string[] = [];
  if (promo.parcelCategories.length > 0) {
    parts.push(
      `Types de colis : ${promo.parcelCategories.map((c) => PARCEL_CATEGORY_LABELS[c] ?? c).join(', ')}`,
    );
  }
  if (promo.transitTypes.length > 0) {
    parts.push(
      `Transport : ${promo.transitTypes.map((t) => TRANSIT_TYPE_LABELS[t] ?? t).join(', ')}`,
    );
  }
  if ((promo.routes?.length ?? 0) > 0) {
    parts.push(`Routes : ${promo.routes!.map((r) => r.transitRoute.name).join(', ')}`);
  }
  return parts.length > 0 ? parts : ['Toute la facture'];
}

export default function PromoCodeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [unassigning, setUnassigning] = useState<PromoCodeAssignment | null>(null);
  const [assignPage, setAssignPage] = useState(1);
  const [redemptionPage, setRedemptionPage] = useState(1);

  const { data, isLoading } = usePromoCode(id);
  const promo: PromoCode | undefined = data?.data;

  const assignments = usePromoCodeAssignments(id, { page: assignPage, limit: 20 });
  const redemptions = usePromoCodeRedemptions(id, { page: redemptionPage, limit: 20 });
  const unassign = useUnassignPromoCode(id);

  if (isLoading) {
    return (
      <PageTransition>
        <div className="space-y-4">
          <AppSkeleton className="h-8 w-64" />
          <AppSkeleton className="h-48 w-full" />
        </div>
      </PageTransition>
    );
  }

  if (!promo) {
    return (
      <PageTransition>
        <AppCard>
          <p className="p-6 text-center text-sm text-gray-500">Code promo introuvable.</p>
        </AppCard>
      </PageTransition>
    );
  }

  const assignmentColumns = [
    {
      key: 'client',
      label: 'Client',
      render: (row: PromoCodeAssignment) => (
        <Link
          href={`/clients/${row.clientId}`}
          className="font-medium text-primary-700 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {row.client.fullName}
        </Link>
      ),
    },
    {
      key: 'contact',
      label: 'Contact',
      className: 'hidden md:table-cell',
      render: (row: PromoCodeAssignment) => row.client.phone ?? row.client.email ?? '-',
    },
    {
      key: 'usage',
      label: 'Utilisations',
      render: (row: PromoCodeAssignment) =>
        formatUsage(row.usedCount, row.maxUses ?? promo.maxUsesPerClient),
    },
    {
      key: 'actions',
      label: '',
      className: 'w-24',
      render: (row: PromoCodeAssignment) => (
        <Can permission="promocode.manage">
          <AppButton
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setUnassigning(row);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </AppButton>
        </Can>
      ),
    },
  ];

  const redemptionColumns = [
    {
      key: 'client',
      label: 'Client',
      render: (row: PromoCodeRedemption) => row.client.fullName,
    },
    {
      key: 'invoice',
      label: 'Facture',
      render: (row: PromoCodeRedemption) => (
        <Link
          href={`/invoices/${row.invoice.id}`}
          className="font-mono text-xs text-primary-700 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {row.invoice.reference}
        </Link>
      ),
    },
    {
      key: 'discountAmount',
      label: 'Remise accordee',
      render: (row: PromoCodeRedemption) => formatAmount(Number(row.discountAmount)),
    },
    {
      key: 'eligibleBase',
      label: 'Assiette',
      className: 'hidden lg:table-cell',
      render: (row: PromoCodeRedemption) => formatAmount(Number(row.eligibleBase)),
    },
    {
      key: 'status',
      label: 'Statut',
      render: (row: PromoCodeRedemption) => (
        <AppBadge variant={REDEMPTION_STATUS_VARIANTS[row.status]}>
          {REDEMPTION_STATUS_LABELS[row.status]}
        </AppBadge>
      ),
    },
    {
      key: 'createdAt',
      label: 'Date',
      className: 'hidden md:table-cell',
      render: (row: PromoCodeRedemption) => new Date(row.createdAt).toLocaleDateString('fr-FR'),
    },
  ];

  const assignedIds: string[] = (assignments.data?.data ?? []).map(
    (a: PromoCodeAssignment) => a.clientId,
  );

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <button
              onClick={() => router.push('/promo-codes')}
              className="mb-2 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Codes promo
            </button>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-2xl font-bold text-gray-900">{promo.code}</h1>
              <AppBadge variant={promo.isActive ? 'success' : 'error'}>
                {promo.isActive ? 'Actif' : 'Inactif'}
              </AppBadge>
            </div>
            <p className="mt-1 text-sm text-gray-500">{promo.label}</p>
          </div>
          <Can permission="promocode.manage">
            <AppButton variant="outline" onClick={() => setEditing(true)}>
              <Edit className="h-4 w-4" />
              Modifier
            </AppButton>
          </Can>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AppCard>
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Conditions</h3>
            <InfoRow
              label="Remise"
              value={formatDiscount(promo.discountType, promo.discountValue)}
            />
            {promo.maxDiscountAmount != null && (
              <InfoRow
                label="Plafond de remise"
                value={formatAmount(Number(promo.maxDiscountAmount))}
              />
            )}
            <InfoRow
              label="Intervalle de tarifs"
              value={formatAmountRange(promo.minOrderAmount, promo.maxOrderAmount)}
            />
            <InfoRow label="Validite" value={formatValidity(promo.startsAt, promo.expiresAt)} />
            <InfoRow label="Visibilite" value={VISIBILITY_LABELS[promo.visibility]} />
          </AppCard>

          <AppCard>
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Perimetre et usage</h3>
            <InfoRow
              label="S'applique a"
              value={
                <span className="block max-w-xs text-left">
                  {scopeSummary(promo).map((s) => (
                    <span key={s} className="block">
                      {s}
                    </span>
                  ))}
                </span>
              }
            />
            <InfoRow
              label="Utilisations totales"
              value={formatUsage(promo.usedCount, promo.maxUses)}
            />
            <InfoRow
              label="Par client"
              value={promo.maxUsesPerClient == null ? 'Illimite' : `${promo.maxUsesPerClient}`}
            />
            <InfoRow
              label="Clients attribues"
              value={`${promo._count?.assignments ?? assignments.data?.meta?.total ?? 0}`}
            />
            {promo.description && <InfoRow label="Description" value={promo.description} />}
          </AppCard>
        </div>

        <AppTabs
          tabs={[
            {
              value: 'assignments',
              label: 'Attributions',
              icon: <Users className="h-4 w-4" />,
              content: (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                      Clients pouvant utiliser ce code avec un quota dedie.
                      {promo.visibility === 'ASSIGNED' &&
                        ' Ce code est reserve : seuls ces clients peuvent l’utiliser.'}
                    </p>
                    <Can permission="promocode.manage">
                      <AppButton size="sm" onClick={() => setAssigning(true)}>
                        <UserPlus className="h-4 w-4" />
                        Attribuer
                      </AppButton>
                    </Can>
                  </div>
                  <AppCard padding="sm">
                    <AppDataTable
                      columns={assignmentColumns}
                      data={assignments.data?.data || []}
                      isLoading={assignments.isLoading}
                      page={assignPage}
                      totalPages={assignments.data?.meta?.totalPages || 1}
                      total={assignments.data?.meta?.total}
                      onPageChange={setAssignPage}
                      emptyMessage="Aucun client attribue."
                    />
                  </AppCard>
                </div>
              ),
            },
            {
              value: 'redemptions',
              label: 'Utilisations',
              content: (
                <AppCard padding="sm">
                  <AppDataTable
                    columns={redemptionColumns}
                    data={redemptions.data?.data || []}
                    isLoading={redemptions.isLoading}
                    page={redemptionPage}
                    totalPages={redemptions.data?.meta?.totalPages || 1}
                    total={redemptions.data?.meta?.total}
                    onPageChange={setRedemptionPage}
                    emptyMessage="Ce code n'a pas encore ete utilise."
                  />
                </AppCard>
              ),
            },
          ]}
        />
      </div>

      <PromoCodeFormDialog
        open={editing}
        onClose={() => setEditing(false)}
        promoCode={promo}
      />
      <AssignClientsDialog
        open={assigning}
        onClose={() => setAssigning(false)}
        promoCodeId={id}
        alreadyAssignedIds={assignedIds}
        defaultMaxUses={promo.maxUsesPerClient}
      />
      <ConfirmDialog
        open={!!unassigning}
        onClose={() => setUnassigning(null)}
        onConfirm={() => {
          if (unassigning) unassign.mutate(unassigning.clientId);
          setUnassigning(null);
        }}
        title="Retirer l'attribution"
        message={`${unassigning?.client.fullName} ne pourra plus utiliser ce code.`}
        confirmLabel="Retirer"
        loading={unassign.isPending}
        variant="destructive"
      />
    </PageTransition>
  );
}
