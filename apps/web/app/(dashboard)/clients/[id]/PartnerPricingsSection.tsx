'use client';

import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Plus, Trash2, Tag } from 'lucide-react';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppBadge } from '@/components/ui/AppBadge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { clientsApi, type PartnerPricing } from '@/lib/api/clients';
import { searchers } from '@/lib/api/searchers';
import { toast } from 'sonner';
import { formatAmount } from '@transitsoftservices/shared';

interface Props {
  clientId: string;
  isPartner: boolean;
}

export function PartnerPricingsSection({ clientId, isPartner }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [pricePerKg, setPricePerKg] = useState('');
  const [pricePerVolume, setPricePerVolume] = useState('');
  const [toDelete, setToDelete] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['clients', clientId, 'pricings'],
    queryFn: () => clientsApi.listPricings(clientId),
    enabled: !!clientId,
  });

  const createMut = useMutation({
    mutationFn: (payload: { transitRouteId?: string | null; pricePerKg: number; pricePerVolume?: number }) =>
      clientsApi.createPricing(clientId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients', clientId, 'pricings'] });
      toast.success('Tarification enregistree');
      setOpen(false);
      setRouteId(null);
      setPricePerKg('');
      setPricePerVolume('');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur lors de la creation'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => clientsApi.deletePricing(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients', clientId, 'pricings'] });
      toast.success('Tarification supprimee');
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  });

  const items: PartnerPricing[] = data?.data || [];

  if (!isPartner) {
    return (
      <AppCard>
        <AppCardHeader title="Tarification partenaire" />
        <div className="flex items-center gap-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
          <Tag className="h-4 w-4 text-gray-400" />
          <span>Pour activer la tarification dediee, marquez le client comme <strong>Partenaire</strong> dans son profil.</span>
        </div>
      </AppCard>
    );
  }

  return (
    <AppCard>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Tarification partenaire</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Prix specifiques pour ce partenaire. Une regle par route ou globale (sans route).
          </p>
        </div>
        <AppButton size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Ajouter
        </AppButton>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Chargement...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">Aucune tarification dediee. La tarification standard sera utilisee.</p>
      ) : (
        <div className="space-y-2">
          {items.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
                  <Tag className="h-4 w-4 text-primary-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {p.transitRoute?.name ?? 'Toutes routes'}
                    {!p.isActive && <AppBadge variant="default" className="ml-2 text-[10px]">Inactif</AppBadge>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatAmount(Number(p.pricePerKg))}/kg
                    {Number(p.pricePerVolume) > 0 && ` - ${formatAmount(Number(p.pricePerVolume))}/m3`}
                    {p.transitRoute?.type && ` - ${p.transitRoute.type}`}
                  </p>
                </div>
              </div>
              <button onClick={() => setToDelete(p.id)} className="rounded-lg p-1.5 hover:bg-red-50" aria-label="Supprimer">
                <Trash2 className="h-4 w-4 text-red-600" />
              </button>
            </div>
          ))}
        </div>
      )}

      <AppDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Nouvelle tarification"
        size="md"
        footer={
          <>
            <AppButton variant="ghost" onClick={() => setOpen(false)}>Annuler</AppButton>
            <AppButton
              onClick={() => {
                if (!pricePerKg) {
                  toast.error('Prix par kg requis');
                  return;
                }
                createMut.mutate({
                  transitRouteId: routeId,
                  pricePerKg: Number(pricePerKg),
                  pricePerVolume: pricePerVolume ? Number(pricePerVolume) : undefined,
                });
              }}
              loading={createMut.isPending}
            >
              Enregistrer
            </AppButton>
          </>
        }
      >
        <div className="space-y-4">
          <AppSearchSelect
            label="Route de transit"
            value={routeId}
            onChange={setRouteId}
            search={searchers.transitRoutes}
            placeholder="Toutes routes (laisser vide)"
          />
          <p className="text-xs text-gray-500">Si aucune route n&apos;est selectionnee, ce prix s&apos;applique a toutes les routes (a defaut d&apos;une regle specifique).</p>

          <div className="grid grid-cols-2 gap-3">
            <AppInput
              label="Prix / kg (XAF)"
              type="number"
              step="0.01"
              value={pricePerKg}
              onChange={(e) => setPricePerKg(e.target.value)}
            />
            <AppInput
              label="Prix / m3 (XAF)"
              type="number"
              step="0.01"
              value={pricePerVolume}
              onChange={(e) => setPricePerVolume(e.target.value)}
            />
          </div>

        </div>
      </AppDialog>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) deleteMut.mutate(toDelete);
          setToDelete(null);
        }}
        title="Supprimer la tarification"
        message="Cette tarification dediee sera retiree. Le prix standard sera utilise par defaut."
        confirmLabel="Supprimer"
        variant="destructive"
      />
    </AppCard>
  );
}
