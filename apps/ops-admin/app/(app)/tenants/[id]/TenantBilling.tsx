'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMe } from '@/lib/useMe';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate } from '@/lib/utils';

interface Plan {
  id: string;
  code: string;
  name: string;
  pricePerMonth: string;
  currency: string;
  cpuLimit: number;
  memoryMb: number;
  isActive: boolean;
}
interface Payment {
  id: string;
  amount: string;
  currency: string;
  provider: string;
  status: string;
  externalRef: string | null;
  paidAt: string | null;
  createdAt: string;
}
interface Subscription {
  id: string;
  plan: string;
  pricePerMonth: string;
  currency: string;
  startedAt: string;
  expiresAt: string;
  isActive: boolean;
}
interface BillingData {
  tenant: { id: string; slug: string; name: string; status: string; resourcePlanId: string | null };
  subscription: Subscription | null;
  payments: Payment[];
  plans: Plan[];
  pendingPlanChange: {
    id: string;
    status: string;
    toPlan: { id: string; code: string; name: string; pricePerMonth: string; currency: string };
  } | null;
}

function fmtMoney(amount: number | string, currency: string): string {
  return `${Number(amount).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ${currency}`;
}

export function TenantBilling({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { isTenantUser } = useMe();
  const [months, setMonths] = useState(1);
  const [operator, setOperator] = useState<'mtn' | 'orange'>('mtn');
  const [phone, setPhone] = useState('');
  const [checkoutMsg, setCheckoutMsg] = useState<string | null>(null);
  // Paiement hors ligne (ops admin global uniquement)
  const [offMonths, setOffMonths] = useState(1);
  const [offAmount, setOffAmount] = useState('');
  const [offNote, setOffNote] = useState('');
  const [offMsg, setOffMsg] = useState<string | null>(null);

  const billing = useQuery<BillingData>({
    queryKey: ['tenant-billing', tenantId],
    queryFn: async () => (await api.get(`/tenants/${tenantId}/billing`)).data?.data,
    refetchInterval: 15_000,
  });

  // Paiement / renouvellement via Mobile Money (push USSD cote operateur).
  const pay = useMutation({
    mutationFn: async () => {
      const body = {
        provider: operator,
        intent: { type: 'subscription_renewal', tenantId, months },
        phone: phone.trim(),
      };
      return (await api.post('/billing/checkout', body)).data?.data;
    },
    onSuccess: (data) => {
      setCheckoutMsg(
        data?.instructions || data?.message ||
          'Demande envoyee. Validez le paiement sur votre telephone (USSD/app Mobile Money).',
      );
      qc.invalidateQueries({ queryKey: ['tenant-billing', tenantId] });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setCheckoutMsg(msg || 'Echec du paiement.');
    },
  });

  // Paiement HORS LIGNE : l'ops admin encaisse (especes / virement) sans MoMo.
  // Etend l'abonnement et degele le tenant -> pas de freeze au prochain cron.
  const offlinePay = useMutation({
    mutationFn: async () => {
      const body: { months: number; amount?: number; note?: string } = { months: offMonths };
      if (offAmount.trim()) body.amount = Number(offAmount);
      if (offNote.trim()) body.note = offNote.trim();
      return (await api.post(`/tenants/${tenantId}/billing/offline-payment`, body)).data?.data as {
        amount: number;
        months: number;
        expiresAt: string | null;
      };
    },
    onSuccess: (data) => {
      setOffMsg(
        `Paiement enregistre. Abonnement etendu de ${data.months} mois` +
          (data.expiresAt ? ` — expire le ${formatDate(data.expiresAt)}.` : '.'),
      );
      setOffAmount('');
      setOffNote('');
      qc.invalidateQueries({ queryKey: ['tenant-billing', tenantId] });
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setOffMsg(msg || 'Echec de l\'enregistrement du paiement.');
    },
  });

  // Changement de plan : cree un PlanChange en attente de paiement.
  const changePlan = useMutation({
    mutationFn: async (toPlanCode: string) =>
      (await api.post(`/tenants/${tenantId}/upgrade`, { toPlanCode })).data?.data as {
        jobId?: string;
        requiresPayment?: boolean;
      },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['tenant-billing', tenantId] });
      // Application immediate (ops global / downgrade) -> un job a ete lance :
      // on redirige vers ses logs en temps reel. Sinon (paiement requis) on
      // reste sur la page billing pour regler.
      if (data?.jobId) router.push(`/tenants/${tenantId}/jobs/${data.jobId}`);
    },
  });

  if (billing.isLoading) return <p className="text-xs text-gray-400">Chargement...</p>;
  if (!billing.data) return <p className="text-xs text-red-600">Erreur de chargement.</p>;
  const d = billing.data;
  const sub = d.subscription;
  const currentPlanId = d.tenant.resourcePlanId;

  return (
    <div className="space-y-5">
      {/* Abonnement courant */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cell label="Abonnement">{sub ? <StatusBadge status={sub.isActive ? 'active' : 'inactive'} /> : '-'}</Cell>
        <Cell label="Plan">{sub?.plan ?? '-'}</Cell>
        <Cell label="Prix / mois">{sub ? fmtMoney(sub.pricePerMonth, sub.currency) : '-'}</Cell>
        <Cell label="Expire le">{sub ? formatDate(sub.expiresAt) : '-'}</Cell>
      </div>

      {/* Reglement Mobile Money */}
      <div className="rounded-md border bg-gray-50 p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase text-gray-600">Regler / renouveler (Mobile Money)</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">
            <span className="block text-gray-500">Operateur</span>
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value as 'mtn' | 'orange')}
              className="mt-0.5 rounded border px-2 py-1 text-sm"
            >
              <option value="mtn">MTN MoMo</option>
              <option value="orange">Orange Money</option>
            </select>
          </label>
          <label className="text-xs">
            <span className="block text-gray-500">Mois</span>
            <input
              type="number"
              min={1}
              max={24}
              value={months}
              onChange={(e) => setMonths(Math.max(1, Number(e.target.value)))}
              className="mt-0.5 w-16 rounded border px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs flex-1 min-w-[160px]">
            <span className="block text-gray-500">Numero ({operator === 'mtn' ? 'MTN' : 'Orange'})</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="6XXXXXXXX"
              className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={!phone.trim() || pay.isPending}
            onClick={() => { setCheckoutMsg(null); pay.mutate(); }}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {pay.isPending ? 'Envoi...' : `Payer ${sub ? fmtMoney(Number(sub.pricePerMonth) * months, sub.currency) : ''}`}
          </button>
        </div>
        {checkoutMsg && <p className="mt-2 text-xs text-gray-700">{checkoutMsg}</p>}
      </div>

      {/* Paiement hors ligne — ops admin global uniquement (especes / virement) */}
      {!isTenantUser && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
          <h3 className="mb-1 text-xs font-semibold uppercase text-emerald-800">
            Encaisser un paiement hors ligne
          </h3>
          <p className="mb-2 text-[11px] text-emerald-700">
            Especes, virement ou geste commercial. Etend l&apos;abonnement immediatement et degele
            le tenant si besoin — aucun passage par Mobile Money.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <span className="block text-gray-500">Mois</span>
              <input
                type="number"
                min={1}
                max={36}
                value={offMonths}
                onChange={(e) => setOffMonths(Math.max(1, Number(e.target.value)))}
                className="mt-0.5 w-16 rounded border px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs">
              <span className="block text-gray-500">
                Montant (optionnel){sub ? ` — defaut ${fmtMoney(Number(sub.pricePerMonth) * offMonths, sub.currency)}` : ''}
              </span>
              <input
                type="number"
                min={0}
                value={offAmount}
                onChange={(e) => setOffAmount(e.target.value)}
                placeholder="auto"
                className="mt-0.5 w-32 rounded border px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs flex-1 min-w-[160px]">
              <span className="block text-gray-500">Reference / note (optionnel)</span>
              <input
                type="text"
                value={offNote}
                onChange={(e) => setOffNote(e.target.value)}
                placeholder="Virement BICEC #1234"
                className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={!sub || offlinePay.isPending}
              onClick={() => { setOffMsg(null); offlinePay.mutate(); }}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {offlinePay.isPending ? 'Enregistrement...' : 'Enregistrer le paiement'}
            </button>
          </div>
          {offMsg && <p className="mt-2 text-xs text-gray-700">{offMsg}</p>}
        </div>
      )}

      {/* Plan en attente de paiement */}
      {d.pendingPlanChange && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Changement de plan en attente de paiement : <b>{d.pendingPlanChange.toPlan.name}</b>{' '}
          ({fmtMoney(d.pendingPlanChange.toPlan.pricePerMonth, d.pendingPlanChange.toPlan.currency)}/mois).
          Reglez-le via Mobile Money ci-dessus.
        </div>
      )}

      {/* Changement de plan */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase text-gray-600">Changer de plan</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {d.plans.map((p) => {
            const current = p.id === currentPlanId;
            return (
              <div
                key={p.id}
                className={
                  'rounded-md border p-3 ' + (current ? 'border-primary-300 bg-primary-50' : 'bg-white')
                }
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{p.name}</span>
                  {current && <span className="text-[10px] uppercase text-primary-700">Actuel</span>}
                </div>
                <div className="mt-1 text-sm font-semibold">{fmtMoney(p.pricePerMonth, p.currency)}<span className="text-xs font-normal text-gray-500">/mois</span></div>
                <div className="text-[11px] text-gray-500">{p.cpuLimit} vCPU · {Math.round(p.memoryMb / 1024)} Go RAM</div>
                {!current && (
                  <button
                    type="button"
                    disabled={changePlan.isPending}
                    onClick={() => changePlan.mutate(p.code)}
                    className="mt-2 w-full rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                  >
                    Choisir ce plan
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {changePlan.isError && (
          <p className="mt-1 text-xs text-red-600">
            {(changePlan.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur'}
          </p>
        )}
      </div>

      {/* Historique paiements */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase text-gray-600">Factures / paiements</h3>
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-gray-500">
            <tr>
              <th className="px-2 py-1 text-left font-normal">Date</th>
              <th className="px-2 py-1 text-left font-normal">Montant</th>
              <th className="px-2 py-1 text-left font-normal">Moyen</th>
              <th className="px-2 py-1 text-left font-normal">Statut</th>
              <th className="px-2 py-1 text-left font-normal">Ref</th>
            </tr>
          </thead>
          <tbody>
            {d.payments.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-2 py-1.5 text-gray-500">{formatDate(p.paidAt ?? p.createdAt)}</td>
                <td className="px-2 py-1.5 font-medium">{fmtMoney(p.amount, p.currency)}</td>
                <td className="px-2 py-1.5 uppercase">{p.provider}</td>
                <td className="px-2 py-1.5"><StatusBadge status={p.status} /></td>
                <td className="px-2 py-1.5 text-gray-400">{p.externalRef || '-'}</td>
              </tr>
            ))}
            {d.payments.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-center text-gray-400">Aucun paiement.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-white px-3 py-2 shadow-sm">
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}
