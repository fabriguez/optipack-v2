import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppTextarea } from '@/components/ui/AppTextarea';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppAlertDialog } from '@/components/ui/AppAlertDialog';
import { Can } from '@/lib/components/Can';
import {
  usePositions,
  useCreatePosition,
  useUpdatePosition,
  useDeletePosition,
} from '@/lib/hooks/useHR';
import { Pencil, Trash2, Plus, Lock } from 'lucide-react';

interface PositionRow {
  id: string;
  name: string;
  description: string | null;
  hierarchyLevel: number;
  isSystem: boolean;
  isActive: boolean;
  agencyId: string | null;
  _count?: { employees: number };
}

export default function AdminPersonnelPostesPage() {
  const { data, isLoading } = usePositions();
  const positions: PositionRow[] = (data as any)?.data ?? [];

  const [editing, setEditing] = useState<PositionRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<PositionRow | null>(null);
  const deleteMut = useDeletePosition();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Catalogue des postes de l&apos;organisation. Chaque employe est rattache a un poste qui porte ses permissions.
        </p>
        <Can permission="position.manage">
          <AppButton onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Nouveau poste
          </AppButton>
        </Can>
      </div>

      <AppCard>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2.5">Nom</th>
                <th className="px-4 py-2.5">Description</th>
                <th className="px-4 py-2.5 text-center">Niveau</th>
                <th className="px-4 py-2.5 text-center">Employes</th>
                <th className="px-4 py-2.5 text-center">Permissions</th>
                <th className="px-4 py-2.5 text-center">Statut</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Chargement...
                  </td>
                </tr>
              )}
              {!isLoading && positions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Aucun poste.
                  </td>
                </tr>
              )}
              {positions.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 flex items-center gap-2">
                    {p.isSystem && <Lock className="h-3.5 w-3.5 text-gray-400" />}
                    {p.name}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-md truncate">{p.description ?? '-'}</td>
                  <td className="px-4 py-3 text-center">{p.hierarchyLevel}</td>
                  <td className="px-4 py-3 text-center">{p._count?.employees ?? 0}</td>
                  <td className="px-4 py-3 text-center">
                    {(p as any).permissions?.length ?? 0}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.isActive ? (
                      <AppBadge variant="success">Actif</AppBadge>
                    ) : (
                      <AppBadge variant="outline">Inactif</AppBadge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Can permission="position.manage">
                        <button
                          onClick={() => setEditing(p)}
                          className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                          title="Modifier"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {!p.isSystem && (
                          <button
                            onClick={() => setConfirmDelete(p)}
                            className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </Can>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AppCard>

      {(creating || editing) && (
        <PositionFormDialog
          open
          position={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      <AppAlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Supprimer ce poste ?"
        description={
          confirmDelete
            ? `Le poste "${confirmDelete.name}" sera supprime. Cette action est irreversible.`
            : ''
        }
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        variant="destructive"
        onConfirm={() => {
          if (confirmDelete) {
            deleteMut.mutate(confirmDelete.id);
            setConfirmDelete(null);
          }
        }}
      />
    </div>
  );
}

function PositionFormDialog({
  open,
  position,
  onClose,
}: {
  open: boolean;
  position: PositionRow | null;
  onClose: () => void;
}) {
  const isEdit = !!position;
  const create = useCreatePosition();
  const update = useUpdatePosition();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      name: position?.name ?? '',
      description: position?.description ?? '',
      hierarchyLevel: position?.hierarchyLevel ?? 50,
      isActive: position?.isActive ?? true,
    },
  });
  const onSubmit = (data: any) => {
    const payload = {
      name: data.name,
      description: data.description || undefined,
      hierarchyLevel: Number(data.hierarchyLevel),
    };
    if (isEdit) {
      update.mutate(
        { id: position!.id, data: { ...payload, isActive: data.isActive } },
        { onSuccess: onClose },
      );
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier le poste' : 'Nouveau poste'}
      description={
        isEdit
          ? 'Le rattachement aux permissions se gere depuis l\'onglet "Permissions".'
          : 'Apres creation, vous pourrez assigner ses permissions dans l\'onglet "Permissions".'
      }
      footer={
        <div className="flex justify-end gap-2">
          <AppButton variant="ghost" onClick={onClose}>
            Annuler
          </AppButton>
          <AppButton type="submit" form="position-form" loading={create.isPending || update.isPending}>
            {isEdit ? 'Enregistrer' : 'Creer'}
          </AppButton>
        </div>
      }
    >
      <form id="position-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <AppInput
          label="Nom du poste"
          placeholder="Ex: Chef d'agence, Magasinier, ..."
          {...register('name', { required: true })}
        />
        <AppTextarea
          label="Description"
          rows={3}
          placeholder="Role, responsabilites, ..."
          {...register('description')}
        />
        <AppInput
          label="Niveau hierarchique"
          type="number"
          min={1}
          max={99}
          {...register('hierarchyLevel', { valueAsNumber: true })}
        />
        {isEdit && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded" {...register('isActive')} />
            Actif
          </label>
        )}
      </form>
    </AppDialog>
  );
}
