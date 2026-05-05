'use client';

import { useState } from 'react';
import { Vault, Lock } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { CardSkeleton } from '@/components/ui/AppSkeleton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { formatAmount } from '@transitsoftservices/shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cashRegisterApi } from '@/lib/api/finance';
import { apiClient } from '@/lib/api/client';
import { useAgencies } from '@/lib/hooks/useAgencies';
import { toast } from 'sonner';

export default function CashRegisterPage() {
  const [selectedAgency, setSelectedAgency] = useState<string>('');
  const [showClose, setShowClose] = useState(false);
  const qc = useQueryClient();

  const { data: agencies } = useAgencies({ limit: 100 });
  const agencyId = selectedAgency || agencies?.data?.[0]?.id || '';

  const { data: register, isLoading } = useQuery({
    queryKey: ['cash-register', agencyId],
    queryFn: () => cashRegisterApi.get(agencyId),
    enabled: !!agencyId,
  });

  const { data: breakdown } = useQuery({
    queryKey: ['cash-register', agencyId, 'breakdown'],
    queryFn: () => apiClient.get(`/agencies/${agencyId}/breakdown`).then((r) => r.data),
    enabled: !!agencyId,
  });

  const closeMutation = useMutation({
    mutationFn: () => cashRegisterApi.close(agencyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-register'] });
      toast.success('Caisse cloturee');
      setShowClose(false);
    },
  });

  const cr = register?.data;

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Caisse Agence</h1>
            <p className="text-sm text-gray-500 mt-1">Suivi en temps reel de la caisse du jour.</p>
          </div>
          {cr && !cr.isClosed && (
            <AppButton variant="outline" onClick={() => setShowClose(true)}>
              <Lock className="h-4 w-4" />
              Cloturer la caisse
            </AppButton>
          )}
        </div>

        {/* Agency selector */}
        <div className="flex gap-2">
          {(agencies?.data || []).map((a: any) => (
            <button
              key={a.id}
              onClick={() => setSelectedAgency(a.id)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                agencyId === a.id
                  ? 'bg-primary-500 text-white'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : cr ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <AppCard>
                <p className="text-sm text-gray-500">Solde d'ouverture</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {formatAmount(Number(cr.openingBalance))}
                </p>
              </AppCard>
              <AppCard>
                <p className="text-sm text-gray-500">Entrees du jour</p>
                <p className="mt-1 text-2xl font-bold text-primary-600">
                  +{formatAmount(Number(cr.totalEntries))}
                </p>
              </AppCard>
              <AppCard>
                <p className="text-sm text-gray-500">Sorties du jour</p>
                <p className="mt-1 text-2xl font-bold text-red-600">
                  -{formatAmount(Number(cr.totalExits))}
                </p>
              </AppCard>
              <AppCard>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">Solde actuel</p>
                  <AppBadge variant={cr.isClosed ? 'default' : 'success'}>
                    {cr.isClosed ? 'Cloturee' : 'Ouverte'}
                  </AppBadge>
                </div>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {formatAmount(Number(cr.currentBalance))}
                </p>
              </AppCard>
            </div>
            {breakdown?.data && (
              <AppCard>
                <h3 className="mb-3 text-base font-semibold text-gray-900">
                  Entrees par route de transit (30 derniers jours)
                </h3>
                {breakdown.data.entriesByRoute.length === 0 ? (
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
                      {breakdown.data.entriesByRoute.map((r: any) => (
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
            )}
          </>
        ) : null}

        <ConfirmDialog
          open={showClose}
          onClose={() => setShowClose(false)}
          onConfirm={() => closeMutation.mutate()}
          title="Cloturer la caisse"
          message="Cette action va cloturer la caisse du jour. Le solde actuel sera enregistre comme solde de cloture. Cette action est irreversible."
          confirmLabel="Cloturer"
          loading={closeMutation.isPending}
        />
      </div>
    </PageTransition>
  );
}
