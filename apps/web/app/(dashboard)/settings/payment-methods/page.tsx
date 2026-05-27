'use client';

import { useEffect, useState } from 'react';
import { Plus, Edit, Trash2, Power, PowerOff, Lock } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  usePaymentMethods,
  useCreatePaymentMethod,
  useUpdatePaymentMethod,
  useDeletePaymentMethod,
  type PaymentMethodItem,
} from '@/lib/hooks/usePaymentMethods';
import { toast } from 'sonner';

export default function PaymentMethodsPage() {
  const { data, isLoading } = usePaymentMethods();
  const methods: PaymentMethodItem[] = data?.data ?? [];
  const [editTarget, setEditTarget] = useState<PaymentMethodItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<PaymentMethodItem | null>(null);

  const updateMutation = useUpdatePaymentMethod();
  const deleteMutation = useDeletePaymentMethod();

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Methodes de paiement</h1>
            <p className="text-sm text-gray-500 mt-1">
              Configurez les modes de paiement disponibles dans l&apos;application. Les methodes
              systeme sont non supprimables. Une methode utilisee par un paiement ne peut pas
              etre supprimee, seulement desactivee.
            </p>
          </div>
          <AppButton onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Nouvelle methode
          </AppButton>
        </div>

        <AppCard padding="sm">
          {isLoading ? (
            <p className="p-4 text-sm text-gray-400">Chargement...</p>
          ) : methods.length === 0 ? (
            <p className="p-4 text-sm text-gray-400">Aucune methode configuree</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="p-3 text-left">Libelle</th>
                    <th className="p-3 text-left">Code</th>
                    <th className="p-3 text-left">Statut</th>
                    <th className="p-3 text-left">Type</th>
                    <th className="p-3 text-right">Ordre</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {methods.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="p-3 font-medium text-gray-900">{m.label}</td>
                      <td className="p-3 font-mono text-xs text-gray-700">{m.code}</td>
                      <td className="p-3">
                        <AppBadge variant={m.isActive ? 'success' : 'default'}>
                          {m.isActive ? 'Actif' : 'Inactif'}
                        </AppBadge>
                      </td>
                      <td className="p-3">
                        {m.isSystem ? (
                          <AppBadge variant="info">
                            <Lock className="mr-1 h-3 w-3" />
                            Systeme
                          </AppBadge>
                        ) : (
                          <AppBadge variant="default">Personnalise</AppBadge>
                        )}
                      </td>
                      <td className="p-3 text-right text-gray-500">{m.sortOrder}</td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-primary-700"
                            title="Modifier"
                            onClick={() => setEditTarget(m)}
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-amber-600"
                            title={m.isActive ? 'Desactiver' : 'Reactiver'}
                            onClick={() =>
                              updateMutation.mutate({ id: m.id, data: { label: m.label, isActive: !m.isActive } })
                            }
                          >
                            {m.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                          </button>
                          {!m.isSystem && (
                            <button
                              type="button"
                              className="rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                              title="Supprimer"
                              onClick={() => setConfirmDelete(m)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AppCard>
      </div>

      <MethodFormDialog
        open={showCreate || !!editTarget}
        method={editTarget}
        onClose={() => { setShowCreate(false); setEditTarget(null); }}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await deleteMutation.mutateAsync(confirmDelete.id);
          setConfirmDelete(null);
        }}
        title="Supprimer la methode de paiement"
        message={`La methode "${confirmDelete?.label}" sera supprimee definitivement. Si elle a deja ete utilisee par un paiement, la suppression sera refusee (desactiver a la place).`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
      />
    </PageTransition>
  );
}

function MethodFormDialog({ open, method, onClose }: { open: boolean; method: PaymentMethodItem | null; onClose: () => void }) {
  const isEdit = !!method;
  const createMutation = useCreatePaymentMethod();
  const updateMutation = useUpdatePaymentMethod();
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [sortOrder, setSortOrder] = useState<number>(100);

  useEffect(() => {
    if (!open) return;
    if (method) {
      setCode(method.code);
      setLabel(method.label);
      setSortOrder(method.sortOrder);
    } else {
      setCode('');
      setLabel('');
      setSortOrder(100);
    }
  }, [open, method]);

  const handleSubmit = () => {
    if (!label.trim()) { toast.error('Libelle requis'); return; }
    if (isEdit && method) {
      updateMutation.mutate(
        { id: method.id, data: { label: label.trim(), sortOrder } },
        { onSuccess: () => onClose() },
      );
    } else {
      const c = code.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
      if (!c || c.length < 2) { toast.error('Code invalide'); return; }
      createMutation.mutate(
        { code: c, label: label.trim(), sortOrder },
        { onSuccess: () => { setCode(''); setLabel(''); setSortOrder(100); onClose(); } },
      );
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={isEdit ? `Modifier ${method?.label}` : 'Nouvelle methode de paiement'}
      size="sm"
      footer={
        <>
          <AppButton variant="ghost" onClick={onClose}>Annuler</AppButton>
          <AppButton
            type="button"
            onClick={handleSubmit}
            loading={createMutation.isPending || updateMutation.isPending}
          >
            {isEdit ? 'Enregistrer' : 'Creer'}
          </AppButton>
        </>
      }
    >
      <div className="space-y-3">
        <AppInput
          label="Libelle"
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            if (!isEdit && !code) {
              setCode(e.target.value.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '').slice(0, 40));
            }
          }}
          placeholder="MTN Mobile Money"
          required
        />
        <AppInput
          label="Code interne"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
          placeholder="MTN_MOMO"
          disabled={isEdit}
          required
        />
        {isEdit && (
          <p className="text-[11px] text-gray-500">
            Le code ne peut pas etre modifie apres creation (il est referencé par les paiements).
          </p>
        )}
        <AppInput
          label="Ordre d'affichage"
          type="number"
          value={String(sortOrder)}
          onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
        />
      </div>
    </AppDialog>
  );
}
