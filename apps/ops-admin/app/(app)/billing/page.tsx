'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  PlayCircle,
  TrendingUp,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface TenantMini {
  id: string;
  slug: string;
  name: string;
  status?: string;
}
interface PaymentRow {
  id: string;
  amount: string;
  currency: string;
  provider: string;
  status: string;
  externalRef: string | null;
  paidAt: string | null;
  createdAt: string;
  subscription: { tenant: TenantMini };
}
interface ExpiringSub {
  id: string;
  plan: string;
  pricePerMonth: string;
  currency: string;
  expiresAt: string;
  tenant: TenantMini;
}
interface PlanChange {
  id: string;
  status: string;
  requestedAt: string;
  toPlan: { code: string; name: string };
  tenant: TenantMini;
}
interface BillingOverview {
  mrr: Record<string, number>;
  activeSubscriptionsCount: number;
  expiringSoon: ExpiringSub[];
  pendingPayments: PaymentRow[];
  recentPayments: PaymentRow[];
  pendingPlanChanges: PlanChange[];
}

function fmtMoney(amount: number | string, currency: string): string {
  return `${Number(amount).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ${currency}`;
}

export default function BillingPage() {
  const qc = useQueryClient();
  const [confirmAutofreeze, setConfirmAutofreeze] = useState(false);
  const [confirmPayment, setConfirmPayment] = useState<PaymentRow | null>(null);

  const overview = useQuery<BillingOverview>({
    queryKey: ['billing-overview'],
    queryFn: async () => (await api.get('/billing/overview')).data?.data,
    refetchInterval: 30_000,
  });

  const confirmManual = useMutation({
    mutationFn: (paymentId: string) =>
      api.post('/billing/confirm-manual', { paymentId }),
    onSuccess: () => {
      setConfirmPayment(null);
      qc.invalidateQueries({ queryKey: ['billing-overview'] });
    },
  });

  const autofreeze = useMutation({
    mutationFn: () => api.post('/billing/run-autofreeze'),
    onSuccess: () => {
      setConfirmAutofreeze(false);
      qc.invalidateQueries({ queryKey: ['billing-overview'] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
    },
  });

  if (overview.isLoading) {
    return <p className="text-sm text-gray-500">Chargement...</p>;
  }
  if (!overview.data) {
    return <p className="text-sm text-red-600">Erreur de chargement.</p>;
  }
  const d = overview.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Facturation</h1>
          <p className="mt-1 text-sm text-gray-500">
            MRR, paiements en attente et expirations a venir.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmAutofreeze(true)}
          className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          <PlayCircle className="h-4 w-4" />
          Lancer auto-freeze
        </button>
      </div>

      {/* MRR cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          icon={TrendingUp}
          label="MRR"
          value={Object.entries(d.mrr).length
            ? Object.entries(d.mrr).map(([c, v]) => fmtMoney(v, c)).join(' / ')
            : '0'}
          sub={`${d.activeSubscriptionsCount} abonnement(s) actif(s)`}
        />
        <Stat
          icon={Clock}
          label="Paiements en attente"
          value={String(d.pendingPayments.length)}
          sub="A confirmer manuellement"
        />
        <Stat
          icon={AlertCircle}
          label="Expirent <14j"
          value={String(d.expiringSoon.length)}
          sub="Notifier ou attendre paiement"
        />
      </div>

      {/* Pending payments */}
      <Section
        title="Paiements en attente"
        empty="Aucun paiement en attente."
        emptyOk
        items={d.pendingPayments}
        headers={['Tenant', 'Montant', 'Provider', 'Ref ext.', 'Cree le', '']}
        renderRow={(p) => (
          <tr key={p.id} className="border-t">
            <td className="px-4 py-2">
              <Link
                href={`/tenants/${p.subscription.tenant.id}`}
                className="font-medium text-primary-700 hover:underline"
              >
                {p.subscription.tenant.slug}
              </Link>
              <div className="text-xs text-gray-500">{p.subscription.tenant.name}</div>
            </td>
            <td className="px-4 py-2 font-medium">{fmtMoney(p.amount, p.currency)}</td>
            <td className="px-4 py-2 text-xs uppercase">{p.provider}</td>
            <td className="px-4 py-2 text-xs text-gray-500">{p.externalRef || '-'}</td>
            <td className="px-4 py-2 text-xs text-gray-500">{formatDate(p.createdAt)}</td>
            <td className="px-4 py-2 text-right">
              <button
                type="button"
                onClick={() => setConfirmPayment(p)}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Confirmer
              </button>
            </td>
          </tr>
        )}
      />

      {/* Plan changes pending payment */}
      <Section
        title="Changements de plan en attente de paiement"
        empty="Aucun changement de plan en attente."
        emptyOk
        items={d.pendingPlanChanges}
        headers={['Tenant', 'Plan cible', 'Statut', 'Demande le']}
        renderRow={(c) => (
          <tr key={c.id} className="border-t">
            <td className="px-4 py-2">
              <Link
                href={`/tenants/${c.tenant.id}`}
                className="font-medium text-primary-700 hover:underline"
              >
                {c.tenant.slug}
              </Link>
            </td>
            <td className="px-4 py-2">
              {c.toPlan.name} <span className="text-xs text-gray-500">({c.toPlan.code})</span>
            </td>
            <td className="px-4 py-2"><StatusBadge status={c.status} /></td>
            <td className="px-4 py-2 text-xs text-gray-500">{formatDate(c.requestedAt)}</td>
          </tr>
        )}
      />

      {/* Expiring subscriptions */}
      <Section
        title="Abonnements expirant bientot (14j)"
        empty="Aucune expiration imminente."
        emptyOk
        items={d.expiringSoon}
        headers={['Tenant', 'Plan', 'Prix', 'Expire le']}
        renderRow={(s) => {
          const days = Math.ceil(
            (new Date(s.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
          );
          return (
            <tr key={s.id} className="border-t">
              <td className="px-4 py-2">
                <Link
                  href={`/tenants/${s.tenant.id}`}
                  className="font-medium text-primary-700 hover:underline"
                >
                  {s.tenant.slug}
                </Link>
                <div className="text-xs text-gray-500">{s.tenant.name}</div>
              </td>
              <td className="px-4 py-2 text-xs uppercase">{s.plan}</td>
              <td className="px-4 py-2 font-medium">{fmtMoney(s.pricePerMonth, s.currency)}</td>
              <td className="px-4 py-2 text-xs">
                {formatDate(s.expiresAt)}{' '}
                <span
                  className={
                    'ml-1 font-semibold ' +
                    (days <= 3 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-gray-600')
                  }
                >
                  (J-{days})
                </span>
              </td>
            </tr>
          );
        }}
      />

      {/* Recent payments */}
      <Section
        title="Derniers paiements confirmes"
        empty="Aucun paiement recent."
        items={d.recentPayments}
        headers={['Tenant', 'Montant', 'Provider', 'Ref ext.', 'Paye le']}
        renderRow={(p) => (
          <tr key={p.id} className="border-t">
            <td className="px-4 py-2">
              <Link
                href={`/tenants/${p.subscription.tenant.id}`}
                className="font-medium text-primary-700 hover:underline"
              >
                {p.subscription.tenant.slug}
              </Link>
            </td>
            <td className="px-4 py-2 font-medium">{fmtMoney(p.amount, p.currency)}</td>
            <td className="px-4 py-2 text-xs uppercase">{p.provider}</td>
            <td className="px-4 py-2 text-xs text-gray-500">{p.externalRef || '-'}</td>
            <td className="px-4 py-2 text-xs text-gray-500">{formatDate(p.paidAt)}</td>
          </tr>
        )}
      />

      <ConfirmDialog
        open={confirmAutofreeze}
        onCancel={() => setConfirmAutofreeze(false)}
        title="Lancer l'auto-freeze maintenant ?"
        description="Cela va parcourir tous les abonnements expires et freezer ceux qui doivent l'etre. Operation idempotente."
        confirmLabel="Lancer"
        loading={autofreeze.isPending}
        onConfirm={() => autofreeze.mutate()}
      />

      <ConfirmDialog
        open={!!confirmPayment}
        onCancel={() => setConfirmPayment(null)}
        title="Confirmer ce paiement manuellement ?"
        description={
          confirmPayment
            ? `Tenant ${confirmPayment.subscription.tenant.slug}, montant ${fmtMoney(confirmPayment.amount, confirmPayment.currency)} via ${confirmPayment.provider}. Cette confirmation active l'abonnement.`
            : ''
        }
        confirmLabel="Confirmer le paiement"
        loading={confirmManual.isPending}
        onConfirm={() => {
          if (confirmPayment) confirmManual.mutate(confirmPayment.id);
        }}
      />
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase text-gray-500">{label}</span>
        <Icon size={16} className="text-gray-400" />
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="text-xs text-gray-500">{sub}</div>
    </div>
  );
}

function Section<T,>({
  title,
  items,
  empty,
  emptyOk,
  headers,
  renderRow,
}: {
  title: string;
  items: T[];
  empty: string;
  emptyOk?: boolean;
  headers: string[];
  renderRow: (item: T) => React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-white shadow-sm">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">
          {title}{' '}
          <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">
            {items.length}
          </span>
        </h2>
      </header>
      {items.length === 0 ? (
        <p className={'px-4 py-6 text-center text-sm ' + (emptyOk ? 'text-gray-500' : 'text-amber-600')}>
          {empty}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-4 py-2 text-left font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{items.map((it) => renderRow(it))}</tbody>
        </table>
      )}
    </section>
  );
}
