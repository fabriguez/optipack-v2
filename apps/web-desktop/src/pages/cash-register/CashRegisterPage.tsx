import { useState } from 'react';
import { Vault, Lock } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { CardSkeleton } from '@/components/ui/AppSkeleton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Can } from '@/lib/components/Can';
import { formatAmount, formatDateTime } from '@transitsoftservices/shared';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cashRegisterApi } from '@/lib/api/finance';
import { apiClient } from '@/lib/api/client';
import { useAgencies } from '@/lib/hooks/useAgencies';
import { toast } from 'sonner';

export default function CashRegisterPage() {
  const [selectedAgency, setSelectedAgency] = useState<string>('');
  const [showClose, setShowClose] = useState(false);
  const [pickedDate, setPickedDate] = useState<string>(''); // YYYY-MM-DD
  const [viewAll, setViewAll] = useState<boolean>(false);
  const qc = useQueryClient();

  const { data: agencies } = useAgencies({ limit: 100 });
  const agencyId = selectedAgency || agencies?.data?.[0]?.id || '';

  const { data: register, isLoading } = useQuery({
    queryKey: ['cash-register', agencyId, pickedDate],
    queryFn: () =>
      apiClient
        .get(`/cash-registers/${agencyId}`, { params: pickedDate ? { date: pickedDate } : {} })
        .then((r) => r.data),
    enabled: !!agencyId && !viewAll,
  });

  const { data: breakdown } = useQuery({
    queryKey: ['cash-register', agencyId, 'breakdown'],
    queryFn: () => apiClient.get(`/agencies/${agencyId}/breakdown`).then((r) => r.data),
    enabled: !!agencyId,
  });

  const [movementsPage, setMovementsPage] = useState(1);
  const movementsLimit = 100;
  const { data: movementsData, isLoading: movementsLoading } = useQuery({
    queryKey: ['cash-register', agencyId, 'movements', movementsPage, movementsLimit, pickedDate, viewAll],
    queryFn: () =>
      apiClient
        .get(`/cash-registers/${agencyId}/movements`, {
          params: {
            page: movementsPage,
            limit: movementsLimit,
            ...(viewAll ? { all: 'true' } : pickedDate ? { date: pickedDate } : {}),
          },
        })
        .then((r) => r.data),
    enabled: !!agencyId,
  });
  const movements: any[] = movementsData?.data?.movements ?? [];
  const movSummary = movementsData?.data?.summary;
  const movMeta = movementsData?.data?.meta as { page: number; limit: number; total: number; totalPages: number } | undefined;

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
            <Can permission="cashregister.close">
              <AppButton variant="outline" onClick={() => setShowClose(true)}>
                <Lock className="h-4 w-4" />
                Cloturer la caisse
              </AppButton>
            </Can>
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

        {/* Date picker + toggle "tous mouvements" */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2">
          <label className="text-xs font-medium text-gray-600">Date :</label>
          <input
            type="date"
            value={pickedDate}
            onChange={(e) => { setPickedDate(e.target.value); setViewAll(false); setMovementsPage(1); }}
            disabled={viewAll}
            className="rounded-lg border border-gray-200 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none disabled:opacity-50"
          />
          {pickedDate && !viewAll && (
            <button
              type="button"
              onClick={() => { setPickedDate(''); setMovementsPage(1); }}
              className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
            >
              Aujourd&apos;hui
            </button>
          )}
          <span className="ml-2 text-xs text-gray-300">|</span>
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
            <input
              type="checkbox"
              checked={viewAll}
              onChange={(e) => { setViewAll(e.target.checked); setMovementsPage(1); }}
              className="h-3.5 w-3.5"
            />
            Voir TOUS les mouvements (toutes dates confondues)
          </label>
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
            {/* Historique detaille entrees / sorties de la caisse */}
            <AppCard>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-gray-900">
                  Historique des mouvements ({movMeta?.total ?? movements.length})
                </h3>
                {movSummary && (
                  <div className="flex gap-3 text-sm">
                    <span className="text-green-600">Entrees : +{formatAmount(movSummary.totalIn)}</span>
                    <span className="text-red-600">Sorties : -{formatAmount(movSummary.totalOut)}</span>
                  </div>
                )}
              </div>
              {movementsLoading ? (
                <p className="text-sm text-gray-400">Chargement...</p>
              ) : movements.length === 0 ? (
                <p className="text-sm text-gray-400">Aucun mouvement sur cette caisse.</p>
              ) : (
                <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500">
                        <th className="pb-2">Type</th>
                        <th className="pb-2">Operation</th>
                        <th className="pb-2">Reference</th>
                        <th className="pb-2">Par</th>
                        <th className="pb-2">Date</th>
                        <th className="pb-2 text-right">Montant</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {movements.map((m: any) => (
                        <tr key={m.id} className={m.voided ? 'opacity-50' : ''}>
                          <td className="py-2">
                            {m.direction === 'IN' ? (
                              <span className="inline-flex items-center gap-1 text-green-600">
                                <ArrowDownLeft className="h-3.5 w-3.5" /> Entree
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-red-600">
                                <ArrowUpRight className="h-3.5 w-3.5" /> Sortie
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-gray-800">
                            {m.label}
                            {m.voided && <span className="ml-1 text-[10px] text-red-500">(annule)</span>}
                          </td>
                          <td className="py-2 font-mono text-xs text-gray-500">{m.reference || '-'}</td>
                          <td className="py-2 text-gray-600">{m.userName || '-'}</td>
                          <td className="py-2 text-xs text-gray-500">{formatDateTime(m.date)}</td>
                          <td className={`py-2 text-right font-semibold ${m.direction === 'IN' ? 'text-green-600' : 'text-red-600'}`}>
                            {m.direction === 'IN' ? '+' : '-'}{formatAmount(Number(m.amount))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {movMeta && movMeta.totalPages > 1 && (
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs text-gray-600">
                    <span>
                      Page {movMeta.page} / {movMeta.totalPages} - {movMeta.total} mouvement(s)
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setMovementsPage((p) => Math.max(1, p - 1))}
                        disabled={movMeta.page <= 1}
                        className="rounded-md border border-gray-200 px-2 py-1 hover:bg-gray-50 disabled:opacity-40"
                      >
                        Precedent
                      </button>
                      <button
                        type="button"
                        onClick={() => setMovementsPage((p) => Math.min(movMeta.totalPages, p + 1))}
                        disabled={movMeta.page >= movMeta.totalPages}
                        className="rounded-md border border-gray-200 px-2 py-1 hover:bg-gray-50 disabled:opacity-40"
                      >
                        Suivant
                      </button>
                    </div>
                  </div>
                )}
                </>
              )}
            </AppCard>
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
