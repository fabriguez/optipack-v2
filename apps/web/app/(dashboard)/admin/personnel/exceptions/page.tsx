'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppSelect } from '@/components/ui/AppSelect';
import { Can } from '@/lib/components/Can';
import {
  useUserPermissions,
  usePermissionsCatalog,
  useSetOverride,
  useRemoveOverride,
} from '@/lib/hooks/useHR';
import { apiClient } from '@/lib/api/client';
import { Plus, Trash2, ShieldCheck, ShieldX } from 'lucide-react';
import type { PermissionDTO } from '@/lib/api/hr';

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

interface EmployeeSummary {
  id: string;
  userId: string;
  fullName: string;
  position?: string | null;
}

interface Override {
  id: string;
  permissionKey: string;
  granted: boolean;
  reason?: string | null;
  permission?: { label: string } | null;
}

export default function ExceptionsPage() {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [addKey, setAddKey] = useState<string>('');
  const [addGranted, setAddGranted] = useState<boolean>(true);
  const [addReason, setAddReason] = useState<string>('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Load all employees (admin-only page, manageable volume).
  // limit plafonne a 200 par paginationSchema (common.schema.ts) : au-dela,
  // validate() rejette la requete -> 4xx -> select vide. On reste donc a 200.
  const { data: employeesResp, isLoading: empLoading } = useQuery({
    queryKey: ['employees', 'all'],
    queryFn: () => apiClient.get('/employees', { params: { limit: 200 } }).then((r) => r.data),
  });
  const employees: EmployeeSummary[] = useMemo(
    () => ((employeesResp as any)?.data ?? []) as EmployeeSummary[],
    [employeesResp],
  );

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === selectedEmployeeId),
    [employees, selectedEmployeeId],
  );

  const { data: userPermsResp, isLoading: permsLoading } = useUserPermissions(
    selectedEmployee?.userId,
  );
  const { data: catalogResp } = usePermissionsCatalog();
  const catalog: PermissionDTO[] = useMemo(() => (catalogResp as any)?.data ?? [], [catalogResp]);

  const permsData = (userPermsResp as any)?.data;
  const overrides: Override[] = permsData?.overrides ?? [];
  const positionName: string | null = permsData?.position?.name ?? null;

  const setOverride = useSetOverride();
  const removeOverride = useRemoveOverride();

  const employeeOptions = useMemo(
    () =>
      employees.map((e) => ({
        value: e.id,
        label: `${e.fullName}${e.position ? ` — ${e.position}` : ''}`,
      })),
    [employees],
  );

  const catalogOptions = useMemo(
    () =>
      catalog
        .filter((p) => p.key !== 'permission.manage')
        .map((p) => ({ value: p.key, label: `${p.key} — ${p.label}` })),
    [catalog],
  );

  function handleAdd() {
    if (!selectedEmployee?.userId || !addKey) return;
    setOverride.mutate(
      { userId: selectedEmployee.userId, permissionKey: addKey, granted: addGranted, reason: addReason || undefined },
      {
        onSuccess: () => {
          setAddKey('');
          setAddReason('');
          setShowAddForm(false);
        },
      },
    );
  }

  function handleRemove(key: string) {
    if (!selectedEmployee?.userId) return;
    removeOverride.mutate({ userId: selectedEmployee.userId, permissionKey: key });
  }

  return (
    <Can permission="permission.manage" fallback={<p className="text-sm text-gray-500">Acces restreint.</p>}>
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Exceptions par employe</h2>
          <p className="text-sm text-gray-500">
            Accordez ou retirez des permissions individuelles en dehors du poste.
            Ces exceptions s&apos;appliquent uniquement a cet employe.
          </p>
        </div>

        <AppCard>
          <div className="p-4 space-y-4">
            <AppSelect
              label="Employe"
              value={selectedEmployeeId}
              onChange={(e) => { setSelectedEmployeeId(e.target.value); setShowAddForm(false); }}
              options={[{ value: '', label: empLoading ? 'Chargement...' : 'Selectionner un employe' }, ...employeeOptions]}
            />

            {selectedEmployee && permsLoading && (
              <p className="text-sm text-gray-400">Chargement des permissions...</p>
            )}

            {selectedEmployee && !permsLoading && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Poste :</span>
                  <AppBadge variant="default">{positionName ?? 'Aucun'}</AppBadge>
                </div>

                {/* Overrides existants */}
                <div>
                  <p className="mb-2 text-sm font-medium text-gray-700">
                    Exceptions actives ({overrides.length})
                  </p>
                  {overrides.length === 0 && (
                    <p className="text-sm text-gray-400">Aucune exception pour cet employe.</p>
                  )}
                  <ul className="space-y-2">
                    {overrides.map((ov) => (
                      <li key={ov.permissionKey} className="flex items-center justify-between rounded-lg border px-3 py-2">
                        <div className="flex items-center gap-2">
                          {ov.granted
                            ? <ShieldCheck className="h-4 w-4 text-green-600" />
                            : <ShieldX className="h-4 w-4 text-red-500" />}
                          <div>
                            <p className="text-sm font-medium text-gray-800">{ov.permissionKey}</p>
                            {ov.permission?.label && (
                              <p className="text-xs text-gray-500">{ov.permission.label}</p>
                            )}
                            {ov.reason && <p className="text-xs text-gray-400">Raison : {ov.reason}</p>}
                          </div>
                        </div>
                        <AppBadge variant={ov.granted ? 'success' : 'error'}>
                          {ov.granted ? 'Accordee' : 'Retiree'}
                        </AppBadge>
                        <AppButton
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemove(ov.permissionKey)}
                          disabled={removeOverride.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </AppButton>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Formulaire ajout */}
                {!showAddForm ? (
                  <AppButton size="sm" variant="outline" onClick={() => setShowAddForm(true)}>
                    <Plus className="mr-1 h-4 w-4" /> Ajouter une exception
                  </AppButton>
                ) : (
                  <div className="space-y-3 rounded-lg border border-dashed p-4">
                    <AppSelect
                      label="Permission"
                      value={addKey}
                      onChange={(e) => setAddKey(e.target.value)}
                      options={[{ value: '', label: 'Selectionner une permission' }, ...catalogOptions]}
                    />
                    <AppSelect
                      label="Type"
                      value={addGranted ? 'grant' : 'deny'}
                      onChange={(e) => setAddGranted(e.target.value === 'grant')}
                      options={[
                        { value: 'grant', label: 'Accorder (GRANT)' },
                        { value: 'deny', label: 'Retirer (DENY)' },
                      ]}
                    />
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Raison (optionnel)
                      </label>
                      <input
                        type="text"
                        className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none"
                        placeholder="Ex : remplacement temporaire"
                        value={addReason}
                        onChange={(e) => setAddReason(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <AppButton size="sm" onClick={handleAdd} disabled={!addKey || setOverride.isPending}>
                        Enregistrer
                      </AppButton>
                      <AppButton size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>
                        Annuler
                      </AppButton>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </AppCard>
      </div>
    </Can>
  );
}
