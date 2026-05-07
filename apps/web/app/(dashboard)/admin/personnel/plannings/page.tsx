'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppAlertDialog } from '@/components/ui/AppAlertDialog';
import { AppCheckbox } from '@/components/ui/AppCheckbox';
import { Can } from '@/lib/components/Can';
import {
  useWorkSchedules,
  useCreateWorkSchedule,
  useUpdateWorkSchedule,
  useDeleteWorkSchedule,
  useSetScheduleDays,
} from '@/lib/hooks/useHR';
import type { WorkScheduleDTO, WorkScheduleDayDTO } from '@/lib/api/hr';
import { Plus, Pencil, Trash2, Save } from 'lucide-react';

const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export default function WorkSchedulesPage() {
  const { data, isLoading } = useWorkSchedules();
  const schedules: WorkScheduleDTO[] = (data as any)?.data ?? [];

  const [selectedId, setSelectedId] = useState<string>('');
  useEffect(() => {
    if (!selectedId && schedules.length > 0) setSelectedId(schedules[0].id);
  }, [schedules, selectedId]);
  const selected = schedules.find((s) => s.id === selectedId) ?? null;

  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<WorkScheduleDTO | null>(null);
  const deleteMut = useDeleteWorkSchedule();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Plannings RH : heures de service par jour. Distincts des heures d&apos;ouverture commerciale.
        </p>
        <Can permission="schedule.manage">
          <AppButton onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Nouveau planning
          </AppButton>
        </Can>
      </div>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <AppCard>
          <div className="p-3 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500 font-semibold">
            Plannings
          </div>
          {isLoading && <div className="p-4 text-sm text-gray-500">Chargement...</div>}
          {!isLoading && schedules.length === 0 && (
            <div className="p-4 text-sm text-gray-500">Aucun planning.</div>
          )}
          <ul className="divide-y divide-gray-100">
            {schedules.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full text-left p-3 hover:bg-gray-50 ${
                    selectedId === s.id ? 'bg-primary-50/60' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm text-gray-900">{s.name}</div>
                    {!s.isActive && <AppBadge variant="outline">Inactif</AppBadge>}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {(s._count?.agencies ?? 0)} agence(s) · {(s._count?.employees ?? 0)} employe(s)
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </AppCard>

        {selected && (
          <ScheduleDaysEditor
            schedule={selected}
            onDelete={() => setConfirmDelete(selected)}
          />
        )}
        {!selected && !isLoading && (
          <AppCard>
            <div className="p-12 text-center text-gray-500 text-sm">
              Selectionnez ou creez un planning pour configurer ses jours.
            </div>
          </AppCard>
        )}
      </div>

      {creating && <ScheduleFormDialog open onClose={() => setCreating(false)} schedule={null} />}

      <AppAlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Supprimer ce planning ?"
        description={
          confirmDelete
            ? `Le planning "${confirmDelete.name}" sera supprime. Operation irreversible.`
            : ''
        }
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        variant="destructive"
        onConfirm={() => {
          if (confirmDelete) {
            deleteMut.mutate(confirmDelete.id, {
              onSuccess: () => {
                if (selectedId === confirmDelete.id) setSelectedId('');
              },
            });
            setConfirmDelete(null);
          }
        }}
      />
    </div>
  );
}

function ScheduleDaysEditor({
  schedule,
  onDelete,
}: {
  schedule: WorkScheduleDTO;
  onDelete: () => void;
}) {
  // Etat local : 7 jours toujours presents (du dimanche au samedi).
  const initialDays = useMemo(() => buildInitialDays(schedule), [schedule]);
  const [days, setDays] = useState<WorkScheduleDayDTO[]>(initialDays);
  useEffect(() => {
    setDays(buildInitialDays(schedule));
  }, [schedule]);

  const setDay = (idx: number, patch: Partial<WorkScheduleDayDTO>) => {
    setDays((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };

  const dirty = useMemo(() => JSON.stringify(initialDays) !== JSON.stringify(days), [initialDays, days]);
  const setMut = useSetScheduleDays();
  const updateMut = useUpdateWorkSchedule();

  const [editingMeta, setEditingMeta] = useState(false);

  return (
    <AppCard>
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <div className="font-semibold text-gray-900">{schedule.name}</div>
          {schedule.description && (
            <div className="text-xs text-gray-500 mt-0.5">{schedule.description}</div>
          )}
        </div>
        <Can permission="schedule.manage">
          <div className="flex items-center gap-1">
            <AppButton variant="ghost" size="sm" onClick={() => setEditingMeta(true)}>
              <Pencil className="h-4 w-4" />
            </AppButton>
            <AppButton variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-red-600" />
            </AppButton>
          </div>
        </Can>
      </div>

      <div className="p-4 space-y-2">
        {days.map((d, idx) => (
          <div
            key={idx}
            className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_120px_1fr_1fr_120px] sm:items-center border border-gray-100 rounded-md p-3"
          >
            <div className="font-medium text-sm">{DAYS[idx]}</div>
            <label className="flex items-center gap-2 text-sm">
              <AppCheckbox
                checked={d.isWorking}
                onCheckedChange={(v) => setDay(idx, { isWorking: !!v })}
              />
              {d.isWorking ? 'Ouvre' : 'Repos'}
            </label>
            <AppInput
              type="time"
              value={d.startTime ?? ''}
              onChange={(e) => setDay(idx, { startTime: e.target.value || null })}
              disabled={!d.isWorking}
              placeholder="Debut"
            />
            <AppInput
              type="time"
              value={d.endTime ?? ''}
              onChange={(e) => setDay(idx, { endTime: e.target.value || null })}
              disabled={!d.isWorking}
              placeholder="Fin"
            />
            <AppInput
              type="number"
              min={0}
              value={d.breakMinutes}
              onChange={(e) => setDay(idx, { breakMinutes: Number(e.target.value || 0) })}
              disabled={!d.isWorking}
              placeholder="Pause (min)"
            />
          </div>
        ))}
      </div>

      <Can permission="schedule.manage">
        <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
          {dirty && <span className="text-sm text-amber-700 self-center">Modifications non enregistrees</span>}
          <AppButton
            disabled={!dirty}
            loading={setMut.isPending}
            onClick={() => setMut.mutate({ id: schedule.id, days })}
          >
            <Save className="h-4 w-4" />
            Enregistrer les jours
          </AppButton>
        </div>
      </Can>

      {editingMeta && (
        <ScheduleFormDialog
          open
          schedule={schedule}
          onClose={() => setEditingMeta(false)}
        />
      )}
    </AppCard>
  );
}

function buildInitialDays(schedule: WorkScheduleDTO): WorkScheduleDayDTO[] {
  const byDow = new Map(schedule.days.map((d) => [d.dayOfWeek, d]));
  return Array.from({ length: 7 }, (_, i) => {
    const d = byDow.get(i);
    return d
      ? {
          dayOfWeek: i,
          startTime: d.startTime ?? null,
          endTime: d.endTime ?? null,
          breakMinutes: d.breakMinutes ?? 0,
          isWorking: d.isWorking,
        }
      : { dayOfWeek: i, startTime: null, endTime: null, breakMinutes: 0, isWorking: false };
  });
}

function ScheduleFormDialog({
  open,
  schedule,
  onClose,
}: {
  open: boolean;
  schedule: WorkScheduleDTO | null;
  onClose: () => void;
}) {
  const isEdit = !!schedule;
  const create = useCreateWorkSchedule();
  const update = useUpdateWorkSchedule();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      name: schedule?.name ?? '',
      description: schedule?.description ?? '',
      timezone: schedule?.timezone ?? '',
    },
  });
  const onSubmit = (data: any) => {
    if (isEdit) {
      update.mutate({ id: schedule!.id, data }, { onSuccess: onClose });
    } else {
      create.mutate(data, { onSuccess: onClose });
    }
  };
  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier le planning' : 'Nouveau planning'}
      footer={
        <div className="flex justify-end gap-2">
          <AppButton variant="ghost" onClick={onClose}>
            Annuler
          </AppButton>
          <AppButton type="submit" form="schedule-form" loading={create.isPending || update.isPending}>
            {isEdit ? 'Enregistrer' : 'Creer'}
          </AppButton>
        </div>
      }
    >
      <form id="schedule-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <AppInput label="Nom" placeholder="Ex: Equipe matin, Standard agence..." {...register('name', { required: true })} />
        <AppInput label="Description (optionnel)" {...register('description')} />
        <AppInput label="Fuseau horaire (optionnel)" placeholder="Africa/Douala" {...register('timezone')} />
      </form>
    </AppDialog>
  );
}
