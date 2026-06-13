import { useMemo, useState, useEffect } from 'react';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppCheckbox } from '@/components/ui/AppCheckbox';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppBadge } from '@/components/ui/AppBadge';
import { Can } from '@/lib/components/Can';
import {
  usePositions,
  usePermissionsCatalog,
  useSetPositionPermissions,
} from '@/lib/hooks/useHR';
import type { PermissionDTO, PositionDTO } from '@/lib/api/hr';
import { Save, Lock } from 'lucide-react';

const CATEGORY_LABELS: Record<string, string> = {
  personnel: 'Personnel',
  clients: 'Clients',
  kyc: 'Verification KYC',
  colis: 'Colis',
  magasin: 'Magasins',
  conteneur: 'Conteneurs',
  transport: 'Transporteurs & routes',
  facturation: 'Factures',
  paiement: 'Paiements',
  caisse: 'Caisse',
  decaissement: 'Decaissements',
  transfert: 'Transferts de fonds',
  comptabilite: 'Comptabilite',
  depense: 'Depenses & charges',
  dette: 'Dettes',
  finance: 'Finance',
  agence: 'Agence',
  fidelite: 'Fidelite',
  penalite: 'Penalites',
  notification: 'Notifications',
  support: 'Support',
  rapport: 'Rapports & tableau de bord',
  admin: 'Administration',
};

export default function AdminPersonnelPermissionsPage() {
  const { data: positionsResp } = usePositions();
  const { data: catalogResp, isLoading: catLoading } = usePermissionsCatalog();
  const positions: PositionDTO[] = (positionsResp as any)?.data ?? [];
  const catalog: PermissionDTO[] = (catalogResp as any)?.data ?? [];

  const [selectedPositionId, setSelectedPositionId] = useState<string>('');
  useEffect(() => {
    if (!selectedPositionId && positions.length > 0) {
      setSelectedPositionId(positions[0].id);
    }
  }, [positions, selectedPositionId]);

  const selected = useMemo(
    () => positions.find((p) => p.id === selectedPositionId),
    [positions, selectedPositionId],
  );

  // Etat local des cases cochees pour le poste selectionne (initialise depuis API).
  const [checked, setChecked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!selected) return;
    const keys = new Set<string>(
      (selected.permissions ?? []).map((pp) => pp.permission.key),
    );
    setChecked(keys);
  }, [selected]);

  const grouped = useMemo(() => {
    const map = new Map<string, PermissionDTO[]>();
    for (const p of catalog) {
      if (!map.has(p.category)) map.set(p.category, []);
      map.get(p.category)!.push(p);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [catalog]);

  const setMut = useSetPositionPermissions();

  const toggle = (key: string) => {
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleCategory = (cat: string, items: PermissionDTO[], on: boolean) => {
    setChecked((s) => {
      const next = new Set(s);
      for (const p of items) {
        if (on) next.add(p.key);
        else next.delete(p.key);
      }
      return next;
    });
  };

  const onSave = () => {
    if (!selected) return;
    setMut.mutate({ id: selected.id, keys: Array.from(checked) });
  };

  // Comparaison avec etat serveur pour signaler les modifs en attente.
  const initialKeys = new Set((selected?.permissions ?? []).map((pp) => pp.permission.key));
  const dirty =
    checked.size !== initialKeys.size ||
    Array.from(checked).some((k) => !initialKeys.has(k));

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Selectionnez un poste pour voir et editer ses permissions. Les changements prennent effet a la prochaine
        connexion (ou refresh de session) des utilisateurs concernes.
      </p>

      <AppCard>
        <div className="border-b border-gray-200 p-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-sm w-full">
            <AppSelect
              label="Poste"
              placeholder="Selectionner un poste"
              options={positions.map((p) => ({
                value: p.id,
                label: p.isSystem ? `${p.name} (systeme)` : p.name,
              }))}
              value={selectedPositionId}
              onValueChange={setSelectedPositionId}
            />
            {selected && (
              <p className="mt-2 text-xs text-gray-500">
                {selected.description ?? 'Aucune description.'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {selected?.isSystem && (
              <AppBadge variant="info">
                <Lock className="h-3 w-3 mr-1 inline" />
                Poste systeme
              </AppBadge>
            )}
            {dirty && <AppBadge variant="warning">Modifications non enregistrees</AppBadge>}
            <Can permission="permission.manage">
              <AppButton onClick={onSave} disabled={!selected || !dirty} loading={setMut.isPending}>
                <Save className="h-4 w-4" />
                Enregistrer
              </AppButton>
            </Can>
          </div>
        </div>

        {catLoading && <div className="p-8 text-center text-gray-500">Chargement du catalogue...</div>}
        {!catLoading && (
          <div className="divide-y divide-gray-100">
            {grouped.map(([category, items]) => {
              const allChecked = items.every((p) => checked.has(p.key));
              const someChecked = items.some((p) => checked.has(p.key));
              return (
                <div key={category} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700">
                      {CATEGORY_LABELS[category] ?? category}
                      <span className="ml-2 text-xs text-gray-400 normal-case font-normal">
                        ({items.filter((p) => checked.has(p.key)).length}/{items.length})
                      </span>
                    </h3>
                    <Can permission="permission.manage">
                      <button
                        onClick={() => toggleCategory(category, items, !allChecked)}
                        className="text-xs text-primary-700 hover:underline"
                      >
                        {allChecked ? 'Tout decocher' : someChecked ? 'Tout cocher' : 'Tout cocher'}
                      </button>
                    </Can>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-start gap-2 rounded-md border border-gray-200 p-2.5 hover:border-primary-300 hover:bg-primary-50/30 cursor-pointer"
                      >
                        <AppCheckbox
                          checked={checked.has(p.key)}
                          onCheckedChange={() => toggle(p.key)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900">{p.label}</div>
                          <div className="text-[11px] text-gray-500 font-mono truncate" title={p.key}>
                            {p.key}
                          </div>
                          {p.description && (
                            <div className="text-xs text-gray-500 mt-0.5">{p.description}</div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AppCard>
    </div>
  );
}
