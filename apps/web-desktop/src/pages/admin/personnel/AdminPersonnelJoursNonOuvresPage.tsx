import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppAlertDialog } from '@/components/ui/AppAlertDialog';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { Can } from '@/lib/components/Can';
import { useHolidays, useCreateHoliday, useDeleteHoliday } from '@/lib/hooks/useHR';
import { searchers } from '@/lib/api/searchers';
import type { HolidayDTO, HolidayScope } from '@/lib/api/hr';
import { Plus, Trash2, Calendar } from 'lucide-react';

const SCOPE_OPTIONS = [
  { value: 'GLOBAL', label: 'Global (toute l\'organisation)' },
  { value: 'AGENCY', label: 'Agence (toute une agence)' },
  { value: 'EMPLOYEE', label: 'Employe (un personnel precis)' },
];

const SCOPE_BADGE: Record<HolidayScope, { label: string; variant: 'info' | 'warning' | 'success' }> = {
  GLOBAL: { label: 'Global', variant: 'info' },
  AGENCY: { label: 'Agence', variant: 'warning' },
  EMPLOYEE: { label: 'Employe', variant: 'success' },
};

export default function AdminPersonnelJoursNonOuvresPage() {
  const [filterScope, setFilterScope] = useState<HolidayScope | ''>('');
  const { data, isLoading } = useHolidays(filterScope ? { scope: filterScope } : undefined);
  const holidays: HolidayDTO[] = (data as any)?.data ?? [];

  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<HolidayDTO | null>(null);
  const deleteMut = useDeleteHoliday();

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-gray-600 max-w-2xl">
          Jours non ouvres : feries, fermetures d&apos;agence, repos individuels. Le personnel n&apos;est ni en retard
          ni absent sur ces dates.
        </p>
        <div className="flex items-center gap-2">
          <div className="w-56">
            <AppSelect
              placeholder="Filtrer par portee"
              options={[{ value: '', label: 'Toutes les portees' }, ...SCOPE_OPTIONS]}
              value={filterScope}
              onValueChange={(v) => setFilterScope((v as HolidayScope) || '')}
            />
          </div>
          <Can permission="holiday.manage">
            <AppButton onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              Ajouter
            </AppButton>
          </Can>
        </div>
      </div>

      <AppCard>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2.5">Nom</th>
                <th className="px-4 py-2.5">Portee</th>
                <th className="px-4 py-2.5">Du</th>
                <th className="px-4 py-2.5">Au</th>
                <th className="px-4 py-2.5 text-center">Recurrent</th>
                <th className="px-4 py-2.5">Motif</th>
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
              {!isLoading && holidays.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    <Calendar className="h-6 w-6 mx-auto mb-2 text-gray-300" />
                    Aucun jour non ouvre.
                  </td>
                </tr>
              )}
              {holidays.map((h) => {
                const badge = SCOPE_BADGE[h.scope];
                return (
                  <tr key={h.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{h.name}</td>
                    <td className="px-4 py-3">
                      <AppBadge variant={badge.variant}>{badge.label}</AppBadge>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(h.fromDate)}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(h.toDate)}</td>
                    <td className="px-4 py-3 text-center">
                      {h.isRecurring ? <AppBadge variant="info">Annuel</AppBadge> : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-md truncate">{h.reason ?? '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <Can permission="holiday.manage">
                        <button
                          onClick={() => setConfirmDelete(h)}
                          className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </Can>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </AppCard>

      {creating && <HolidayFormDialog open onClose={() => setCreating(false)} />}

      <AppAlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Supprimer ce jour non ouvre ?"
        description={confirmDelete ? `"${confirmDelete.name}" sera supprime.` : ''}
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

function HolidayFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateHoliday();
  const { register, handleSubmit, control, watch, reset } = useForm({
    defaultValues: {
      scope: 'GLOBAL' as HolidayScope,
      agencyId: '',
      employeeId: '',
      name: '',
      fromDate: '',
      toDate: '',
      isRecurring: false,
      reason: '',
    },
  });
  const scope = watch('scope');

  const onSubmit = (data: any) => {
    create.mutate(
      {
        scope: data.scope,
        agencyId: data.scope === 'AGENCY' ? data.agencyId : null,
        employeeId: data.scope === 'EMPLOYEE' ? data.employeeId : null,
        name: data.name,
        fromDate: data.fromDate,
        toDate: data.toDate || data.fromDate,
        isRecurring: !!data.isRecurring,
        reason: data.reason || undefined,
      },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
      },
    );
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Nouveau jour non ouvre"
      description="Le personnel ne peut etre marque ni en retard ni absent sur la plage definie."
      footer={
        <div className="flex justify-end gap-2">
          <AppButton variant="ghost" onClick={onClose}>
            Annuler
          </AppButton>
          <AppButton type="submit" form="holiday-form" loading={create.isPending}>
            Creer
          </AppButton>
        </div>
      }
    >
      <form id="holiday-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Controller
          name="scope"
          control={control}
          render={({ field }) => (
            <AppSelect
              label="Portee"
              options={SCOPE_OPTIONS}
              value={field.value}
              onValueChange={field.onChange}
            />
          )}
        />
        {scope === 'AGENCY' && (
          <Controller
            name="agencyId"
            control={control}
            rules={{ required: scope === 'AGENCY' }}
            render={({ field }) => (
              <AppSearchSelect
                label="Agence"
                value={field.value as string | null | undefined}
                onChange={(v) => field.onChange(v ?? '')}
                search={searchers.agencies}
                placeholder="Selectionner une agence"
                required
              />
            )}
          />
        )}
        {scope === 'EMPLOYEE' && (
          <Controller
            name="employeeId"
            control={control}
            rules={{ required: scope === 'EMPLOYEE' }}
            render={({ field }) => (
              <AppSearchSelect
                label="Employe"
                value={field.value as string | null | undefined}
                onChange={(v) => field.onChange(v ?? '')}
                search={searchers.employees}
                placeholder="Selectionner un employe"
                required
              />
            )}
          />
        )}
        <AppInput
          label="Nom"
          placeholder="Ex: 1er janvier, Conge exceptionnel..."
          {...register('name', { required: true })}
        />
        <div className="grid grid-cols-2 gap-3">
          <AppInput label="Du" type="date" {...register('fromDate', { required: true })} />
          <AppInput label="Au (inclus)" type="date" {...register('toDate')} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 rounded" {...register('isRecurring')} />
          Recurrent annuel (l&apos;annee est ignoree)
        </label>
        <AppInput label="Motif (optionnel)" {...register('reason')} />
      </form>
    </AppDialog>
  );
}

function fmtDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: '2-digit' });
  } catch {
    return s;
  }
}
