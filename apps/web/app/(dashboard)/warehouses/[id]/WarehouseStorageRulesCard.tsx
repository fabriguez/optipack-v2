'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { searchers } from '@/lib/api/searchers';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { AppSwitch } from '@/components/ui/AppSwitch';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { formatAmount } from '@transitsoftservices/shared';
import { toast } from 'sonner';

type TransitType = 'AIR' | 'SEA' | 'LAND';

interface Rule {
  id: string;
  transitType: TransitType;
  transitRouteId: string | null;
  transitRoute: { id: string; name: string; type: TransitType } | null;
  minWeight: string | number | null;
  maxWeight: string | number | null;
  minVolume: string | number | null;
  maxVolume: string | number | null;
  freeDays: number;
  dailyRate: string | number;
  priority: number;
  isActive: boolean;
}

const TYPE_LABELS: Record<TransitType, string> = {
  AIR: 'Aerien',
  SEA: 'Maritime',
  LAND: 'Terrestre',
};

function rangeLabel(min: any, max: any, unit: string): string {
  const a = min != null ? Number(min) : null;
  const b = max != null ? Number(max) : null;
  if (a == null && b == null) return '-';
  if (a != null && b != null) return `${a}–${b} ${unit}`;
  if (a != null) return `>= ${a} ${unit}`;
  return `<= ${b} ${unit}`;
}

export function WarehouseStorageRulesCard({ warehouseId }: { warehouseId: string }) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Rule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Rule | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['warehouses', warehouseId, 'storage-rules'],
    queryFn: () => apiClient.get(`/warehouses/${warehouseId}/storage-rules`).then((r) => r.data),
  });

  const rules: Rule[] = data?.data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ['warehouses', warehouseId, 'storage-rules'] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/warehouses/storage-rules/${id}`),
    onSuccess: () => {
      toast.success('Regle supprimee');
      invalidate();
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Echec suppression'),
  });

  return (
    <AppCard>
      <div className="flex items-start justify-between gap-3">
        <AppCardHeader
          title="Frais de magasinage"
          description="Regles par type de transit, route, intervalle masse-volume. Tarif journalier x (jours - gratuits)."
        />
        <AppButton size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Nouvelle regle
        </AppButton>
      </div>

      {isLoading ? (
        <p className="mt-3 text-sm text-gray-400">Chargement...</p>
      ) : rules.length === 0 ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Aucune regle configuree. Sans regle, le calcul retombe sur l&apos;ancien fallback magasin (jours gratuits / tarif journalier global). Si ces deux valeurs sont a 0, pas de frais.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rules.map((r) => (
            <li key={r.id} className="rounded-xl border border-gray-100 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <AppBadge variant={r.isActive ? 'success' : 'default'}>
                      {TYPE_LABELS[r.transitType]}
                    </AppBadge>
                    {r.transitRoute && (
                      <AppBadge variant="info">Route: {r.transitRoute.name}</AppBadge>
                    )}
                    {!r.isActive && <AppBadge variant="warning">Inactive</AppBadge>}
                    <span className="text-xs text-gray-400">Priorite {r.priority}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-600">
                    Masse: {rangeLabel(r.minWeight, r.maxWeight, 'kg')} - Volume: {rangeLabel(r.minVolume, r.maxVolume, 'm3')}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {formatAmount(Number(r.dailyRate))}/jour apres {r.freeDays} jour(s) gratuits
                  </p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditTarget(r)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Modifier">
                    <Edit className="h-4 w-4" />
                  </button>
                  <button onClick={() => setDeleteTarget(r)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" aria-label="Supprimer">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <RuleDialog
        open={createOpen || !!editTarget}
        onClose={() => { setCreateOpen(false); setEditTarget(null); }}
        warehouseId={warehouseId}
        rule={editTarget}
        onSaved={() => { invalidate(); setCreateOpen(false); setEditTarget(null); }}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Supprimer la regle"
        message={`Supprimer cette regle ${deleteTarget ? TYPE_LABELS[deleteTarget.transitType] : ''} ?`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
      />
    </AppCard>
  );
}

function RuleDialog({
  open, onClose, warehouseId, rule, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  warehouseId: string;
  rule: Rule | null;
  onSaved: () => void;
}) {
  const isEdit = !!rule;
  const [transitType, setTransitType] = useState<TransitType>(rule?.transitType ?? 'AIR');
  const [transitRouteId, setTransitRouteId] = useState<string>(rule?.transitRouteId ?? '');
  const [minWeight, setMinWeight] = useState<string>(rule?.minWeight != null ? String(rule.minWeight) : '');
  const [maxWeight, setMaxWeight] = useState<string>(rule?.maxWeight != null ? String(rule.maxWeight) : '');
  const [minVolume, setMinVolume] = useState<string>(rule?.minVolume != null ? String(rule.minVolume) : '');
  const [maxVolume, setMaxVolume] = useState<string>(rule?.maxVolume != null ? String(rule.maxVolume) : '');
  const [freeDays, setFreeDays] = useState<string>(String(rule?.freeDays ?? 7));
  const [dailyRate, setDailyRate] = useState<string>(rule?.dailyRate != null ? String(rule.dailyRate) : '');
  const [priority, setPriority] = useState<string>(String(rule?.priority ?? 0));
  const [isActive, setIsActive] = useState<boolean>(rule?.isActive ?? true);

  const mutation = useMutation({
    mutationFn: () => {
      const num = (v: string) => (v === '' ? null : Number(v));
      const body: any = {
        transitType,
        transitRouteId: transitRouteId || null,
        minWeight: num(minWeight),
        maxWeight: num(maxWeight),
        minVolume: num(minVolume),
        maxVolume: num(maxVolume),
        freeDays: Number(freeDays) || 0,
        dailyRate: Number(dailyRate) || 0,
        priority: Number(priority) || 0,
        isActive,
      };
      return isEdit
        ? apiClient.patch(`/warehouses/storage-rules/${rule!.id}`, body)
        : apiClient.post(`/warehouses/${warehouseId}/storage-rules`, body);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Regle mise a jour' : 'Regle creee');
      onSaved();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Echec'),
  });

  const showWeight = transitType === 'AIR' || transitType === 'LAND';
  const showVolume = transitType === 'SEA' || transitType === 'LAND';

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier la regle' : 'Nouvelle regle frais magasinage'}
      size="lg"
      footer={
        <>
          <AppButton variant="ghost" onClick={onClose}>Annuler</AppButton>
          <AppButton onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!dailyRate}>
            {isEdit ? 'Enregistrer' : 'Creer'}
          </AppButton>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AppSelect
            label="Type de transit"
            value={transitType}
            onValueChange={(v) => setTransitType(v as TransitType)}
            options={[
              { value: 'AIR', label: 'Aerien (masse)' },
              { value: 'SEA', label: 'Maritime (volume)' },
              { value: 'LAND', label: 'Terrestre (masse + volume)' },
            ]}
          />
          <AppSearchSelect
            label="Route (optionnel)"
            value={transitRouteId || null}
            onChange={(v) => setTransitRouteId(v ?? '')}
            search={searchers.transitRoutes}
            selectedOption={rule?.transitRoute ? { value: rule.transitRoute.id, label: rule.transitRoute.name, sublabel: rule.transitRoute.type } : undefined}
            placeholder="Toutes routes du type"
          />
        </div>

        {showWeight && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AppInput
              label="Masse min (kg)"
              type="number"
              min="0"
              step="0.01"
              value={minWeight}
              onChange={(e) => setMinWeight(e.target.value)}
              placeholder="Vide = pas de borne min"
            />
            <AppInput
              label="Masse max (kg)"
              type="number"
              min="0"
              step="0.01"
              value={maxWeight}
              onChange={(e) => setMaxWeight(e.target.value)}
              placeholder="Vide = pas de borne max"
            />
          </div>
        )}

        {showVolume && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AppInput
              label="Volume min (m3)"
              type="number"
              min="0"
              step="0.001"
              value={minVolume}
              onChange={(e) => setMinVolume(e.target.value)}
              placeholder="Vide = pas de borne min"
            />
            <AppInput
              label="Volume max (m3)"
              type="number"
              min="0"
              step="0.001"
              value={maxVolume}
              onChange={(e) => setMaxVolume(e.target.value)}
              placeholder="Vide = pas de borne max"
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <AppInput
            label="Jours gratuits"
            type="number"
            min="0"
            step="1"
            value={freeDays}
            onChange={(e) => setFreeDays(e.target.value)}
          />
          <AppInput
            label="Tarif journalier"
            type="number"
            min="0"
            step="100"
            value={dailyRate}
            onChange={(e) => setDailyRate(e.target.value)}
            required
          />
          <AppInput
            label="Priorite"
            type="number"
            step="1"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <AppSwitch checked={isActive} onCheckedChange={setIsActive} />
          <span className="text-sm text-gray-700">Regle active</span>
        </div>
      </div>
    </AppDialog>
  );
}
