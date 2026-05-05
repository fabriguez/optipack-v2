'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AppCard } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { formatAmount } from '@transitsoftservices/shared';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Especes',
  MOBILE_MONEY: 'Mobile Money',
  BANK_TRANSFER: 'Virement',
  CHECK: 'Cheque',
  CARD: 'Carte',
  STRIPE: 'Stripe',
  OTHER: 'Autre',
};

interface BreakdownData {
  paymentsTotal: number;
  paymentsByRouteAndMethod: Array<{
    routeId: string | null;
    routeName: string;
    type: string | null;
    methods: Record<string, number>;
    total: number;
    count: number;
  }>;
  entriesByRoute: Array<{
    routeId: string | null;
    routeName: string;
    type: string | null;
    total: number;
    count: number;
  }>;
  disbursementsTotal: number;
  disbursementsByCategory: Array<{ category: string; count: number; total: number }>;
}

interface Props {
  agencyId: string;
}

export function AgencyBreakdownTab({ agencyId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['agencies', agencyId, 'breakdown'],
    queryFn: () => apiClient.get(`/agencies/${agencyId}/breakdown`).then((r) => r.data),
    enabled: !!agencyId,
  });

  if (isLoading) return <p className="text-sm text-gray-400">Chargement...</p>;
  const breakdown = (data?.data as BreakdownData) ?? null;
  if (!breakdown) return <p className="text-sm text-gray-400">Aucune donnee.</p>;

  const allMethods = Array.from(
    new Set(breakdown.paymentsByRouteAndMethod.flatMap((r) => Object.keys(r.methods))),
  ).sort();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AppCard>
          <p className="text-xs uppercase tracking-wider text-gray-400">Paiements (30 j)</p>
          <p className="mt-1 text-2xl font-bold text-green-600">+{formatAmount(breakdown.paymentsTotal)}</p>
        </AppCard>
        <AppCard>
          <p className="text-xs uppercase tracking-wider text-gray-400">Decaissements (30 j)</p>
          <p className="mt-1 text-2xl font-bold text-red-600">-{formatAmount(breakdown.disbursementsTotal)}</p>
        </AppCard>
      </div>

      <AppCard>
        <h3 className="mb-3 text-base font-semibold text-gray-900">
          Paiements par route de transit et mode
        </h3>
        {breakdown.paymentsByRouteAndMethod.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun paiement sur la periode.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="pb-2">Route</th>
                {allMethods.map((m) => (
                  <th key={m} className="pb-2 text-right">{METHOD_LABELS[m] || m}</th>
                ))}
                <th className="pb-2 text-right">Total</th>
                <th className="pb-2 text-right">Nb</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {breakdown.paymentsByRouteAndMethod.map((row) => (
                <tr key={row.routeId ?? row.routeName}>
                  <td className="py-2">
                    <span className="font-medium">{row.routeName}</span>
                    {row.type && <span className="ml-2 text-[10px] uppercase text-gray-400">{row.type}</span>}
                  </td>
                  {allMethods.map((m) => (
                    <td key={m} className="py-2 text-right text-gray-700">
                      {row.methods[m] ? formatAmount(row.methods[m]) : '-'}
                    </td>
                  ))}
                  <td className="py-2 text-right font-bold text-primary-700">{formatAmount(row.total)}</td>
                  <td className="py-2 text-right text-gray-500">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AppCard>

      <AppCard>
        <h3 className="mb-3 text-base font-semibold text-gray-900">Entrees par route de transit</h3>
        {breakdown.entriesByRoute.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune entree.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="pb-2">Route</th>
                <th className="pb-2 text-right">Nb paiements</th>
                <th className="pb-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {breakdown.entriesByRoute.map((r) => (
                <tr key={r.routeId ?? r.routeName}>
                  <td className="py-2">
                    <span className="font-medium">{r.routeName}</span>
                    {r.type && <span className="ml-2 text-[10px] uppercase text-gray-400">{r.type}</span>}
                  </td>
                  <td className="py-2 text-right">{r.count}</td>
                  <td className="py-2 text-right font-bold text-primary-700">{formatAmount(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AppCard>

      <AppCard>
        <h3 className="mb-3 text-base font-semibold text-gray-900">Decaissements par categorie</h3>
        {breakdown.disbursementsByCategory.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun decaissement.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="pb-2">Categorie / Raison</th>
                <th className="pb-2 text-right">Nb</th>
                <th className="pb-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {breakdown.disbursementsByCategory.map((d) => (
                <tr key={d.category}>
                  <td className="py-2 font-medium">
                    <AppBadge>{d.category}</AppBadge>
                  </td>
                  <td className="py-2 text-right">{d.count}</td>
                  <td className="py-2 text-right font-bold text-red-600">-{formatAmount(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AppCard>
    </div>
  );
}
